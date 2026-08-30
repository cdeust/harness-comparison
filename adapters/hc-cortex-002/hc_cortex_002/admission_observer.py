"""Observe Cortex's real safe_handler admission boundary without replacing it."""

from __future__ import annotations

import time
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from .metrics import LoadMetrics


@dataclass
class AdmissionState:
    operation_id: str
    phase: str
    entered_ns: int | None = None
    acquired_ns: int | None = None
    released_ns: int | None = None
    tool_name: str | None = None
    queued: bool = False
    budget: int | None = None


_current_operation: ContextVar[AdmissionState | None] = ContextVar(
    "hc_cortex_002_operation", default=None
)


@contextmanager
def bind_operation(state: AdmissionState) -> Iterator[None]:
    token = _current_operation.set(state)
    try:
        yield
    finally:
        _current_operation.reset(token)


class AdmissionObserver:
    """Wrap the imported source context manager and retain its exact semantics."""

    def __init__(self, metrics: LoadMetrics) -> None:
        self.metrics = metrics
        self._active: dict[str, int] = {}

    @contextmanager
    def installed(self) -> Iterator[None]:
        import mcp_server.tool_error_handler as error_handler
        from mcp_server.handlers.admission import current_budget

        original = error_handler.admit

        @asynccontextmanager
        async def observed(tool_name: str) -> Any:
            state = _current_operation.get()
            if state is None:
                async with original(tool_name):
                    yield
                return
            if state.entered_ns is not None:
                raise RuntimeError("one operation crossed admission more than once")
            state.entered_ns = time.monotonic_ns()
            state.tool_name = tool_name
            state.budget = int(current_budget(tool_name))
            state.queued = self._active.get(tool_name, 0) >= state.budget
            if state.phase == "load":
                self.metrics.admission_wait_started(queued=state.queued)
            acquired = False
            try:
                async with original(tool_name):
                    acquired = True
                    state.acquired_ns = time.monotonic_ns()
                    self._active[tool_name] = self._active.get(tool_name, 0) + 1
                    if state.phase == "load":
                        self.metrics.admission_acquired(queued=state.queued)
                    try:
                        yield
                    finally:
                        state.released_ns = time.monotonic_ns()
                        remaining = self._active[tool_name] - 1
                        if remaining:
                            self._active[tool_name] = remaining
                        else:
                            self._active.pop(tool_name)
            except BaseException:
                if not acquired and state.phase == "load":
                    self.metrics.admission_abandoned(queued=state.queued)
                raise

        error_handler.admit = observed
        try:
            yield
        finally:
            error_handler.admit = original
