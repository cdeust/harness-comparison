"""Ledger-to-store reconciliation with explicit, independently visible checks."""

from __future__ import annotations

from collections import Counter
from typing import Any

from .metrics import QUANTILE_METHOD, THROUGHPUT_DENOMINATOR
from .provenance import ZERO_MODEL_TOOL_COST
from .oracle_check_support import (
    add_check as _check,
    add_count_checks as _count_checks,
    expected_marker_counts,
    group_by_id as _group_by_id,
    outcome_contract as _outcome_contract,
    supersession_errors as _supersession_errors,
    unique_by_id as _unique_by_id,
)


def reconcile(
    records: list[dict[str, Any]],
    snapshot: dict[str, Any],
    *,
    backend: str,
    concurrency: int,
    operations_per_type: int,
    oracle_boot_nonce: str,
    oracle_process_instance_id: str,
    expected_identities: dict[str, str],
    database_identity_sha256: str,
    oracle_postgresql_service: dict[str, Any] | None,
) -> dict[str, Any]:
    checks: dict[str, dict[str, Any]] = {}
    starts = [record for record in records if record["event"] == "process_start"]
    terminals = [record for record in records if record["event"] == "terminal"]
    intents = [record for record in records if record["event"] == "operation_intent"]
    outcomes = [record for record in records if record["event"] == "operation_outcome"]
    retries = [record for record in records if record["event"] == "operation_retry"]
    preflights = [
        record for record in records if record["event"] == "backend_preflight"
    ]
    summaries = [
        record for record in records if record["event"] == "measurement_summary"
    ]
    load_windows = [record for record in records if record["event"] == "load_window"]
    _check(
        checks,
        "workload_terminal",
        len(terminals) == 1
        and records[-1] is terminals[0]
        and terminals[0].get("state") == "complete",
        {"terminal_count": len(terminals), "last_event": records[-1]["event"]},
        {"terminal_count": 1, "last_event": "terminal", "state": "complete"},
    )
    start = starts[0] if len(starts) == 1 else {}
    shared_identity_fields = (
        "release_id",
        "protocol_id",
        "protocol_sha256",
        "cell_id",
        "attempt_id",
    )
    observed_identity = {key: start.get(key) for key in shared_identity_fields}
    expected_identity = {
        key: expected_identities[key] for key in shared_identity_fields
    }
    _check(
        checks,
        "release_protocol_cell_attempt_binding",
        observed_identity == expected_identity,
        observed_identity,
        expected_identity,
    )
    _check(
        checks,
        "configuration_binding",
        len(starts) == 1
        and start.get("backend") == backend
        and start.get("concurrency") == concurrency
        and start.get("operations_per_type") == operations_per_type,
        {
            "process_start_count": len(starts),
            "backend": start.get("backend"),
            "concurrency": start.get("concurrency"),
            "operations_per_type": start.get("operations_per_type"),
            "database_identity_sha256": start.get("database_identity_sha256"),
            "postgresql_service": start.get("postgresql_service"),
        },
        {
            "process_start_count": 1,
            "backend": backend,
            "concurrency": concurrency,
            "operations_per_type": operations_per_type,
            "database_identity_sha256": database_identity_sha256,
            "postgresql_service": oracle_postgresql_service,
        },
    )
    checks["configuration_binding"]["passed"] = bool(
        checks["configuration_binding"]["passed"]
        and start.get("database_identity_sha256") == database_identity_sha256
        and start.get("postgresql_service") == oracle_postgresql_service
    )
    _check(
        checks,
        "fresh_process_restart",
        bool(start)
        and start.get("boot_nonce") != oracle_boot_nonce
        and start.get("process_instance_id") != oracle_process_instance_id,
        {
            "workload_boot_nonce": start.get("boot_nonce"),
            "oracle_boot_nonce": oracle_boot_nonce,
            "workload_process_instance_id": start.get("process_instance_id"),
            "oracle_process_instance_id": oracle_process_instance_id,
        },
        "distinct boot nonce and process-instance identity",
    )
    preflight = preflights[0].get("observation", {}) if len(preflights) == 1 else {}
    _check(
        checks,
        "fresh_empty_database_preflight",
        len(preflights) == 1
        and preflight.get("checked_before_store_initialization") is True
        and preflight.get("empty") is True
        and preflight.get("user_relation_count") == 0,
        {"preflight_count": len(preflights), "observation": preflight},
        "one pre-store check proving zero user relations",
    )
    intent_counts = Counter(record["operation"] for record in intents)
    expected_intent_counts = {
        "setup_seed": 2 * operations_per_type + 1,
        "remember": operations_per_type,
        "supersede_atomic": operations_per_type,
        "forget": operations_per_type,
        "faulted_supersede": 1,
        "recovery_health": 1,
    }
    _check(
        checks,
        "planned_operation_counts",
        dict(intent_counts) == expected_intent_counts,
        dict(intent_counts),
        expected_intent_counts,
    )
    intents_by_id = _unique_by_id(intents)
    outcomes_by_id = _group_by_id(outcomes)
    exactly_one = (
        bool(intents_by_id)
        and len(intents_by_id) == len(intents)
        and all(
            len(outcomes_by_id.get(operation_id, [])) == 1
            for operation_id in intents_by_id
        )
        and set(outcomes_by_id) == set(intents_by_id)
    )
    _check(
        checks,
        "one_outcome_per_intent",
        exactly_one,
        {
            "intents": len(intents),
            "unique_intents": len(intents_by_id),
            "outcomes": len(outcomes),
            "duplicate_or_missing": sorted(
                operation_id
                for operation_id in set(intents_by_id) | set(outcomes_by_id)
                if len(outcomes_by_id.get(operation_id, [])) != 1
            ),
        },
        "one terminal outcome for each unique intent and no orphan outcomes",
    )
    outcome_contract = _outcome_contract(intents_by_id, outcomes_by_id)
    _check(
        checks,
        "acknowledged_and_rejected_contract",
        not outcome_contract,
        outcome_contract,
        "every non-fault operation acknowledged; faulted supersede rejected; no indeterminate",
    )
    recovery_intents = [
        intent for intent in intents if intent["operation"] == "recovery_health"
    ]
    recovery_outcomes = (
        outcomes_by_id.get(recovery_intents[0]["operation_id"], [])
        if len(recovery_intents) == 1
        else []
    )
    recovery_result = (
        recovery_outcomes[0].get("result") if len(recovery_outcomes) == 1 else None
    )
    recovery_expected_count = 3 * operations_per_type + 1
    recovery_store_valid = isinstance(recovery_result, dict) and all(
        recovery_result.get(name) == recovery_expected_count
        for name in ("memory_count", "fts_count", "vector_count")
    )
    if backend == "sqlite" and isinstance(recovery_result, dict):
        integrity = recovery_result.get("sqlite_integrity")
        recovery_store_valid = bool(
            recovery_store_valid
            and recovery_result.get("vector_available") is True
            and isinstance(integrity, list)
            and len(integrity) == 1
            and next(iter(integrity[0].values())) == "ok"
            and recovery_result.get("sqlite_foreign_key_violations") == []
        )
    _check(
        checks,
        "post_load_health_is_read_only",
        len(recovery_intents) == 1
        and recovery_intents[0].get("marker") is None
        and recovery_intents[0].get("target_id") is None
        and recovery_store_valid,
        {
            "intent_count": len(recovery_intents),
            "marker": recovery_intents[0].get("marker") if recovery_intents else None,
            "target_id": recovery_intents[0].get("target_id")
            if recovery_intents
            else None,
            "result": recovery_result,
        },
        {
            "marker": None,
            "target_id": None,
            "memory_fts_vector_count": recovery_expected_count,
            "integrity": "backend-valid",
        },
    )
    retry_expected = 1 if backend == "sqlite" and concurrency >= 2 else 0
    _check(
        checks,
        "fault_retry_choreography",
        len(retries) == retry_expected,
        len(retries),
        retry_expected,
    )
    rows_by_id = {int(row["id"]): row for row in snapshot["rows"]}
    contents = Counter(row["content"] for row in snapshot["rows"])
    marker_counts = expected_marker_counts(intents_by_id)
    marker_diffs = {
        content: {"observed": contents.get(content, 0), "expected": expected}
        for content, expected in marker_counts.items()
        if contents.get(content, 0) != expected
    }
    unexpected = sorted(content for content in contents if content not in marker_counts)
    _check(
        checks,
        "marker_exactly_once_and_rejected_zero",
        not marker_diffs and not unexpected,
        {"differences": marker_diffs, "unexpected": unexpected},
        "each expected live marker once; deleted and rejected markers zero",
    )
    supersession_errors = _supersession_errors(
        intents_by_id, outcomes_by_id, rows_by_id
    )
    _check(
        checks,
        "supersession_state",
        not supersession_errors,
        supersession_errors,
        "old head points to new row and new row points back to old head",
    )
    delete_survivors = [
        intent["target_id"]
        for intent in intents
        if intent["operation"] == "forget" and intent["target_id"] in rows_by_id
    ]
    _check(checks, "delete_state", not delete_survivors, delete_survivors, [])
    fault_errors = []
    for intent in intents:
        if intent["operation"] != "faulted_supersede":
            continue
        target = rows_by_id.get(intent.get("target_id"))
        if target is None or target.get("superseded_by_id") is not None:
            fault_errors.append(
                {
                    "target_id": intent.get("target_id"),
                    "observed": target,
                    "expected_superseded_by_id": None,
                }
            )
    _check(
        checks,
        "fault_rollback_state",
        not fault_errors,
        fault_errors,
        "fault target remains the open head and rejected row is absent",
    )
    expected_live = sum(marker_counts.values())
    formula_live = 3 * operations_per_type + 1
    _check(
        checks,
        "final_live_count_formula",
        expected_live == formula_live,
        expected_live,
        formula_live,
    )
    _count_checks(checks, snapshot, expected_live, backend)
    summary_observations = (
        summaries[0].get("observations", {}) if len(summaries) == 1 else {}
    )
    load = summary_observations.get("load", {})
    load_window = load_windows[0] if len(load_windows) == 1 else {}
    start_ns = _canonical_decimal_ns(load_window.get("start_monotonic_ns"))
    end_ns = _canonical_decimal_ns(load_window.get("end_monotonic_ns"))
    elapsed_ns = _canonical_decimal_ns(load_window.get("elapsed_ns"))
    load_intents = [record for record in intents if record.get("phase") == "load"]
    load_outcomes = [record for record in outcomes if record.get("phase") == "load"]
    raw_window_valid = (
        len(load_windows) == 1
        and start_ns is not None
        and end_ns is not None
        and elapsed_ns is not None
        and end_ns >= start_ns
        and elapsed_ns == end_ns - start_ns
        and isinstance(load, dict)
        and load.get("elapsed_ns") == elapsed_ns
        and all(int(record["monotonic_ns"]) >= start_ns for record in load_intents)
        and all(int(record["monotonic_ns"]) <= end_ns for record in load_outcomes)
        and bool(summaries)
        and load_window.get("sequence", 0) < summaries[0].get("sequence", 0)
    )
    _check(
        checks,
        "load_window_exact",
        raw_window_valid,
        {
            "event_count": len(load_windows),
            "start_monotonic_ns": load_window.get("start_monotonic_ns"),
            "end_monotonic_ns": load_window.get("end_monotonic_ns"),
            "elapsed_ns": load_window.get("elapsed_ns"),
            "summary_elapsed_ns": load.get("elapsed_ns")
            if isinstance(load, dict)
            else None,
            "load_intent_count": len(load_intents),
            "load_outcome_count": len(load_outcomes),
        },
        "one canonical decimal window enclosing every measured intent/outcome; "
        "elapsed=end-start and equals measurement summary elapsed_ns",
    )
    per_type = load.get("per_operation_type", {}) if isinstance(load, dict) else {}
    expected_type_counts = {
        "remember": operations_per_type,
        "supersede_atomic": operations_per_type,
        "forget": operations_per_type,
        "faulted_supersede": 1,
    }
    observed_type_counts = {
        operation: values.get("completed_operations")
        for operation, values in per_type.items()
        if isinstance(values, dict)
    }
    telemetry_complete = (
        len(summaries) == 1
        and load.get("completed_operations") == 3 * operations_per_type + 1
        and load.get("latency_quantile_method") == QUANTILE_METHOD
        and load.get("throughput_denominator") == THROUGHPUT_DENOMINATOR
        and observed_type_counts == expected_type_counts
    )
    _check(
        checks,
        "load_telemetry_scope_and_types",
        telemetry_complete,
        {
            "summary_count": len(summaries),
            "completed_operations": load.get("completed_operations"),
            "per_operation_completed": observed_type_counts,
            "quantile_method": load.get("latency_quantile_method"),
            "throughput_denominator": load.get("throughput_denominator"),
        },
        {
            "completed_operations": 3 * operations_per_type + 1,
            "per_operation_completed": expected_type_counts,
            "quantile_method": QUANTILE_METHOD,
            "throughput_denominator": THROUGHPUT_DENOMINATOR,
        },
    )
    cost = summary_observations.get("model_tool_cost")
    _check(
        checks,
        "zero_model_remote_tool_boundary",
        cost == ZERO_MODEL_TOOL_COST,
        cost,
        ZERO_MODEL_TOOL_COST,
    )
    connections = summary_observations.get("connections", {})
    connection_shape = (
        isinstance(connections, dict)
        and "method" in connections
        and "open_after_load" in connections
        and "peak_open" in connections
    )
    _check(
        checks,
        "connection_telemetry_shape",
        connection_shape,
        connections,
        "method plus open_after_load and peak_open, or explicit unavailable values",
    )
    return {
        "checks": checks,
        "verdict": "proven" if all(v["passed"] for v in checks.values()) else "blocked",
    }


def _canonical_decimal_ns(value: Any) -> int | None:
    if not isinstance(value, str) or not value.isascii() or not value.isdecimal():
        return None
    parsed = int(value)
    if parsed < 0 or str(parsed) != value:
        return None
    return parsed
