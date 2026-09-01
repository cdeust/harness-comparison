"""Pinned Cortex store loading, safe-handler calls, and observations."""

from __future__ import annotations

import threading
from array import array
from typing import Any, Awaitable, Callable

from .backend_health import observe_backend_health


class CortexBackend:
    """Small adapter around the pinned store's public mutation methods."""

    def __init__(self, backend: str, database: str) -> None:
        from mcp_server.infrastructure.memory_config import get_memory_settings

        self.backend = backend
        self.database = database
        self.embedding_dim = int(get_memory_settings().EMBEDDING_DIM)
        self._connection_lock = threading.Lock()
        self._peak_open: int | None = 0
        self._connection_unavailable_reason: str | None = None
        if backend == "sqlite":
            from mcp_server.infrastructure.sqlite_store import SqliteMemoryStore

            self.store = SqliteMemoryStore(database, self.embedding_dim)
        else:
            from mcp_server.infrastructure.pg_store import PgMemoryStore

            self.store = PgMemoryStore(database)
        self._observe_connections()

    def memory_payload(
        self, *, run_id: str, operation_id: str, marker: str
    ) -> dict[str, Any]:
        return {
            "content": marker,
            "embedding": (array("f", [0.0]) * self.embedding_dim).tobytes(),
            "tags": ["hc-cortex-002", f"run:{run_id}", f"operation:{operation_id}"],
            "source": "harness-comparison",
            "domain": "hc-cortex-002",
            "agent_context": run_id,
            "is_benchmark": True,
            "write_class": "deliberate",
            "capture_origin": "deliberate",
        }

    async def remember(self, payload: dict[str, Any]) -> dict[str, Any]:
        async def handler(args: dict[str, Any]) -> dict[str, Any]:
            memory_id = self.store.insert_memory(args["payload"])
            return {"acknowledged": True, "memory_id": memory_id}

        return await self._safe(handler, {"payload": payload}, "remember")

    async def supersede(
        self, payload: dict[str, Any], target_id: int
    ) -> dict[str, Any]:
        async def handler(args: dict[str, Any]) -> dict[str, Any]:
            new_id, head_id = self.store.supersede_atomic(
                args["payload"], args["target_id"]
            )
            if new_id is None:
                return {
                    "acknowledged": False,
                    "reason": "supersede_conflict_or_missing_target",
                    "head_id": head_id,
                }
            return {
                "acknowledged": True,
                "memory_id": new_id,
                "head_id": head_id,
                "target_id": args["target_id"],
            }

        return await self._safe(
            handler,
            {"payload": payload, "target_id": target_id},
            "remember",
        )

    async def forget(self, target_id: int) -> dict[str, Any]:
        async def handler(args: dict[str, Any]) -> dict[str, Any]:
            deleted = bool(self.store.delete_memory(args["target_id"]))
            return {
                "acknowledged": deleted,
                "deleted": deleted,
                "target_id": args["target_id"],
            }

        return await self._safe(handler, {"target_id": target_id}, "forget")

    async def health_observation(self, run_id: str) -> dict[str, Any]:
        """Read-only post-load liveness observation; never changes the row set."""

        async def handler(args: dict[str, Any]) -> dict[str, Any]:
            return observe_backend_health(self.backend, self.store, args["run_id"])

        return await self._safe(handler, {"run_id": run_id}, "memory_stats")

    async def safe_call(
        self,
        handler: Callable[[dict[str, Any]], Awaitable[dict[str, Any]]],
        args: dict[str, Any],
        tool_name: str,
    ) -> dict[str, Any]:
        return await self._safe(handler, args, tool_name)

    async def _safe(
        self,
        handler: Callable[[dict[str, Any]], Awaitable[dict[str, Any]]],
        args: dict[str, Any],
        tool_name: str,
    ) -> dict[str, Any]:
        from mcp_server.tool_error_handler import safe_handler

        async def observed_handler(payload: dict[str, Any]) -> dict[str, Any]:
            self._observe_connections()
            try:
                return await handler(payload)
            finally:
                self._observe_connections()

        try:
            return await safe_handler(observed_handler, args, tool_name=tool_name)
        finally:
            self._observe_connections()

    def connection_count(self) -> dict[str, Any]:
        current = self._observe_connections()
        if current is None or self._peak_open is None:
            return {
                "method": "unavailable",
                "open_after_load": None,
                "peak_open": None,
                "reason": self._connection_unavailable_reason
                or "store connection telemetry unavailable",
            }
        method, open_count, detail = current
        return {
            "method": method,
            "open_after_load": open_count,
            "peak_open": self._peak_open,
            **detail,
        }

    def reset_connection_peak(self) -> None:
        """Start the peak window at the exact pre-load open handle count."""
        current = self._observe_connections()
        with self._connection_lock:
            self._peak_open = current[1] if current is not None else None

    def _observe_connections(
        self,
    ) -> tuple[str, int, dict[str, Any]] | None:
        try:
            if self.backend == "sqlite":
                registry = getattr(self.store, "_connection_registry", None)
                if registry is None:
                    observation = (
                        "legacy_shared_connection_revision_capability",
                        1,
                        {"open_breakdown": {"shared": 1}},
                    )
                else:
                    with registry._lock:
                        opened = len(registry._connections)
                    observation = (
                        "store_registry_handles_sampled_at_service_boundaries",
                        opened,
                        {"open_breakdown": {"registry_handles": opened}},
                    )
            else:
                persistent = int(not self.store._conn.closed)
                pools: dict[str, int] = {}
                for name in ("interactive", "batch"):
                    pool = getattr(self.store, f"_{name}_pool")
                    pools[name] = (
                        int(pool.get_stats().get("pool_size", 0)) if pool else 0
                    )
                opened = persistent + sum(pools.values())
                observation = (
                    "store_owned_connections_and_supported_pool_stats",
                    opened,
                    {"open_breakdown": {"persistent": persistent, **pools}},
                )
        except Exception as exc:
            with self._connection_lock:
                self._peak_open = None
                self._connection_unavailable_reason = (
                    "connection telemetry capability failed: " + type(exc).__name__
                )
            return None
        with self._connection_lock:
            if self._peak_open is not None:
                self._peak_open = max(self._peak_open, observation[1])
        return observation

    def storage_bytes(self) -> dict[str, Any]:
        if self.backend == "sqlite":
            from .metrics import sqlite_storage_bytes

            return sqlite_storage_bytes(self.database)
        row = self.store._execute(
            "SELECT pg_database_size(current_database()) AS database_bytes"
        ).fetchone()
        if row is None:
            raise RuntimeError("pg_database_size aggregate produced no row")
        return {"database": int(row["database_bytes"])}

    def close(self) -> None:
        self.store.close()


def marker(run_id: str, operation_id: str, state: str) -> str:
    return f"hc-cortex-002|{run_id}|{operation_id}|{state}"
