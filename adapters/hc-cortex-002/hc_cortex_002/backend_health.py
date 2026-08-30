"""One read-only post-load health observation for either Cortex backend."""

from __future__ import annotations

from typing import Any


def observe_backend_health(backend: str, store: Any, run_id: str) -> dict[str, Any]:
    if backend == "sqlite":
        return _sqlite_health(store, run_id)
    return _postgres_health(store, run_id)


def _sqlite_health(store: Any, run_id: str) -> dict[str, Any]:
    connection = store._conn
    params = ("hc-cortex-002", run_id)
    memory = connection.execute(
        "SELECT COUNT(*) AS count FROM memories WHERE domain = ? AND agent_context = ?",
        params,
    ).fetchone()
    fts = connection.execute(
        "SELECT COUNT(*) AS count FROM memories_fts AS f "
        "JOIN memories AS m ON m.id = f.rowid "
        "WHERE m.domain = ? AND m.agent_context = ?",
        params,
    ).fetchone()
    vector_table = connection.execute(
        "SELECT COUNT(*) AS count FROM sqlite_master "
        "WHERE type = 'table' AND name = 'memories_vec'"
    ).fetchone()
    if memory is None or fts is None or vector_table is None:
        raise RuntimeError("SQLite health aggregate produced no row")
    vector_available = bool(vector_table["count"] and store.has_vec)
    vector_count: int | None = None
    if vector_available:
        vector = connection.execute(
            "SELECT COUNT(*) AS count FROM memories_vec AS v "
            "JOIN memories AS m ON m.id = v.rowid "
            "WHERE m.domain = ? AND m.agent_context = ?",
            params,
        ).fetchone()
        if vector is None:
            raise RuntimeError("SQLite vector health aggregate produced no row")
        vector_count = int(vector["count"])
    integrity = connection.execute("PRAGMA integrity_check").fetchall()
    foreign_keys = connection.execute("PRAGMA foreign_key_check").fetchall()
    return {
        "acknowledged": True,
        "memory_count": int(memory["count"]),
        "fts_count": int(fts["count"]),
        "vector_count": vector_count,
        "vector_available": vector_available,
        "sqlite_integrity": [dict(row) for row in integrity],
        "sqlite_foreign_key_violations": [dict(row) for row in foreign_keys],
    }


def _postgres_health(store: Any, run_id: str) -> dict[str, Any]:
    counts = store._execute(
        "SELECT COUNT(*) AS memory_count, "
        "COUNT(*) FILTER (WHERE content_tsv IS NOT NULL) AS fts_count, "
        "COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS vector_count "
        "FROM memories WHERE domain = %s AND agent_context = %s",
        ("hc-cortex-002", run_id),
    ).fetchone()
    if counts is None:
        raise RuntimeError("PostgreSQL health aggregate produced no row")
    return {
        "acknowledged": True,
        "memory_count": int(counts["memory_count"]),
        "fts_count": int(counts["fts_count"]),
        "vector_count": int(counts["vector_count"]),
        "vector_available": True,
        "sqlite_integrity": "not-applicable",
        "sqlite_foreign_key_violations": "not-applicable",
    }
