"""Deterministic post-CAS rollback choreography from Cortex's regression."""

from __future__ import annotations

import asyncio
import sqlite3
import threading
from typing import Any

from .backend import CortexBackend
from .execution import OperationExecutor, OperationOutcome, OperationPlan


class InjectedPostCasRollback(RuntimeError):
    """Injected after the supersession CAS and before its commit."""


async def run_fault_choreography(
    backend: CortexBackend,
    executor: OperationExecutor,
    fault_plan: OperationPlan,
    fault_payload: dict[str, Any],
    peer_plan: OperationPlan | None,
    peer_payload: dict[str, Any] | None,
) -> tuple[OperationOutcome, OperationOutcome | None]:
    if peer_plan is None:
        return await _rollback_alone(backend, executor, fault_plan, fault_payload), None
    if backend.backend == "sqlite":
        return await _sqlite_pair(
            backend, executor, fault_plan, fault_payload, peer_plan, peer_payload
        )
    return await _postgres_pair(
        backend, executor, fault_plan, fault_payload, peer_plan, peer_payload
    )


async def _rollback_alone(
    backend: CortexBackend,
    executor: OperationExecutor,
    plan: OperationPlan,
    payload: dict[str, Any],
) -> OperationOutcome:
    attribute = (
        "_transfer_anchor" if backend.backend == "sqlite" else "_transfer_anchor_on"
    )
    original = getattr(backend.store, attribute)

    def inject(*_args: object) -> None:
        raise InjectedPostCasRollback("fault after supersede compare-and-set")

    setattr(backend.store, attribute, inject)
    try:
        return await executor.run(
            plan, lambda: backend.supersede(payload, int(plan.target_id))
        )
    finally:
        setattr(backend.store, attribute, original)


async def _sqlite_pair(
    backend: CortexBackend,
    executor: OperationExecutor,
    fault_plan: OperationPlan,
    fault_payload: dict[str, Any],
    peer_plan: OperationPlan,
    peer_payload: dict[str, Any] | None,
) -> tuple[OperationOutcome, OperationOutcome]:
    assert peer_payload is not None
    peer_ready = threading.Event()
    fault_window = threading.Event()
    first_attempt_finished = threading.Event()
    rollback_finished = threading.Event()
    original = backend.store._transfer_anchor

    def inject(_head_id: int, _new_id: int) -> None:
        fault_window.set()
        first_attempt_finished.wait()
        raise InjectedPostCasRollback("fault after supersede compare-and-set")

    async def fault_call() -> dict[str, Any]:
        async def handler(_args: dict[str, Any]) -> dict[str, Any]:
            peer_ready.wait()
            new_id, head_id = backend.store.supersede_atomic(
                fault_payload, int(fault_plan.target_id)
            )
            return {"acknowledged": True, "memory_id": new_id, "head_id": head_id}

        try:
            return await backend.safe_call(handler, {}, "remember")
        finally:
            rollback_finished.set()

    async def peer_call() -> dict[str, Any]:
        async def handler(_args: dict[str, Any]) -> dict[str, Any]:
            backend.store._raw_conn.execute("PRAGMA busy_timeout=0")
            peer_ready.set()
            fault_window.wait()
            try:
                memory_id = backend.store.insert_memory(peer_payload)
            except sqlite3.OperationalError as exc:
                if "locked" not in str(exc).lower():
                    raise
                executor.retry(
                    peer_plan, attempt=1, reason="sqlite_busy_before_fault_rollback"
                )
                first_attempt_finished.set()
                rollback_finished.wait()
                memory_id = backend.store.insert_memory(peer_payload)
            else:
                first_attempt_finished.set()
            return {"acknowledged": True, "memory_id": memory_id}

        return await backend.safe_call(handler, {}, "remember")

    backend.store._transfer_anchor = inject
    try:
        peer_task = asyncio.create_task(executor.run(peer_plan, peer_call))
        await asyncio.sleep(0)
        fault_task = asyncio.create_task(executor.run(fault_plan, fault_call))
        fault_outcome, peer_outcome = await asyncio.gather(fault_task, peer_task)
        return fault_outcome, peer_outcome
    finally:
        backend.store._transfer_anchor = original


async def _postgres_pair(
    backend: CortexBackend,
    executor: OperationExecutor,
    fault_plan: OperationPlan,
    fault_payload: dict[str, Any],
    peer_plan: OperationPlan,
    peer_payload: dict[str, Any] | None,
) -> tuple[OperationOutcome, OperationOutcome]:
    assert peer_payload is not None
    peer_ready = threading.Event()
    fault_window = threading.Event()
    peer_attempting = threading.Event()
    original = backend.store._transfer_anchor_on

    def inject(_conn: object, _head_id: int, _new_id: int) -> None:
        fault_window.set()
        peer_attempting.wait()
        raise InjectedPostCasRollback("fault after supersede compare-and-set")

    async def fault_call() -> dict[str, Any]:
        async def handler(_args: dict[str, Any]) -> dict[str, Any]:
            peer_ready.wait()
            new_id, head_id = backend.store.supersede_atomic(
                fault_payload, int(fault_plan.target_id)
            )
            return {"acknowledged": True, "memory_id": new_id, "head_id": head_id}

        return await backend.safe_call(handler, {}, "remember")

    async def peer_call() -> dict[str, Any]:
        async def handler(_args: dict[str, Any]) -> dict[str, Any]:
            peer_ready.set()
            fault_window.wait()
            peer_attempting.set()
            memory_id = backend.store.insert_memory(peer_payload)
            return {"acknowledged": True, "memory_id": memory_id}

        return await backend.safe_call(handler, {}, "remember")

    backend.store._transfer_anchor_on = inject
    try:
        peer_task = asyncio.create_task(executor.run(peer_plan, peer_call))
        await asyncio.sleep(0)
        fault_task = asyncio.create_task(executor.run(fault_plan, fault_call))
        fault_outcome, peer_outcome = await asyncio.gather(fault_task, peer_task)
        return fault_outcome, peer_outcome
    finally:
        backend.store._transfer_anchor_on = original
