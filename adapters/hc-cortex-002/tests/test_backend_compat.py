from __future__ import annotations

import asyncio
import hashlib
import threading
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import quote

import pytest

from hc_cortex_002 import provenance as provenance_module
from hc_cortex_002 import workload as workload_module
from hc_cortex_002.backend import CortexBackend
from hc_cortex_002.provenance import (
    DatabaseFreshnessError,
    database_freshness_observation,
    database_identity,
    redact_sensitive,
    require_fresh_database,
    validate_database_binding,
)
from hc_cortex_002.journal import read_verified
from hc_cortex_002.workload import Workload, WorkloadConfig


def bare_backend(kind: str, store: object) -> CortexBackend:
    backend = object.__new__(CortexBackend)
    backend.backend = kind
    backend.store = store
    backend._connection_lock = threading.Lock()
    backend._peak_open = 0
    backend._connection_unavailable_reason = None
    return backend


def test_legacy_sqlite_connection_count_has_revision_capability_label() -> None:
    backend = bare_backend("sqlite", SimpleNamespace(_conn=object()))
    assert backend.connection_count() == {
        "method": "legacy_shared_connection_revision_capability",
        "open_after_load": 1,
        "peak_open": 1,
        "open_breakdown": {"shared": 1},
    }


def test_registry_connection_count_retains_sampled_peak() -> None:
    registry = SimpleNamespace(_lock=threading.Lock(), _connections=[object()])
    backend = bare_backend("sqlite", SimpleNamespace(_connection_registry=registry))
    backend._observe_connections()
    registry._connections.append(object())
    backend._observe_connections()
    registry._connections.pop()
    assert backend.connection_count() == {
        "method": "store_registry_handles_sampled_at_service_boundaries",
        "open_after_load": 1,
        "peak_open": 2,
        "open_breakdown": {"registry_handles": 1},
    }


def test_postgres_connection_count_uses_supported_pool_stats() -> None:
    pool = SimpleNamespace(get_stats=lambda: {"pool_size": 3})
    store = SimpleNamespace(
        _conn=SimpleNamespace(closed=False),
        _interactive_pool=pool,
        _batch_pool=None,
    )
    backend = bare_backend("postgresql", store)
    assert backend.connection_count() == {
        "method": "store_owned_connections_and_supported_pool_stats",
        "open_after_load": 4,
        "peak_open": 4,
        "open_breakdown": {"persistent": 1, "interactive": 3, "batch": 0},
    }


def test_postgres_storage_uses_materialized_cursor_fetchone() -> None:
    class FetchOneOnly:
        def fetchone(self) -> dict[str, int]:
            return {"database_bytes": 123}

    backend = bare_backend(
        "postgresql",
        SimpleNamespace(_execute=lambda _query: FetchOneOnly()),
    )
    assert backend.storage_bytes() == {"database": 123}


def test_postgres_freshness_is_fail_closed_and_secretless(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        provenance_module, "_postgres_user_relation_count", lambda _db: 2
    )
    observation = database_freshness_observation(
        "postgresql", "postgresql://localhost/bench"
    )
    assert observation == {
        "checked_before_store_initialization": True,
        "method": "pg_catalog_non_system_non_extension_relations",
        "empty": False,
        "user_relation_count": 2,
    }
    with pytest.raises(DatabaseFreshnessError, match="2 user relation"):
        require_fresh_database("postgresql", "postgresql://localhost/bench")


def test_workload_records_nonempty_postgres_before_store_initialization(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    observation = {
        "checked_before_store_initialization": True,
        "method": "mocked_pg_catalog",
        "empty": False,
        "user_relation_count": 3,
    }
    monkeypatch.setattr(
        workload_module,
        "database_freshness_observation",
        lambda _backend, _database: observation,
    )

    def forbidden_store(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("store initialization must not run")

    monkeypatch.setattr(workload_module, "CortexBackend", forbidden_store)
    monkeypatch.setattr(
        workload_module,
        "verified_postgres_service",
        lambda *_args: {
            "service_instance_id": "b" * 64,
            "started_at": "2026-08-31T00:00:00.000Z",
            "server_inet_address": None,
        },
    )
    socket_root = tmp_path / "postgresql-socket"
    socket_root.mkdir(mode=0o700)
    database = (
        "postgresql:///bench?host="
        f"{quote(str(socket_root), safe='')}&port=5432&sslmode=disable"
    )
    config = WorkloadConfig(
        backend="postgresql",
        database=database,
        concurrency=1,
        operations_per_type=1,
        run_id="preflight-test",
        output_dir=tmp_path,
        identities={
            "release_id": "release",
            "protocol_id": "protocol",
            "protocol_sha256": "a" * 64,
            "cell_id": "pg-c1",
            "attempt_id": "attempt",
            "process_instance_id": "process",
        },
        postgresql_service_instance_id="b" * 64,
        postgresql_service_started_at="2026-08-31T00:00:00.000Z",
    )
    workload = Workload(config)
    with pytest.raises(DatabaseFreshnessError, match="3 user relation"):
        asyncio.run(workload.run())
    records = read_verified(tmp_path / "preflight-test.workload.jsonl")
    preflight = next(row for row in records if row["event"] == "backend_preflight")
    assert preflight["observation"] == observation
    assert records[-1]["event"] == "terminal"
    assert records[-1]["state"] == "failed"


def test_postgres_binding_requires_private_unix_socket(
    tmp_path: Path,
) -> None:
    socket_root = tmp_path / "postgresql-socket"
    socket_root.mkdir(mode=0o700)
    binding = (
        "postgresql:///bench?host="
        f"{quote(str(socket_root), safe='')}&port=5432&sslmode=disable"
    )
    validate_database_binding("postgresql", binding)
    with pytest.raises(ValueError, match="must not contain"):
        validate_database_binding(
            "postgresql", "postgresql://user:do-not-publish@localhost/bench"
        )
    with pytest.raises(ValueError, match="registered private"):
        validate_database_binding("postgresql", "postgresql://db.example/bench")
    with pytest.raises(ValueError, match="registered private"):
        validate_database_binding(
            "postgresql",
            "postgresql://alice@/bench?"
            f"host={quote(str(socket_root), safe='')}&port=5432&sslmode=disable",
        )
    socket_root.chmod(0o755)
    with pytest.raises(ValueError, match="mode 0700"):
        validate_database_binding("postgresql", binding)


def test_postgres_database_identity_matches_protocol_formula(tmp_path: Path) -> None:
    socket_root = tmp_path / "postgresql-socket"
    socket_root.mkdir(mode=0o700)
    binding = (
        "postgresql:///bench?host="
        f"{quote(str(socket_root), safe='')}&port=5432&sslmode=disable"
    )
    expected = hashlib.sha256(
        f"{socket_root.resolve()}:5432/bench".encode()
    ).hexdigest()
    assert database_identity("postgresql", binding) == expected


def test_errors_redact_urls_keyword_secrets_and_absolute_paths() -> None:
    message = (
        "failed postgresql://user:secret@db.example/cortex?sslmode=require "
        "password=another /private/tmp/checkout C:\\Users\\person\\checkout"
    )
    redacted = redact_sensitive(message)
    for secret in (
        "user",
        "secret",
        "another",
        "/private/tmp/checkout",
        "C:\\Users\\person\\checkout",
    ):
        assert secret not in redacted
    assert "postgresql://<redacted>" in redacted
    assert "<redacted-path>" in redacted
