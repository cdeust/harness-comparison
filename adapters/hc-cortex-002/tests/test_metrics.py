from __future__ import annotations

import pytest

from hc_cortex_002 import metrics


def test_hyndman_fan_type_1_is_inverse_empirical_distribution() -> None:
    values = [4, 1, 3, 2]
    assert metrics.quantile_type1(values, 0.0) == 1
    assert metrics.quantile_type1(values, 0.50) == 2
    assert metrics.quantile_type1(values, 0.95) == 4
    assert metrics.quantile_type1(values, 1.0) == 4


def test_resource_fallback_records_unavailable_rss(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(metrics, "_resource", None)
    snapshot = metrics.usage_snapshot()
    assert snapshot.max_rss_bytes is None
    assert snapshot.max_rss_observation.startswith("unavailable:")
    assert snapshot.user_seconds >= 0
    assert snapshot.system_seconds >= 0


def test_queue_accounting_cannot_go_negative_on_prestart_cancellation() -> None:
    observed = metrics.LoadMetrics()
    with pytest.raises(RuntimeError, match="negative"):
        observed.admission_acquired(queued=True)
    observed.admission_wait_started(queued=True)
    observed.admission_abandoned(queued=True)
    with pytest.raises(RuntimeError, match="negative"):
        observed.admission_abandoned(queued=True)


def test_error_retry_and_per_operation_observations_are_explicit() -> None:
    observed = metrics.LoadMetrics()
    observed.dispatcher_started()
    observed.admission_wait_started(queued=True)
    observed.admission_acquired(queued=True)
    observed.outcome(
        operation="remember",
        outcome="rejected",
        queue_ns=1,
        service_ns=2,
        total_ns=3,
        has_error=True,
    )
    observed.retry("remember")
    observed.dispatcher_finished()
    summary = observed.summary(elapsed_ns=3)
    assert summary["error_events"] == 1
    assert summary["retry_events"] == 1
    assert summary["max_queue_depth"] == 1
    assert summary["max_dispatcher_inflight"] == 1
    remember = summary["per_operation_type"]["remember"]
    assert remember["completed_operations"] == 1
    assert remember["outcomes"] == {"rejected": 1}
    assert remember["queue_latency_ns"] == {"p50": 1, "p95": 1, "p99": 1}
    assert summary["throughput_denominator"] == metrics.THROUGHPUT_DENOMINATOR


def test_missing_admission_timing_is_not_fabricated() -> None:
    observed = metrics.LoadMetrics()
    observed.outcome(
        operation="remember",
        outcome="indeterminate",
        queue_ns=None,
        service_ns=None,
        total_ns=5,
        has_error=True,
    )
    summary = observed.summary(elapsed_ns=5)
    assert summary["queue_latency_ns"] is None
    assert summary["service_latency_ns"] is None
    assert summary["total_latency_ns"] == {"p50": 5, "p95": 5, "p99": 5}
