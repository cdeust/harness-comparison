"""HC-CORTEX-002 setup, measured load, fault, and recovery workflow."""

from __future__ import annotations

import asyncio
import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .admission_observer import AdmissionObserver
from .backend import CortexBackend, marker
from .provenance import (
    DatabaseFreshnessError,
    ZERO_MODEL_TOOL_COST,
    cortex_runtime_identity,
    database_freshness_observation,
    database_identity,
    json_safe_error,
    verified_postgres_service,
)
from .execution import OperationExecutor, OperationOutcome, OperationPlan
from .fault import run_fault_choreography
from .journal import ChainJournal
from .metrics import LoadMetrics, usage_delta, usage_snapshot
from .workload_schedule import schedule_remaining_operations


@dataclass(frozen=True)
class WorkloadConfig:
    backend: str
    database: str
    concurrency: int
    operations_per_type: int
    run_id: str
    output_dir: Path
    identities: dict[str, str]
    postgresql_service_instance_id: str
    postgresql_service_started_at: str


class Workload:
    def __init__(self, config: WorkloadConfig) -> None:
        self.config = config
        self.path = config.output_dir / f"{config.run_id}.workload.jsonl"
        self.journal = ChainJournal(self.path, config.identities)
        self.metrics = LoadMetrics()
        self.executor = OperationExecutor(self.journal, self.metrics)
        self.backend: CortexBackend | None = None
        self.boot_nonce = str(uuid.uuid4())

    async def run(self) -> dict[str, Any]:
        before_usage = usage_snapshot()
        terminal_written = False
        try:
            postgresql_service = verified_postgres_service(
                self.config.backend,
                self.config.database,
                self.config.postgresql_service_instance_id,
                self.config.postgresql_service_started_at,
            )
            self.journal.record(
                "process_start",
                mode="workload",
                pid=os.getpid(),
                boot_nonce=self.boot_nonce,
                backend=self.config.backend,
                database_identity_sha256=database_identity(
                    self.config.backend, self.config.database
                ),
                concurrency=self.config.concurrency,
                operations_per_type=self.config.operations_per_type,
                run_id=self.config.run_id,
                runtime=cortex_runtime_identity(),
                postgresql_service=postgresql_service,
            )
            freshness = self._preflight()
            if not freshness["empty"]:
                raise DatabaseFreshnessError(
                    "benchmark database is not fresh: "
                    f"observed {freshness['user_relation_count']} user relation(s)"
                )
            self.backend = CortexBackend(self.config.backend, self.config.database)
            observer = AdmissionObserver(self.metrics)
            with observer.installed():
                seeds = await self._setup_seeds()
                self.backend.reset_connection_peak()
                load_started_ns = time.monotonic_ns()
                await self._load(seeds)
                load_finished_ns = time.monotonic_ns()
                load_elapsed_ns = load_finished_ns - load_started_ns
                if load_elapsed_ns < 0:
                    raise RuntimeError("monotonic load duration became negative")
                self.journal.record(
                    "load_window",
                    start_monotonic_ns=str(load_started_ns),
                    end_monotonic_ns=str(load_finished_ns),
                    elapsed_ns=str(load_elapsed_ns),
                )
                load_connections = self.backend.connection_count()
                recovery = await self._recovery()
            after_usage = usage_snapshot()
            observations = {
                "load": self.metrics.summary(load_elapsed_ns),
                "recovery": {
                    "outcome": recovery.outcome,
                    "timing": recovery.timing,
                    "result": recovery.result,
                    "state_change": "none; read-only count observation",
                },
                "resources": usage_delta(before_usage, after_usage),
                "storage_bytes": self.backend.storage_bytes(),
                "connections": load_connections,
                "model_tool_cost": dict(ZERO_MODEL_TOOL_COST),
            }
            self.journal.record("measurement_summary", observations=observations)
            self.backend.close()
            self.backend = None
            self.journal.record(
                "terminal",
                state="complete",
                resolution="pending_oracle",
                store_closed=True,
            )
            terminal_written = True
            return {
                "ledger_path": self.path.name,
                "status": "complete",
                "verdict": "pending",
            }
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit) as exc:
            self._close_backend()
            self.journal.record(
                "terminal",
                state="indeterminate",
                resolution="requires_reconciliation",
                error=json_safe_error(exc),
                store_closed=self.backend is None,
            )
            terminal_written = True
            raise
        except Exception as exc:
            self._close_backend()
            self.journal.record(
                "terminal",
                state="failed",
                resolution="requires_oracle_reconciliation",
                error=json_safe_error(exc),
                store_closed=self.backend is None,
            )
            terminal_written = True
            raise
        finally:
            if not terminal_written:
                self._close_backend()
            self.journal.close()

    def _preflight(self) -> dict[str, Any]:
        try:
            observation = database_freshness_observation(
                self.config.backend, self.config.database
            )
        except Exception as exc:
            observation = {
                "checked_before_store_initialization": False,
                "method": "unavailable",
                "empty": None,
                "user_relation_count": None,
                "error": json_safe_error(exc),
            }
            self.journal.record("backend_preflight", observation=observation)
            raise
        self.journal.record("backend_preflight", observation=observation)
        return observation

    async def _setup_seeds(self) -> dict[str, Any]:
        supersede: list[int] = []
        delete: list[int] = []
        for role, destination in (
            ("supersede_target", supersede),
            ("delete_target", delete),
        ):
            for index in range(self.config.operations_per_type):
                outcome = await self._seed(role, index)
                destination.append(self._require_memory_id(outcome))
        fault = await self._seed("fault_target", 0)
        return {
            "supersede": supersede,
            "delete": delete,
            "fault": self._require_memory_id(fault),
        }

    async def _seed(self, role: str, index: int) -> OperationOutcome:
        operation_id = f"{self.config.run_id}:setup_seed:{role}:{index}"
        content = marker(self.config.run_id, operation_id, "seed")
        plan = OperationPlan(
            operation_id,
            "setup_seed",
            "setup",
            marker=content,
            role=role,
            index=index,
        )
        payload = self._backend.memory_payload(
            run_id=self.config.run_id,
            operation_id=operation_id,
            marker=content,
        )
        return await self.executor.run(plan, lambda: self._backend.remember(payload))

    async def _load(self, seeds: dict[str, Any]) -> None:
        fault_id = f"{self.config.run_id}:faulted_supersede:0"
        fault_marker = marker(self.config.run_id, fault_id, "rejected")
        fault_plan = OperationPlan(
            fault_id,
            "faulted_supersede",
            "load",
            marker=fault_marker,
            target_id=int(seeds["fault"]),
            index=0,
        )
        fault_payload = self._backend.memory_payload(
            run_id=self.config.run_id,
            operation_id=fault_id,
            marker=fault_marker,
        )
        peer_plan, peer_payload = self._peer_remember()
        await run_fault_choreography(
            self._backend,
            self.executor,
            fault_plan,
            fault_payload,
            peer_plan,
            peer_payload,
        )
        await schedule_remaining_operations(
            backend=self._backend,
            executor=self.executor,
            run_id=self.config.run_id,
            operations_per_type=self.config.operations_per_type,
            concurrency=self.config.concurrency,
            supersede_targets=seeds["supersede"],
            delete_targets=seeds["delete"],
            peer_remember_ran=peer_plan is not None,
        )

    def _peer_remember(self) -> tuple[OperationPlan | None, dict[str, Any] | None]:
        if self.config.concurrency < 2:
            return None, None
        operation_id = f"{self.config.run_id}:remember:0"
        content = marker(self.config.run_id, operation_id, "acknowledged")
        plan = OperationPlan(
            operation_id, "remember", "load", marker=content, index=0, role="fault_peer"
        )
        payload = self._backend.memory_payload(
            run_id=self.config.run_id,
            operation_id=operation_id,
            marker=content,
        )
        return plan, payload

    async def _recovery(self) -> OperationOutcome:
        operation_id = f"{self.config.run_id}:recovery_health:0"
        plan = OperationPlan(
            operation_id,
            "recovery_health",
            "recovery",
            index=0,
        )
        return await self.executor.run(
            plan, lambda: self._backend.health_observation(self.config.run_id)
        )

    @property
    def _backend(self) -> CortexBackend:
        if self.backend is None:
            raise RuntimeError("backend is not open")
        return self.backend

    @staticmethod
    def _require_memory_id(outcome: OperationOutcome) -> int:
        if outcome.outcome != "acknowledged" or not outcome.result:
            raise RuntimeError(
                f"setup operation {outcome.operation_id} was not acknowledged"
            )
        memory_id = outcome.result.get("memory_id")
        if not isinstance(memory_id, int):
            raise RuntimeError(
                f"setup operation {outcome.operation_id} returned no integer ID"
            )
        return memory_id

    def _close_backend(self) -> None:
        if self.backend is None:
            return
        try:
            self.backend.close()
        finally:
            self.backend = None
