from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from collections import Counter
from copy import deepcopy
from pathlib import Path
from typing import Any, Callable

import mcp_server
import pytest

from hc_cortex_002.journal import read_verified

ADAPTER = Path(__file__).resolve().parents[1] / "adapter.py"


def command(
    mode: str,
    tmp_path: Path,
    process_id: str,
    *,
    backend: str = "sqlite",
    database: str | None = None,
    concurrency: int = 2,
    operations_per_type: int = 1,
) -> list[str]:
    return [
        sys.executable,
        str(ADAPTER),
        "--mode",
        mode,
        "--release-id",
        "test-release",
        "--protocol-id",
        "hc-cortex-002-test",
        "--protocol-sha256",
        "a" * 64,
        "--cell-id",
        f"{backend}-c{concurrency}",
        "--attempt-id",
        "test-attempt",
        "--process-instance-id",
        process_id,
        "--backend",
        backend,
        "--database",
        database or str(tmp_path / "store.sqlite3"),
        "--postgresql-service-instance-id",
        "b" * 64 if backend == "postgresql" else "not-applicable",
        "--postgresql-service-started-at",
        "2026-08-31T00:00:00.000Z" if backend == "postgresql" else "not-applicable",
        "--concurrency",
        str(concurrency),
        "--operations-per-type",
        str(operations_per_type),
        "--run-id",
        "test-run",
        "--output-dir",
        str(tmp_path),
    ]


def run(command_line: list[str]) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    return subprocess.run(command_line, text=True, capture_output=True, env=environment)


def independently_recompute_row_violations(
    workload_records: list[dict[str, Any]], observations: dict[str, Any]
) -> list[str]:
    """Test-only consumer: use raw rows, never the producer check ledger."""
    intents = {
        record["operation_id"]: record
        for record in workload_records
        if record["event"] == "operation_intent"
    }
    outcomes = {
        record["operation_id"]: record
        for record in workload_records
        if record["event"] == "operation_outcome"
    }
    rows = observations["rows"]
    rows_by_id = {row["id"]: row for row in rows}
    expected_contents: dict[str, int] = {}
    for intent in intents.values():
        content = intent.get("marker")
        if content is None:
            continue
        expected_contents[content] = int(
            intent["operation"] != "faulted_supersede"
            and not (
                intent["operation"] == "setup_seed"
                and intent.get("role") == "delete_target"
            )
        )
    actual_contents = Counter(row["content"] for row in rows)
    violations = [
        "marker"
        for content, expected in expected_contents.items()
        if actual_contents[content] != expected
    ]
    if any(content not in expected_contents for content in actual_contents):
        violations.append("unexpected-marker")
    for operation_id, intent in intents.items():
        if intent["operation"] == "supersede_atomic":
            result = outcomes[operation_id]["result"]
            old_row = rows_by_id.get(intent["target_id"])
            new_row = rows_by_id.get(result["memory_id"])
            if (
                old_row is None
                or new_row is None
                or old_row["superseded_by_id"] != result["memory_id"]
                or new_row["supersedes_id"] != intent["target_id"]
            ):
                violations.append("supersession")
        elif intent["operation"] == "forget" and intent["target_id"] in rows_by_id:
            violations.append("delete")
        elif intent["operation"] == "faulted_supersede":
            target = rows_by_id.get(intent["target_id"])
            if target is None or target["superseded_by_id"] is not None:
                violations.append("fault-rollback")
    return violations


def test_two_process_sqlite_fault_oracle_and_portable_artifacts(
    tmp_path: Path,
) -> None:
    workload = run(command("workload", tmp_path, "workload-process"))
    assert workload.returncode == 0, workload.stderr
    workload_envelope = json.loads(workload.stdout)
    assert workload_envelope == {
        "interface": "hc-cortex-002/v1",
        "ledger_path": "test-run.workload.jsonl",
        "mode": "workload",
        "status": "complete",
        "verdict": "pending",
    }
    workload_path = tmp_path / workload_envelope["ledger_path"]
    digest_before = hashlib.sha256(workload_path.read_bytes()).hexdigest()

    duplicate = run(command("workload", tmp_path, "duplicate-process"))
    assert duplicate.returncode == 2
    assert hashlib.sha256(workload_path.read_bytes()).hexdigest() == digest_before

    oracle = run(command("oracle", tmp_path, "oracle-process"))
    assert oracle.returncode == 0, oracle.stderr
    oracle_envelope = json.loads(oracle.stdout)
    assert oracle_envelope == {
        "interface": "hc-cortex-002/v1",
        "ledger_path": "test-run.oracle.jsonl",
        "mode": "oracle",
        "status": "complete",
        "verdict": "proven",
    }
    oracle_path = tmp_path / oracle_envelope["ledger_path"]
    result = next(
        record
        for record in read_verified(oracle_path)
        if record["event"] == "oracle_result"
    )
    assert all(check["passed"] for check in result["checks"].values())
    assert result["checks"]["memory_count"]["expected"] == 4

    workload_records = read_verified(workload_path)
    load_window = next(
        record for record in workload_records if record["event"] == "load_window"
    )
    start_ns = int(load_window["start_monotonic_ns"])
    end_ns = int(load_window["end_monotonic_ns"])
    elapsed_ns = int(load_window["elapsed_ns"])
    assert str(start_ns) == load_window["start_monotonic_ns"]
    assert str(end_ns) == load_window["end_monotonic_ns"]
    assert str(elapsed_ns) == load_window["elapsed_ns"]
    assert elapsed_ns == end_ns - start_ns
    load_intents = {
        record["operation_id"]: record
        for record in workload_records
        if record["event"] == "operation_intent" and record["phase"] == "load"
    }
    load_outcomes = [
        record
        for record in workload_records
        if record["event"] == "operation_outcome" and record["phase"] == "load"
    ]
    assert len(load_outcomes) == 4
    for outcome in load_outcomes:
        intent_ns = int(load_intents[outcome["operation_id"]]["monotonic_ns"])
        admission = outcome["admission"]
        entered_ns = int(admission["entered_monotonic_ns"])
        acquired_ns = int(admission["acquired_monotonic_ns"])
        released_ns = int(admission["released_monotonic_ns"])
        assert all(
            str(int(admission[field])) == admission[field]
            for field in (
                "entered_monotonic_ns",
                "acquired_monotonic_ns",
                "released_monotonic_ns",
            )
        )
        timing = outcome["timing"]
        finished_ns = acquired_ns + timing["service_ns"]
        assert timing["pre_admission_ns"] == entered_ns - intent_ns
        assert timing["queue_ns"] == acquired_ns - entered_ns
        assert timing["total_ns"] == finished_ns - intent_ns
        assert acquired_ns <= released_ns <= finished_ns
        assert start_ns <= intent_ns <= finished_ns <= end_ns
    recovery = [
        record
        for record in workload_records
        if record["event"] == "operation_intent"
        and record["operation"] == "recovery_health"
    ]
    assert len(recovery) == 1
    assert recovery[0]["marker"] is None
    summary = next(
        record
        for record in workload_records
        if record["event"] == "measurement_summary"
    )["observations"]
    assert summary["load"]["completed_operations"] == 4
    assert summary["model_tool_cost"] == {
        "model_calls": 0,
        "remote_tool_calls": 0,
        "attributable_cost": None,
        "unit": "not-applicable",
    }
    assert summary["connections"]["open_after_load"] >= 1
    assert summary["connections"]["peak_open"] >= 1
    assert summary["recovery"]["result"]["memory_count"] == 4
    assert summary["load"]["elapsed_ns"] == elapsed_ns

    snapshot = result["observations"]
    assert snapshot["persisted_state_schema"] == "hc-cortex-002/persisted-state/v1"
    assert snapshot["backend"] == "sqlite"
    assert snapshot["scope"] == {
        "domain": "hc-cortex-002",
        "agent_context": "test-run",
    }
    assert snapshot["postgresql_constraints"] == "not_applicable"
    assert all(
        set(row)
        == {
            "id",
            "content",
            "supersedes_id",
            "superseded_by_id",
            "fts_populated",
            "vector_populated",
        }
        for row in snapshot["rows"]
    )
    assert snapshot["memory_count"] == len(snapshot["rows"])
    assert snapshot["fts_count"] == sum(
        row["fts_populated"] for row in snapshot["rows"]
    )
    assert snapshot["vector_count"] == sum(
        row["vector_populated"] for row in snapshot["rows"]
    )
    assert independently_recompute_row_violations(workload_records, snapshot) == []

    def corrupt_content(rows: list[dict[str, Any]]) -> None:
        rows[0]["content"] = "forged-clean-verdict-content"

    def corrupt_supersession(rows: list[dict[str, Any]]) -> None:
        old_row = next(row for row in rows if row["superseded_by_id"] is not None)
        old_row["superseded_by_id"] = None

    mutations: tuple[Callable[[list[dict[str, Any]]], None], ...] = (
        corrupt_content,
        corrupt_supersession,
    )
    for mutation in mutations:
        forged_clean_result = deepcopy(result)
        mutation(forged_clean_result["observations"]["rows"])
        assert forged_clean_result["verdict"] == "proven"
        assert all(check["passed"] for check in forged_clean_result["checks"].values())
        assert independently_recompute_row_violations(
            workload_records, forged_clean_result["observations"]
        )

    checkout = str(Path(mcp_server.__file__).resolve().parent.parent)
    database = str((tmp_path / "store.sqlite3").resolve())
    published = "".join(
        (
            workload.stdout,
            workload.stderr,
            duplicate.stdout,
            duplicate.stderr,
            oracle.stdout,
            oracle.stderr,
            workload_path.read_text(),
            oracle_path.read_text(),
        )
    )
    assert checkout not in published
    assert database not in published
    assert str(tmp_path.resolve()) not in published


def test_postgres_argv_secret_is_rejected_without_artifact_leak(tmp_path: Path) -> None:
    secret = "never-publish-this-password"
    database = f"postgresql://benchmark:{secret}@localhost/bench"
    result = run(
        command(
            "workload",
            tmp_path,
            "secret-process",
            backend="postgresql",
            database=database,
        )
    )
    assert result.returncode == 2
    assert secret not in result.stdout
    assert secret not in result.stderr
    assert database not in result.stdout
    assert database not in result.stderr
    assert not list(tmp_path.glob("*.jsonl"))
    assert json.loads(result.stdout)["ledger_path"] == "test-run.workload.jsonl"


@pytest.mark.parametrize(("concurrency", "queue_expected"), ((4, False), (5, True)))
def test_initial_closed_loop_cohort_observes_real_source_admission_queue(
    tmp_path: Path, concurrency: int, queue_expected: bool
) -> None:
    cell_dir = tmp_path / f"c{concurrency}"
    cell_dir.mkdir()
    workload = run(
        command(
            "workload",
            cell_dir,
            f"workload-c{concurrency}",
            concurrency=concurrency,
            operations_per_type=6,
        )
    )
    assert workload.returncode == 0, workload.stderr
    records = read_verified(cell_dir / "test-run.workload.jsonl")
    scheduler = next(
        record for record in records if record["event"] == "scheduler_cohort"
    )
    assert scheduler["policy"] == "closed_loop_fixed_workers"
    assert scheduler["worker_count"] == concurrency
    assert scheduler["initial_operation_types"] == ["remember"] * concurrency
    summary = next(
        record for record in records if record["event"] == "measurement_summary"
    )["observations"]["load"]
    assert summary["max_dispatcher_inflight"] <= concurrency
    if queue_expected:
        assert summary["max_queue_depth"] >= 1
        assert summary["per_operation_type"]["remember"]["queue_latency_ns"] is not None
    else:
        assert summary["max_queue_depth"] == 0
