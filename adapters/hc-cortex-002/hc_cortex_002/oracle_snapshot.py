"""Independent, publication-safe persisted-state observations."""

from __future__ import annotations

from typing import Any

from .backend import CortexBackend


PERSISTED_STATE_SCHEMA = "hc-cortex-002/persisted-state/v1"
_DOMAIN = "hc-cortex-002"


async def observe_persisted_state(
    backend: CortexBackend, run_id: str
) -> dict[str, Any]:
    async def handler(_args: dict[str, Any]) -> dict[str, Any]:
        if backend.backend == "sqlite":
            return _sqlite_snapshot(backend, run_id)
        return _postgres_snapshot(backend, run_id)

    snapshot = await backend.safe_call(handler, {}, "memory_stats")
    snapshot["persisted_state_schema"] = PERSISTED_STATE_SCHEMA
    snapshot["backend"] = backend.backend
    snapshot["scope"] = {"domain": _DOMAIN, "agent_context": run_id}
    snapshot["storage_bytes"] = backend.storage_bytes()
    snapshot["connections"] = backend.connection_count()
    return snapshot


def _sqlite_snapshot(backend: CortexBackend, run_id: str) -> dict[str, Any]:
    conn = backend.store._conn
    params = ("hc-cortex-002", run_id)
    raw_rows = conn.execute(
        "SELECT id, content, supersedes_id, superseded_by_id FROM memories "
        "WHERE domain = ? AND agent_context = ? ORDER BY id",
        params,
    ).fetchall()
    fts_rows = conn.execute(
        "SELECT f.rowid AS id FROM memories_fts f "
        "JOIN memories m ON m.id = f.rowid "
        "WHERE m.domain = ? AND m.agent_context = ? ORDER BY f.rowid",
        params,
    ).fetchall()
    fts_ids = {int(row["id"]) for row in fts_rows}
    vec_table = conn.execute(
        "SELECT COUNT(*) AS count FROM sqlite_master "
        "WHERE type = 'table' AND name = 'memories_vec'"
    ).fetchone()["count"]
    vector_ids: set[int] = set()
    if vec_table:
        vector_rows = conn.execute(
            "SELECT v.rowid AS id FROM memories_vec v "
            "JOIN memories m ON m.id = v.rowid "
            "WHERE m.domain = ? AND m.agent_context = ? ORDER BY v.rowid",
            params,
        ).fetchall()
        vector_ids = {int(row["id"]) for row in vector_rows}
    rows = [
        _normalize_memory_row(
            row,
            fts_populated=int(row["id"]) in fts_ids,
            vector_populated=int(row["id"]) in vector_ids,
        )
        for row in raw_rows
    ]
    integrity_rows = conn.execute("PRAGMA integrity_check").fetchall()
    foreign_key_rows = conn.execute("PRAGMA foreign_key_check").fetchall()
    return {
        "rows": rows,
        "memory_count": len(rows),
        "fts_count": len(fts_ids),
        "vector_count": len(vector_ids),
        "vector_available": bool(vec_table and backend.store.has_vec),
        "sqlite_integrity": [dict(row) for row in integrity_rows],
        "sqlite_foreign_key_violations": [dict(row) for row in foreign_key_rows],
        "postgresql_constraints": "not_applicable",
    }


def _postgres_snapshot(backend: CortexBackend, run_id: str) -> dict[str, Any]:
    params = ("hc-cortex-002", run_id)
    raw_rows = backend.store._execute(
        "SELECT id, content, supersedes_id, superseded_by_id, "
        "content_tsv IS NOT NULL AS fts_populated, "
        "embedding IS NOT NULL AS vector_populated FROM memories "
        "WHERE domain = %s AND agent_context = %s ORDER BY id",
        params,
    ).fetchall()
    counts = backend.store._execute(
        "SELECT COUNT(*) AS memory_count, "
        "COUNT(*) FILTER (WHERE content_tsv IS NOT NULL) AS fts_count, "
        "COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS vector_count "
        "FROM memories WHERE domain = %s AND agent_context = %s",
        params,
    ).fetchone()
    if counts is None:
        raise RuntimeError("PostgreSQL count aggregate produced no row")
    constraints = backend.store._execute(_POSTGRESQL_CONSTRAINTS_QUERY).fetchall()
    return {
        "rows": [
            _normalize_memory_row(
                row,
                fts_populated=_require_bool(row["fts_populated"], "fts_populated"),
                vector_populated=_require_bool(
                    row["vector_populated"], "vector_populated"
                ),
            )
            for row in raw_rows
        ],
        "memory_count": int(counts["memory_count"]),
        "fts_count": int(counts["fts_count"]),
        "vector_count": int(counts["vector_count"]),
        "vector_available": True,
        "sqlite_integrity": "not_applicable",
        "sqlite_foreign_key_violations": "not_applicable",
        "postgresql_constraints": [
            _normalize_postgresql_constraint(row) for row in constraints
        ],
    }


def _normalize_memory_row(
    row: Any,
    *,
    fts_populated: bool,
    vector_populated: bool,
) -> dict[str, Any]:
    """Return the exact cross-backend row shape consumed by the analyzer."""
    return {
        "id": int(row["id"]),
        "content": str(row["content"]),
        "supersedes_id": _optional_int(row["supersedes_id"]),
        "superseded_by_id": _optional_int(row["superseded_by_id"]),
        "fts_populated": fts_populated,
        "vector_populated": vector_populated,
    }


def _optional_int(value: Any) -> int | None:
    return None if value is None else int(value)


def _require_bool(value: Any, field: str) -> bool:
    if not isinstance(value, bool):
        raise RuntimeError(f"PostgreSQL {field} observation was not boolean")
    return value


def _normalize_postgresql_constraint(row: Any) -> dict[str, Any]:
    return {
        "schema": str(row["schema_name"]),
        "table": str(row["table_name"]),
        "name": str(row["constraint_name"]),
        "type": str(row["constraint_type"]),
        "columns": [str(value) for value in row["columns"]],
        "validated": _require_bool(row["validated"], "constraint validation"),
        "definition": str(row["definition"]),
        "referenced_schema": (
            None if row["referenced_schema"] is None else str(row["referenced_schema"])
        ),
        "referenced_table": (
            None if row["referenced_table"] is None else str(row["referenced_table"])
        ),
        "referenced_columns": [str(value) for value in row["referenced_columns"]],
    }


_POSTGRESQL_CONSTRAINTS_QUERY = """
    SELECT
        namespace.nspname AS schema_name,
        relation.relname AS table_name,
        constraint_record.conname AS constraint_name,
        CASE constraint_record.contype
            WHEN 'c' THEN 'check'
            WHEN 'f' THEN 'foreign_key'
            WHEN 'p' THEN 'primary_key'
            WHEN 'u' THEN 'unique'
            WHEN 't' THEN 'constraint_trigger'
            WHEN 'x' THEN 'exclusion'
            ELSE constraint_record.contype::text
        END AS constraint_type,
        ARRAY(
            SELECT attribute.attname::text
            FROM unnest(constraint_record.conkey) WITH ORDINALITY
                 AS constrained_key(attnum, position)
            JOIN pg_catalog.pg_attribute AS attribute
              ON attribute.attrelid = constraint_record.conrelid
             AND attribute.attnum = constrained_key.attnum
            ORDER BY constrained_key.position
        ) AS columns,
        constraint_record.convalidated AS validated,
        pg_catalog.pg_get_constraintdef(constraint_record.oid, true) AS definition,
        referenced_namespace.nspname AS referenced_schema,
        referenced_relation.relname AS referenced_table,
        ARRAY(
            SELECT attribute.attname::text
            FROM unnest(constraint_record.confkey) WITH ORDINALITY
                 AS referenced_key(attnum, position)
            JOIN pg_catalog.pg_attribute AS attribute
              ON attribute.attrelid = constraint_record.confrelid
             AND attribute.attnum = referenced_key.attnum
            ORDER BY referenced_key.position
        ) AS referenced_columns
    FROM pg_catalog.pg_constraint AS constraint_record
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = constraint_record.conrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_catalog.pg_class AS referenced_relation
      ON referenced_relation.oid = constraint_record.confrelid
    LEFT JOIN pg_catalog.pg_namespace AS referenced_namespace
      ON referenced_namespace.oid = referenced_relation.relnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname NOT LIKE 'pg_toast%'
      AND namespace.nspname NOT LIKE 'pg_temp_%'
      AND relation.relkind IN ('r', 'p')
      AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_depend AS dependency
          WHERE dependency.classid = 'pg_class'::regclass
            AND dependency.objid = relation.oid
            AND dependency.deptype = 'e'
      )
    ORDER BY namespace.nspname, relation.relname, constraint_record.conname
"""
