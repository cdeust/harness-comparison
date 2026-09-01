"""Portable runtime identity, safe database binding, and error redaction."""

from __future__ import annotations

import hashlib
import importlib.metadata
import os
import platform
import re
import sqlite3
import stat
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ZERO_MODEL_TOOL_COST = {
    "model_calls": 0,
    "remote_tool_calls": 0,
    "attributable_cost": None,
    "unit": "not-applicable",
}


class DatabaseFreshnessError(RuntimeError):
    """A workload target already contains user-owned database state."""


_SECRET_CONNINFO_KEYS = frozenset(
    {"password", "passfile", "sslpassword", "sslkey", "service", "servicefile"}
)


def validate_database_binding(backend: str, database: str) -> None:
    """Reject PostgreSQL argv bindings that expose secrets or remote services."""
    if backend == "sqlite":
        return
    try:
        from psycopg.conninfo import conninfo_to_dict

        values = conninfo_to_dict(database)
    except Exception as exc:
        raise ValueError(
            "PostgreSQL binding is not a valid credential-free local DSN"
        ) from exc
    if any(values.get(key) for key in _SECRET_CONNINFO_KEYS):
        raise ValueError(
            "PostgreSQL binding must not contain credentials or secret-file settings"
        )
    host = str(values.get("host") or "")
    if (
        "," in host
        or not Path(host).is_absolute()
        or values.get("hostaddr")
        or values.get("user")
        or str(values.get("port") or "5432") != "5432"
        or values.get("sslmode") != "disable"
    ):
        raise ValueError(
            "PostgreSQL binding must target the registered private Unix socket"
        )
    socket_root = Path(host)
    try:
        resolved = socket_root.resolve(strict=True)
        status = resolved.stat()
    except OSError as exc:
        raise ValueError("PostgreSQL Unix socket directory is unavailable") from exc
    if resolved != socket_root or not resolved.is_dir():
        raise ValueError(
            "PostgreSQL Unix socket directory must not traverse symbolic links"
        )
    if stat.S_IMODE(status.st_mode) != 0o700 or (
        hasattr(os, "getuid") and status.st_uid != os.getuid()
    ):
        raise ValueError(
            "PostgreSQL Unix socket directory must be owner-controlled mode 0700"
        )


def database_identity(backend: str, database: str) -> str:
    """Hash a local path or credential-free PostgreSQL connection identity."""
    if backend == "sqlite":
        canonical = str(Path(database).expanduser().resolve())
    else:
        try:
            from psycopg.conninfo import conninfo_to_dict

            values = conninfo_to_dict(database)
        except Exception as exc:
            raise ValueError(
                "PostgreSQL binding could not be parsed into a secretless identity"
            ) from exc
        host = str(values.get("host") or "")
        database_name = str(values.get("dbname") or "")
        port = str(values.get("port") or "5432")
        if not host or not database_name:
            raise ValueError("PostgreSQL binding has no database identity")
        canonical = f"{Path(host).resolve(strict=True)}:{port}/{database_name}"
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def postgres_service_observation(database: str) -> dict[str, Any]:
    """Read live postmaster identity through the exact benchmark binding."""
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(database, autocommit=True, row_factory=dict_row) as connection:
        row = connection.execute(
            "SELECT pg_postmaster_start_time() AS started_at, "
            "current_database() AS database_name, inet_server_addr() AS server_address"
        ).fetchone()
    if row is None or row["server_address"] is not None:
        raise RuntimeError("PostgreSQL service identity is not a Unix-socket session")
    started_at = row["started_at"]
    if not isinstance(started_at, datetime) or started_at.tzinfo is None:
        raise RuntimeError("PostgreSQL service start time is not timezone-aware")
    return {
        "started_at": started_at.astimezone(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z"),
        "database_name": str(row["database_name"]),
        "server_inet_address": None,
    }


def verified_postgres_service(
    backend: str,
    database: str,
    service_instance_id: str,
    expected_started_at: str,
) -> dict[str, Any] | None:
    """Bind a live PostgreSQL connection to the immutable service receipt."""
    if backend != "postgresql":
        return None
    from psycopg.conninfo import conninfo_to_dict

    observed = postgres_service_observation(database)
    expected_database = str(conninfo_to_dict(database).get("dbname") or "")
    if (
        observed["started_at"] != expected_started_at
        or observed["database_name"] != expected_database
    ):
        raise RuntimeError("PostgreSQL live service contradicts its receipt")
    return {
        "service_instance_id": service_instance_id,
        "started_at": observed["started_at"],
        "server_inet_address": None,
    }


def cortex_runtime_identity() -> dict[str, Any]:
    """Return portable provenance without publishing private host paths."""
    import mcp_server

    package_file = Path(mcp_server.__file__).resolve()
    checkout = package_file.parent.parent
    tree_status = _git_value(checkout, "status", "--porcelain")
    try:
        distribution_version = importlib.metadata.version("hypermnesia-mcp")
    except importlib.metadata.PackageNotFoundError:
        distribution_version = None
    return {
        "cortex_commit": _git_value(checkout, "rev-parse", "HEAD"),
        "cortex_checkout_identity_sha256": _sha256_text(str(checkout)),
        "cortex_tree_dirty": None if tree_status is None else bool(tree_status),
        "mcp_server_init_sha256": hashlib.sha256(package_file.read_bytes()).hexdigest(),
        "distribution_version": distribution_version,
        "python_executable_name": Path(sys.executable).name,
        "python_executable_identity_sha256": _sha256_text(sys.executable),
        "python_version": platform.python_version(),
        "platform": platform.platform(),
    }


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _git_value(checkout: Path, *args: str) -> str | None:
    completed = subprocess.run(
        ["git", "-C", str(checkout), *args],
        check=False,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip() if completed.returncode == 0 else None


def database_freshness_observation(backend: str, database: str) -> dict[str, Any]:
    """Observe a target before store construction; never clean or migrate it."""
    if backend == "sqlite":
        path = Path(database).expanduser().resolve()
        existing_bytes = path.stat().st_size if path.exists() else 0
        relation_count = _sqlite_user_relation_count(path, existing_bytes)
        return {
            "checked_before_store_initialization": True,
            "method": "sqlite_master_non_internal_relations",
            "empty": relation_count == 0,
            "user_relation_count": relation_count,
            "existing_bytes": existing_bytes,
        }
    relation_count = _postgres_user_relation_count(database)
    return {
        "checked_before_store_initialization": True,
        "method": "pg_catalog_non_system_non_extension_relations",
        "empty": relation_count == 0,
        "user_relation_count": relation_count,
    }


def require_fresh_database(backend: str, database: str) -> dict[str, Any]:
    observation = database_freshness_observation(backend, database)
    if not observation["empty"]:
        raise DatabaseFreshnessError(
            "benchmark database is not fresh: "
            f"observed {observation['user_relation_count']} user relation(s)"
        )
    return observation


def _sqlite_user_relation_count(path: Path, existing_bytes: int) -> int:
    if not path.exists() or existing_bytes == 0:
        return 0
    uri = f"file:{path.as_posix()}?mode=ro"
    try:
        connection = sqlite3.connect(uri, uri=True)
        try:
            row = connection.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
            ).fetchone()
        finally:
            connection.close()
    except sqlite3.Error as exc:
        raise DatabaseFreshnessError(
            "existing SQLite target could not be proven empty"
        ) from exc
    if row is None:
        raise DatabaseFreshnessError("SQLite freshness aggregate returned no row")
    return int(row[0])


def _postgres_user_relation_count(database: str) -> int:
    import psycopg
    from psycopg.rows import dict_row

    query = """
        SELECT COUNT(*) AS relation_count
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND namespace.nspname NOT LIKE 'pg_temp_%'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
          AND NOT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_depend AS dependency
              WHERE dependency.classid = 'pg_class'::regclass
                AND dependency.objid = relation.oid
                AND dependency.deptype = 'e'
          )
    """
    with psycopg.connect(database, autocommit=True, row_factory=dict_row) as connection:
        row = connection.execute(query).fetchone()
    if row is None:
        raise DatabaseFreshnessError("PostgreSQL freshness aggregate returned no row")
    return int(row["relation_count"])


def json_safe_error(exc: BaseException) -> dict[str, str]:
    return {"type": type(exc).__name__, "message": redact_sensitive(str(exc))}


def redact_sensitive(value: str) -> str:
    """Remove credentials and absolute host paths from public artifacts."""
    redacted = re.sub(
        r"postgres(?:ql)?://[^\s'\"\]\[(){}]+",
        "postgresql://<redacted>",
        value,
        flags=re.IGNORECASE,
    )
    redacted = re.sub(
        r"\b(?:password|passfile)\s*=\s*(?:'[^']*'|\S+)",
        "password=<redacted>",
        redacted,
        flags=re.IGNORECASE,
    )
    redacted = re.sub(
        r"(?<![A-Za-z0-9])(?:[A-Za-z]:\\|\\\\)[^\s'\"<>|]+",
        "<redacted-path>",
        redacted,
    )
    return re.sub(
        r"(?<![:A-Za-z0-9])/(?:[^/\s'\"<>|:]+/)*[^/\s'\"<>|:]+",
        "<redacted-path>",
        redacted,
    )
