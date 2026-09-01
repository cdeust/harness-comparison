"""Intent-before-effect operation execution and timing records."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from .admission_observer import AdmissionState, bind_operation
from .journal import ChainJournal
from .metrics import LoadMetrics
from .provenance import json_safe_error


@dataclass(frozen=True)
class OperationPlan:
    operation_id: str
    operation: str
    phase: str
    marker: str | None = None
    target_id: int | None = None
    role: str | None = None
    index: int | None = None


@dataclass(frozen=True)
class OperationOutcome:
    operation_id: str
    outcome: str
    result: dict[str, Any] | None
    timing: dict[str, Any]


class OperationExecutor:
    def __init__(self, journal: ChainJournal, metrics: LoadMetrics) -> None:
        self.journal = journal
        self.metrics = metrics

    async def run(
        self,
        plan: OperationPlan,
        call: Callable[[], Awaitable[dict[str, Any]]],
    ) -> OperationOutcome:
        intent = self.journal.record(
            "operation_intent",
            operation_id=plan.operation_id,
            operation=plan.operation,
            phase=plan.phase,
            marker=plan.marker,
            target_id=plan.target_id,
            role=plan.role,
            index=plan.index,
            fsync_before_operation=True,
        )
        enqueued_ns = int(intent["monotonic_ns"])
        measured = plan.phase == "load"
        admission = AdmissionState(plan.operation_id, plan.phase)
        if measured:
            self.metrics.dispatcher_started()
        try:
            with bind_operation(admission):
                return await self._run_service(
                    plan, call, enqueued_ns, measured, admission
                )
        finally:
            if measured:
                self.metrics.dispatcher_finished()

    async def _run_service(
        self,
        plan: OperationPlan,
        call: Callable[[], Awaitable[dict[str, Any]]],
        enqueued_ns: int,
        measured: bool,
        admission: AdmissionState,
    ) -> OperationOutcome:
        result: dict[str, Any] | None = None
        error: dict[str, str] | None = None
        should_reraise: BaseException | None = None
        try:
            result = await call()
            outcome = (
                "acknowledged" if result.get("acknowledged") is True else "rejected"
            )
        except asyncio.CancelledError as exc:
            outcome = "indeterminate"
            error = json_safe_error(exc)
            should_reraise = exc
        except (KeyboardInterrupt, SystemExit) as exc:
            outcome = "indeterminate"
            error = json_safe_error(exc)
            should_reraise = exc
        except Exception as exc:  # completed safe_handler boundary => rejected
            outcome = "rejected"
            error = json_safe_error(exc)
        finished_ns = time.monotonic_ns()
        timing = self._timing(enqueued_ns, finished_ns, admission)
        if admission.entered_ns is None or admission.acquired_ns is None:
            outcome = "indeterminate"
            error = {
                "type": "AdmissionObservationMissing",
                "message": "operation did not cross the observed source admission boundary",
            }
        self.journal.record(
            "operation_outcome",
            operation_id=plan.operation_id,
            operation=plan.operation,
            phase=plan.phase,
            outcome=outcome,
            timing=timing,
            admission={
                "observed": admission.entered_ns is not None
                and admission.acquired_ns is not None,
                "tool_name": admission.tool_name,
                "budget": admission.budget,
                "entered_monotonic_ns": str(admission.entered_ns),
                "acquired_monotonic_ns": str(admission.acquired_ns),
                "released_monotonic_ns": str(admission.released_ns),
                "queued": (
                    admission.queued
                    if admission.entered_ns is not None
                    and admission.acquired_ns is not None
                    else None
                ),
            },
            result=result,
            error=error,
        )
        if measured:
            self.metrics.outcome(
                operation=plan.operation,
                outcome=outcome,
                has_error=error is not None,
                queue_ns=timing["queue_ns"],
                service_ns=timing["service_ns"],
                total_ns=timing["total_ns"],
            )
        if should_reraise is not None:
            raise should_reraise
        return OperationOutcome(plan.operation_id, outcome, result, timing)

    @staticmethod
    def _timing(
        enqueued_ns: int, finished_ns: int, admission: AdmissionState
    ) -> dict[str, Any]:
        total_ns = finished_ns - enqueued_ns
        if admission.entered_ns is None or admission.acquired_ns is None:
            if total_ns < 0:
                raise RuntimeError("monotonic total latency became negative")
            return {
                "pre_admission_ns": None,
                "queue_ns": None,
                "service_ns": None,
                "total_ns": total_ns,
            }
        timing = {
            "pre_admission_ns": admission.entered_ns - enqueued_ns,
            "queue_ns": admission.acquired_ns - admission.entered_ns,
            "service_ns": finished_ns - admission.acquired_ns,
            "total_ns": total_ns,
        }
        if any(value < 0 for value in timing.values()):
            raise RuntimeError("monotonic operation latency became negative")
        return timing

    def retry(
        self,
        plan: OperationPlan,
        *,
        attempt: int,
        reason: str,
    ) -> None:
        self.metrics.retry(plan.operation)
        self.journal.record(
            "operation_retry",
            operation_id=plan.operation_id,
            operation=plan.operation,
            phase=plan.phase,
            attempt=attempt,
            reason=reason,
        )
