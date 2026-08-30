#!/usr/bin/env python3
"""Command-line boundary for the HC-CORTEX-002 benchmark adapter."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from hc_cortex_002.oracle import Oracle, OracleConfig
from hc_cortex_002.provenance import redact_sensitive, validate_database_binding
from hc_cortex_002.workload import Workload, WorkloadConfig

INTERFACE = "hc-cortex-002/v1"
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Deterministic HC-CORTEX-002 transaction-isolation adapter"
    )
    result.add_argument("--mode", choices=("workload", "oracle"), required=True)
    result.add_argument("--release-id", required=True)
    result.add_argument("--protocol-id", required=True)
    result.add_argument("--protocol-sha256", required=True)
    result.add_argument("--cell-id", required=True)
    result.add_argument("--attempt-id", required=True)
    result.add_argument("--process-instance-id", required=True)
    result.add_argument("--backend", choices=("sqlite", "postgresql"), required=True)
    result.add_argument("--database", required=True)
    result.add_argument("--postgresql-service-instance-id", required=True)
    result.add_argument("--postgresql-service-started-at", required=True)
    result.add_argument("--concurrency", type=int, required=True)
    result.add_argument("--operations-per-type", type=int, required=True)
    result.add_argument("--run-id", required=True)
    result.add_argument("--output-dir", type=Path, required=True)
    return result


def _validate(args: argparse.Namespace) -> None:
    for name in (
        "release_id",
        "protocol_id",
        "cell_id",
        "attempt_id",
        "process_instance_id",
        "run_id",
    ):
        if not _SAFE_ID.fullmatch(getattr(args, name)):
            raise ValueError(
                f"--{name.replace('_', '-')} is not a safe non-empty identifier"
            )
    if not _SHA256.fullmatch(args.protocol_sha256):
        raise ValueError(
            "--protocol-sha256 must be 64 lowercase hexadecimal characters"
        )
    if args.concurrency < 1:
        raise ValueError("--concurrency must be positive")
    if args.operations_per_type < 1:
        raise ValueError("--operations-per-type must be positive")
    if args.backend == "sqlite" and args.database == ":memory:":
        raise ValueError(
            "SQLite :memory: cannot satisfy the required fresh-process oracle"
        )
    validate_database_binding(args.backend, args.database)
    if args.backend == "postgresql":
        if not _SHA256.fullmatch(args.postgresql_service_instance_id):
            raise ValueError("PostgreSQL service instance must be a SHA-256 identity")
        try:
            started_at = args.postgresql_service_started_at
            if not started_at.endswith("Z"):
                raise ValueError
            datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        except (AttributeError, ValueError) as exc:
            raise ValueError("PostgreSQL service start must be a UTC timestamp") from exc
    elif (
        args.postgresql_service_instance_id != "not-applicable"
        or args.postgresql_service_started_at != "not-applicable"
    ):
        raise ValueError("SQLite cells cannot bind a PostgreSQL service")


def _identities(args: argparse.Namespace) -> dict[str, str]:
    return {
        "release_id": args.release_id,
        "protocol_id": args.protocol_id,
        "protocol_sha256": args.protocol_sha256,
        "cell_id": args.cell_id,
        "attempt_id": args.attempt_id,
        "process_instance_id": args.process_instance_id,
    }


async def _run(args: argparse.Namespace) -> dict[str, Any]:
    common = {
        "backend": args.backend,
        "database": (
            str(Path(args.database).expanduser().resolve())
            if args.backend == "sqlite"
            else args.database
        ),
        "concurrency": args.concurrency,
        "operations_per_type": args.operations_per_type,
        "run_id": args.run_id,
        "postgresql_service_instance_id": args.postgresql_service_instance_id,
        "postgresql_service_started_at": args.postgresql_service_started_at,
        "output_dir": args.output_dir.expanduser().resolve(),
        "identities": _identities(args),
    }
    if args.mode == "workload":
        return await Workload(WorkloadConfig(**common)).run()
    return await Oracle(OracleConfig(**common)).run()


def _envelope(args: argparse.Namespace, result: dict[str, Any]) -> dict[str, Any]:
    return {
        "interface": INTERFACE,
        "mode": args.mode,
        "status": result["status"],
        "ledger_path": result["ledger_path"],
        "verdict": result["verdict"],
    }


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    suffix = "workload" if args.mode == "workload" else "oracle"
    anticipated_path = f"{args.run_id}.{suffix}.jsonl"
    source_logger = logging.getLogger("mcp_server.tool_error_handler")
    logger_was_disabled = source_logger.disabled
    try:
        _validate(args)
        # Cortex logs expected handler failures with absolute source tracebacks.
        # The chained ledger is the portable diagnostic boundary for this run.
        source_logger.disabled = True
        try:
            result = asyncio.run(_run(args))
        finally:
            source_logger.disabled = logger_was_disabled
        print(json.dumps(_envelope(args, result), sort_keys=True))
        return 1 if args.mode == "oracle" and result["verdict"] == "blocked" else 0
    except (KeyboardInterrupt, asyncio.CancelledError) as exc:
        print(f"adapter interrupted: {redact_sensitive(str(exc))}", file=sys.stderr)
        print(
            json.dumps(
                _envelope(
                    args,
                    {
                        "status": "indeterminate",
                        "ledger_path": anticipated_path,
                        "verdict": "blocked",
                    },
                ),
                sort_keys=True,
            )
        )
        return 2
    except Exception as exc:
        print(
            f"adapter failed: {type(exc).__name__}: {redact_sensitive(str(exc))}",
            file=sys.stderr,
        )
        print(
            json.dumps(
                _envelope(
                    args,
                    {
                        "status": "failed",
                        "ledger_path": anticipated_path,
                        "verdict": "blocked",
                    },
                ),
                sort_keys=True,
            )
        )
        return 2
    finally:
        source_logger.disabled = logger_was_disabled


if __name__ == "__main__":
    raise SystemExit(main())
