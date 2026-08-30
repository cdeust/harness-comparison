"""Measurement primitives with no performance pass/fail thresholds."""

from __future__ import annotations

import math
import os
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:  # POSIX only; absence is an observed capability, never fabricated.
    import resource as _resource
except ImportError:  # pragma: no cover - exercised by the explicit fallback test
    _resource = None


QUANTILE_METHOD = "Hyndman-Fan type 1 (inverse empirical distribution function)"
THROUGHPUT_DENOMINATOR = "common measured load wall time"


def quantile_type1(values: list[int], probability: float) -> int:
    """Hyndman-Fan type 1: x[ceil(n*p)], with endpoint clipping."""
    if not values:
        raise ValueError("at least one observation is required")
    if not 0.0 <= probability <= 1.0:
        raise ValueError("probability must be in [0, 1]")
    ordered = sorted(values)
    if probability == 0.0:
        return ordered[0]
    rank = min(len(ordered), math.ceil(len(ordered) * probability))
    return ordered[rank - 1]


@dataclass(frozen=True)
class UsageSnapshot:
    user_seconds: float
    system_seconds: float
    max_rss_bytes: int | None
    max_rss_observation: str


def usage_snapshot() -> UsageSnapshot:
    process_times = os.times()
    if _resource is None:
        return UsageSnapshot(
            user_seconds=process_times.user,
            system_seconds=process_times.system,
            max_rss_bytes=None,
            max_rss_observation="unavailable: Python resource module absent",
        )
    usage = _resource.getrusage(_resource.RUSAGE_SELF)
    rss_multiplier = 1 if sys.platform == "darwin" else 1024
    return UsageSnapshot(
        user_seconds=process_times.user,
        system_seconds=process_times.system,
        max_rss_bytes=int(usage.ru_maxrss) * rss_multiplier,
        max_rss_observation="observed via getrusage(RUSAGE_SELF)",
    )


def usage_delta(before: UsageSnapshot, after: UsageSnapshot) -> dict[str, Any]:
    return {
        "user_seconds": after.user_seconds - before.user_seconds,
        "system_seconds": after.system_seconds - before.system_seconds,
        "max_rss_bytes": after.max_rss_bytes,
        "max_rss_observation": after.max_rss_observation,
    }


@dataclass
class _MetricBucket:
    total_ns: list[int] = field(default_factory=list)
    service_ns: list[int] = field(default_factory=list)
    queue_ns: list[int] = field(default_factory=list)
    outcomes: dict[str, int] = field(default_factory=dict)
    retry_events: int = 0
    error_events: int = 0

    def outcome(
        self,
        *,
        outcome: str,
        queue_ns: int | None,
        service_ns: int | None,
        total_ns: int,
        has_error: bool,
    ) -> None:
        if total_ns < 0 or any(
            value is not None and value < 0 for value in (queue_ns, service_ns)
        ):
            raise ValueError("latency observations cannot be negative")
        self.total_ns.append(total_ns)
        if queue_ns is not None:
            self.queue_ns.append(queue_ns)
        if service_ns is not None:
            self.service_ns.append(service_ns)
        self.outcomes[outcome] = self.outcomes.get(outcome, 0) + 1
        self.error_events += int(has_error)


class LoadMetrics:
    """Thread-safe timing, admission, and retry accumulator for measured load."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._aggregate = _MetricBucket()
        self._by_operation: dict[str, _MetricBucket] = {}
        self._admission_waiting = 0
        self._max_queue_depth = 0
        self._dispatcher_inflight = 0
        self._max_dispatcher_inflight = 0

    def admission_wait_started(self, *, queued: bool) -> None:
        if not queued:
            return
        with self._lock:
            self._admission_waiting += 1
            self._max_queue_depth = max(self._max_queue_depth, self._admission_waiting)

    def admission_acquired(self, *, queued: bool) -> None:
        if not queued:
            return
        with self._lock:
            if self._admission_waiting <= 0:
                raise RuntimeError("queue accounting would become negative")
            self._admission_waiting -= 1

    def admission_abandoned(self, *, queued: bool) -> None:
        if not queued:
            return
        with self._lock:
            if self._admission_waiting <= 0:
                raise RuntimeError("queue accounting would become negative")
            self._admission_waiting -= 1

    def dispatcher_started(self) -> None:
        with self._lock:
            self._dispatcher_inflight += 1
            self._max_dispatcher_inflight = max(
                self._max_dispatcher_inflight, self._dispatcher_inflight
            )

    def dispatcher_finished(self) -> None:
        with self._lock:
            if self._dispatcher_inflight <= 0:
                raise RuntimeError("dispatcher accounting would become negative")
            self._dispatcher_inflight -= 1

    def outcome(
        self,
        *,
        operation: str,
        outcome: str,
        queue_ns: int | None,
        service_ns: int | None,
        total_ns: int,
        has_error: bool = False,
    ) -> None:
        with self._lock:
            values = {
                "outcome": outcome,
                "queue_ns": queue_ns,
                "service_ns": service_ns,
                "total_ns": total_ns,
                "has_error": has_error,
            }
            self._aggregate.outcome(**values)
            self._by_operation.setdefault(operation, _MetricBucket()).outcome(**values)

    def retry(self, operation: str) -> None:
        with self._lock:
            self._aggregate.retry_events += 1
            self._by_operation.setdefault(operation, _MetricBucket()).retry_events += 1

    def summary(self, elapsed_ns: int) -> dict[str, Any]:
        if elapsed_ns < 0:
            raise ValueError("measured load elapsed time cannot be negative")
        with self._lock:
            aggregate = self._bucket_summary(self._aggregate, elapsed_ns)
            per_operation = {
                operation: self._bucket_summary(bucket, elapsed_ns)
                for operation, bucket in sorted(self._by_operation.items())
            }
            return {
                **aggregate,
                "elapsed_ns": elapsed_ns,
                "throughput_denominator": THROUGHPUT_DENOMINATOR,
                "latency_quantile_method": QUANTILE_METHOD,
                "max_queue_depth": self._max_queue_depth,
                "queue_boundary": "Cortex safe_handler source admission semaphore",
                "max_dispatcher_inflight": self._max_dispatcher_inflight,
                "per_operation_type": per_operation,
            }

    @classmethod
    def _bucket_summary(cls, bucket: _MetricBucket, elapsed_ns: int) -> dict[str, Any]:
        completed = sum(bucket.outcomes.values())
        throughput = completed / (elapsed_ns / 1_000_000_000) if elapsed_ns else None
        return {
            "completed_operations": completed,
            "elapsed_ns": elapsed_ns,
            "throughput_operations_per_second": throughput,
            "throughput_denominator": THROUGHPUT_DENOMINATOR,
            "latency_quantile_method": QUANTILE_METHOD,
            "total_latency_ns": cls._quantiles(bucket.total_ns),
            "service_latency_ns": cls._quantiles(bucket.service_ns),
            "queue_latency_ns": cls._quantiles(bucket.queue_ns),
            "outcomes": dict(sorted(bucket.outcomes.items())),
            "error_events": bucket.error_events,
            "retry_events": bucket.retry_events,
        }

    @staticmethod
    def _quantiles(values: list[int]) -> dict[str, int] | None:
        if not values:
            return None
        return {
            "p50": quantile_type1(values, 0.50),
            "p95": quantile_type1(values, 0.95),
            "p99": quantile_type1(values, 0.99),
        }


def sqlite_storage_bytes(database: str) -> dict[str, int]:
    path = Path(database).expanduser().resolve()
    paths = {
        "database": path,
        "wal": Path(f"{path}-wal"),
        "shm": Path(f"{path}-shm"),
    }
    return {
        name: candidate.stat().st_size if candidate.exists() else 0
        for name, candidate in paths.items()
    }
