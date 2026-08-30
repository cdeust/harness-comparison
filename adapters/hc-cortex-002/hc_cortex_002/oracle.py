"""Fresh-process oracle that reconciles the immutable workload journal."""

from __future__ import annotations

import asyncio
import hashlib
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .backend import CortexBackend
from .provenance import (
    ZERO_MODEL_TOOL_COST,
    cortex_runtime_identity,
    database_identity,
    json_safe_error,
    verified_postgres_service,
)
from .journal import ChainJournal, read_verified
from .oracle_checks import reconcile
from .oracle_snapshot import observe_persisted_state


@dataclass(frozen=True)
class OracleConfig:
    backend: str
    database: str
    concurrency: int
    operations_per_type: int
    run_id: str
    output_dir: Path
    identities: dict[str, str]
    postgresql_service_instance_id: str
    postgresql_service_started_at: str


class Oracle:
    def __init__(self, config: OracleConfig) -> None:
        self.config = config
        self.path = config.output_dir / f"{config.run_id}.oracle.jsonl"
        self.workload_path = config.output_dir / f"{config.run_id}.workload.jsonl"
        self.journal = ChainJournal(self.path, config.identities)
        self.backend: CortexBackend | None = None
        self.boot_nonce = str(uuid.uuid4())

    async def run(self) -> dict[str, Any]:
        database_hash = database_identity(self.config.backend, self.config.database)
        postgresql_service = verified_postgres_service(
            self.config.backend,
            self.config.database,
            self.config.postgresql_service_instance_id,
            self.config.postgresql_service_started_at,
        )
        self.journal.record(
            "process_start",
            mode="oracle",
            pid=os.getpid(),
            boot_nonce=self.boot_nonce,
            backend=self.config.backend,
            database_identity_sha256=database_hash,
            concurrency=self.config.concurrency,
            operations_per_type=self.config.operations_per_type,
            run_id=self.config.run_id,
            runtime=cortex_runtime_identity(),
            postgresql_service=postgresql_service,
        )
        try:
            workload_digest = hashlib.sha256(
                self.workload_path.read_bytes()
            ).hexdigest()
            records = read_verified(self.workload_path)
            self.journal.record(
                "workload_ledger_verified",
                workload_sha256=workload_digest,
                workload_records=len(records),
            )
            self.backend = CortexBackend(self.config.backend, self.config.database)
            snapshot = await observe_persisted_state(self.backend, self.config.run_id)
            result = reconcile(
                records,
                snapshot,
                backend=self.config.backend,
                concurrency=self.config.concurrency,
                operations_per_type=self.config.operations_per_type,
                oracle_boot_nonce=self.boot_nonce,
                oracle_process_instance_id=self.config.identities[
                    "process_instance_id"
                ],
                expected_identities=self.config.identities,
                database_identity_sha256=database_hash,
                oracle_postgresql_service=postgresql_service,
            )
            observations = dict(snapshot)
            observations["model_tool_cost"] = dict(ZERO_MODEL_TOOL_COST)
            self.journal.record(
                "oracle_result",
                verdict=result["verdict"],
                checks=result["checks"],
                observations=observations,
            )
            self.backend.close()
            self.backend = None
            self.journal.record(
                "terminal",
                state="complete",
                verdict=result["verdict"],
                store_closed=True,
            )
            return {
                "ledger_path": self.path.name,
                "status": "complete",
                "verdict": result["verdict"],
            }
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit) as exc:
            self._close_backend()
            self.journal.record(
                "terminal",
                state="indeterminate",
                verdict="blocked",
                error=json_safe_error(exc),
                store_closed=self.backend is None,
            )
            raise
        except Exception as exc:
            self._close_backend()
            self.journal.record(
                "terminal",
                state="failed",
                verdict="blocked",
                error=json_safe_error(exc),
                store_closed=self.backend is None,
            )
            raise
        finally:
            self.journal.close()

    def _close_backend(self) -> None:
        if self.backend is None:
            return
        try:
            self.backend.close()
        finally:
            self.backend = None
