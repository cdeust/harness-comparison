"""Deterministic closed-loop scheduling for the ordinary load mix."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from .backend import CortexBackend, marker
from .execution import OperationExecutor, OperationOutcome, OperationPlan


@dataclass(frozen=True)
class ScheduledOperation:
    plan: OperationPlan
    call: Callable[[], Awaitable[dict[str, Any]]]


async def schedule_remaining_operations(
    *,
    backend: CortexBackend,
    executor: OperationExecutor,
    run_id: str,
    operations_per_type: int,
    concurrency: int,
    supersede_targets: list[int],
    delete_targets: list[int],
    peer_remember_ran: bool,
) -> list[OperationOutcome]:
    """Run at most C operations; each worker submits only after termination."""
    operations = _operation_mix(
        backend=backend,
        run_id=run_id,
        operations_per_type=operations_per_type,
        supersede_targets=supersede_targets,
        delete_targets=delete_targets,
        peer_remember_ran=peer_remember_ran,
    )
    if not operations:
        return []
    if concurrency < 1:
        raise ValueError("closed-loop concurrency must be positive")

    cursor = 0
    results: list[OperationOutcome | None] = [None] * len(operations)
    worker_count = min(concurrency, len(operations))
    cohort_ready = 0
    cohort_release = asyncio.Event()
    executor.journal.record(
        "scheduler_cohort",
        phase="load",
        policy="closed_loop_fixed_workers",
        worker_count=worker_count,
        initial_operation_types=[
            operation.plan.operation for operation in operations[:worker_count]
        ],
        gate_boundary="after durable intent and before safe_handler admission",
    )

    async def initial_cohort_call(
        call: Callable[[], Awaitable[dict[str, Any]]],
    ) -> dict[str, Any]:
        nonlocal cohort_ready
        cohort_ready += 1
        if cohort_ready == worker_count:
            cohort_release.set()
        await cohort_release.wait()
        return await call()

    async def worker() -> None:
        nonlocal cursor
        while cursor < len(operations):
            index = cursor
            cursor += 1
            scheduled = operations[index]
            call = scheduled.call
            if index < worker_count:

                async def call_with_gate(
                    cohort_call: Callable[[], Awaitable[dict[str, Any]]] = call,
                ) -> dict[str, Any]:
                    return await initial_cohort_call(cohort_call)

                call = call_with_gate
            results[index] = await executor.run(scheduled.plan, call)

    workers = [asyncio.create_task(worker()) for _ in range(worker_count)]
    await asyncio.gather(*workers)
    if any(result is None for result in results):
        raise RuntimeError("closed-loop scheduler returned before every operation")
    return [result for result in results if result is not None]


def _operation_mix(
    *,
    backend: CortexBackend,
    run_id: str,
    operations_per_type: int,
    supersede_targets: list[int],
    delete_targets: list[int],
    peer_remember_ran: bool,
) -> list[ScheduledOperation]:
    operations: list[ScheduledOperation] = []
    first_remember = 1 if peer_remember_ran else 0
    for index in range(first_remember, operations_per_type):
        operations.append(_remember(backend, run_id, index))
    for index in range(operations_per_type):
        operations.append(
            _supersede(backend, run_id, index, int(supersede_targets[index]))
        )
    for index in range(operations_per_type):
        operations.append(_forget(backend, run_id, index, int(delete_targets[index])))
    return operations


def _remember(backend: CortexBackend, run_id: str, index: int) -> ScheduledOperation:
    operation_id = f"{run_id}:remember:{index}"
    content = marker(run_id, operation_id, "acknowledged")
    plan = OperationPlan(operation_id, "remember", "load", marker=content, index=index)
    payload = backend.memory_payload(
        run_id=run_id, operation_id=operation_id, marker=content
    )
    return ScheduledOperation(plan, lambda: backend.remember(payload))


def _supersede(
    backend: CortexBackend, run_id: str, index: int, target_id: int
) -> ScheduledOperation:
    operation_id = f"{run_id}:supersede_atomic:{index}"
    content = marker(run_id, operation_id, "acknowledged")
    plan = OperationPlan(
        operation_id,
        "supersede_atomic",
        "load",
        marker=content,
        target_id=target_id,
        index=index,
    )
    payload = backend.memory_payload(
        run_id=run_id, operation_id=operation_id, marker=content
    )
    return ScheduledOperation(plan, lambda: backend.supersede(payload, target_id))


def _forget(
    backend: CortexBackend, run_id: str, index: int, target_id: int
) -> ScheduledOperation:
    operation_id = f"{run_id}:forget:{index}"
    plan = OperationPlan(
        operation_id,
        "forget",
        "load",
        target_id=target_id,
        index=index,
    )
    return ScheduledOperation(plan, lambda: backend.forget(target_id))
