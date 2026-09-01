from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace
from typing import Any

from hc_cortex_002.oracle_check_support import add_count_checks
from hc_cortex_002.oracle_snapshot import _postgres_snapshot


class Materialized:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def fetchall(self) -> list[dict[str, Any]]:
        return self.rows

    def fetchone(self) -> dict[str, Any] | None:
        return self.rows[0] if self.rows else None


def constraint(column: str, *, validated: bool = True) -> dict[str, Any]:
    return {
        "schema_name": "public",
        "table_name": "memories",
        "constraint_name": f"memories_{column}_fkey",
        "constraint_type": "foreign_key",
        "columns": (column,),
        "validated": validated,
        "definition": f"FOREIGN KEY ({column}) REFERENCES memories(id)",
        "referenced_schema": "public",
        "referenced_table": "memories",
        "referenced_columns": ("id",),
    }


def normalized_constraint(column: str, *, validated: bool = True) -> dict[str, Any]:
    raw = constraint(column, validated=validated)
    return {
        "schema": raw["schema_name"],
        "table": raw["table_name"],
        "name": raw["constraint_name"],
        "type": raw["constraint_type"],
        "columns": list(raw["columns"]),
        "validated": raw["validated"],
        "definition": raw["definition"],
        "referenced_schema": raw["referenced_schema"],
        "referenced_table": raw["referenced_table"],
        "referenced_columns": list(raw["referenced_columns"]),
    }


def snapshot_with_constraints(constraints: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "memory_count": 4,
        "fts_count": 4,
        "vector_count": 4,
        "vector_available": True,
        "postgresql_constraints": constraints,
    }


def test_postgresql_snapshot_normalizes_rows_and_constraint_evidence() -> None:
    memory_rows = [
        {
            "id": 1,
            "content": "marker-1",
            "supersedes_id": None,
            "superseded_by_id": 2,
            "fts_populated": True,
            "vector_populated": True,
        },
        {
            "id": 2,
            "content": "marker-2",
            "supersedes_id": 1,
            "superseded_by_id": None,
            "fts_populated": True,
            "vector_populated": True,
        },
    ]
    raw_constraints = [constraint("superseded_by_id"), constraint("supersedes_id")]

    def execute(query: str, _params: Any = None) -> Materialized:
        if "pg_catalog.pg_constraint" in query:
            return Materialized(raw_constraints)
        if "COUNT(*) AS memory_count" in query:
            return Materialized(
                [{"memory_count": 2, "fts_count": 2, "vector_count": 2}]
            )
        return Materialized(memory_rows)

    backend = SimpleNamespace(store=SimpleNamespace(_execute=execute))
    observed = _postgres_snapshot(backend, "run")

    assert observed["rows"] == memory_rows
    assert observed["postgresql_constraints"] == [
        normalized_constraint("superseded_by_id"),
        normalized_constraint("supersedes_id"),
    ]
    assert observed["sqlite_integrity"] == "not_applicable"
    assert observed["sqlite_foreign_key_violations"] == "not_applicable"


def test_postgresql_constraint_check_fails_closed() -> None:
    constraints = [
        normalized_constraint("superseded_by_id"),
        normalized_constraint("supersedes_id"),
    ]
    checks: dict[str, dict[str, Any]] = {}
    add_count_checks(checks, snapshot_with_constraints(constraints), 4, "postgresql")
    assert checks["postgresql_constraints_validated"]["passed"] is True

    unvalidated = deepcopy(constraints)
    unvalidated[0]["validated"] = False
    checks = {}
    add_count_checks(checks, snapshot_with_constraints(unvalidated), 4, "postgresql")
    assert checks["postgresql_constraints_validated"]["passed"] is False
    assert checks["postgresql_constraints_validated"]["observed"]["unvalidated"]

    checks = {}
    add_count_checks(
        checks, snapshot_with_constraints(constraints[1:]), 4, "postgresql"
    )
    assert checks["postgresql_constraints_validated"]["passed"] is False
    missing = checks["postgresql_constraints_validated"]["observed"][
        "missing_required_memory_foreign_keys"
    ]
    assert missing == [
        {
            "schema": "public",
            "table": "memories",
            "type": "foreign_key",
            "columns": ["superseded_by_id"],
            "referenced_schema": "public",
            "referenced_table": "memories",
            "referenced_columns": ["id"],
        }
    ]
