"""Focused helpers for the HC-CORTEX-002 persisted-state verdict."""

from __future__ import annotations

from collections import defaultdict
from typing import Any


def add_check(
    checks: dict[str, dict[str, Any]],
    name: str,
    passed: bool,
    observed: Any,
    expected: Any,
) -> None:
    checks[name] = {"passed": bool(passed), "observed": observed, "expected": expected}


def unique_by_id(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {record["operation_id"]: record for record in records}


def group_by_id(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[record["operation_id"]].append(record)
    return grouped


def outcome_contract(
    intents: dict[str, dict[str, Any]], outcomes: dict[str, list[dict[str, Any]]]
) -> list[dict[str, Any]]:
    errors = []
    for operation_id, intent in intents.items():
        rows = outcomes.get(operation_id, [])
        expected = (
            "rejected" if intent["operation"] == "faulted_supersede" else "acknowledged"
        )
        observed = rows[0].get("outcome") if len(rows) == 1 else None
        if observed != expected:
            errors.append(
                {
                    "operation_id": operation_id,
                    "observed": observed,
                    "expected": expected,
                }
            )
    return errors


def expected_marker_counts(
    intents: dict[str, dict[str, Any]],
) -> dict[str, int]:
    marker_counts: dict[str, int] = {}
    for intent in intents.values():
        content = intent.get("marker")
        if not content:
            continue
        operation = intent["operation"]
        expected = 1
        if operation == "faulted_supersede" or (
            operation == "setup_seed" and intent.get("role") == "delete_target"
        ):
            expected = 0
        marker_counts[content] = expected
    return marker_counts


def supersession_errors(
    intents: dict[str, dict[str, Any]],
    outcomes: dict[str, list[dict[str, Any]]],
    rows: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    errors = []
    for operation_id, intent in intents.items():
        if intent["operation"] != "supersede_atomic":
            continue
        outcome_rows = outcomes.get(operation_id, [])
        result = outcome_rows[0].get("result") if len(outcome_rows) == 1 else None
        target_id = intent.get("target_id")
        new_id = result.get("memory_id") if isinstance(result, dict) else None
        head_id = result.get("head_id") if isinstance(result, dict) else None
        old_row = rows.get(target_id) if isinstance(target_id, int) else None
        new_row = rows.get(new_id) if isinstance(new_id, int) else None
        valid = (
            old_row is not None
            and new_row is not None
            and old_row.get("superseded_by_id") == new_id
            and new_row.get("supersedes_id") == head_id == target_id
        )
        if not valid:
            errors.append(
                {
                    "operation_id": operation_id,
                    "target_id": target_id,
                    "new_id": new_id,
                    "head_id": head_id,
                }
            )
    return errors


def add_count_checks(
    checks: dict[str, dict[str, Any]],
    snapshot: dict[str, Any],
    expected_live: int,
    backend: str,
) -> None:
    for name in ("memory_count", "fts_count", "vector_count"):
        available = name != "vector_count" or snapshot["vector_available"]
        add_check(
            checks,
            name,
            available and snapshot[name] == expected_live,
            {"count": snapshot[name], "available": available},
            expected_live,
        )
    if backend == "sqlite":
        integrity = snapshot["sqlite_integrity"]
        integrity_ok = len(integrity) == 1 and next(iter(integrity[0].values())) == "ok"
        add_check(
            checks,
            "sqlite_integrity",
            integrity_ok,
            integrity,
            [{"integrity_check": "ok"}],
        )
        add_check(
            checks,
            "sqlite_foreign_keys",
            snapshot["sqlite_foreign_key_violations"] == [],
            snapshot["sqlite_foreign_key_violations"],
            [],
        )
        return
    constraints = snapshot.get("postgresql_constraints")
    if not isinstance(constraints, list):
        add_check(
            checks,
            "postgresql_constraints_validated",
            False,
            {"unvalidated": "unavailable", "missing_required_memory_foreign_keys": []},
            {"unvalidated": [], "missing_required_memory_foreign_keys": []},
        )
        return
    unvalidated = [row for row in constraints if row.get("validated") is not True]
    required = _required_postgresql_memory_foreign_keys()
    observed = {_postgresql_foreign_key_identity(row) for row in constraints}
    missing = [
        descriptor for identity, descriptor in required if identity not in observed
    ]
    add_check(
        checks,
        "postgresql_constraints_validated",
        not unvalidated and not missing,
        {
            "unvalidated": unvalidated,
            "missing_required_memory_foreign_keys": missing,
        },
        {"unvalidated": [], "missing_required_memory_foreign_keys": []},
    )


def _postgresql_foreign_key_identity(row: dict[str, Any]) -> tuple[Any, ...]:
    return (
        row.get("schema"),
        row.get("table"),
        row.get("type"),
        tuple(row.get("columns", [])),
        row.get("referenced_schema"),
        row.get("referenced_table"),
        tuple(row.get("referenced_columns", [])),
    )


def _required_postgresql_memory_foreign_keys() -> list[
    tuple[tuple[Any, ...], dict[str, Any]]
]:
    required = []
    for column in ("supersedes_id", "superseded_by_id"):
        descriptor = {
            "schema": "public",
            "table": "memories",
            "type": "foreign_key",
            "columns": [column],
            "referenced_schema": "public",
            "referenced_table": "memories",
            "referenced_columns": ["id"],
        }
        required.append((_postgresql_foreign_key_identity(descriptor), descriptor))
    return required
