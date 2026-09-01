from __future__ import annotations

import os
from pathlib import Path

import pytest

from hc_cortex_002.journal import ChainJournal, read_verified


def identities() -> dict[str, str]:
    return {
        "release_id": "release-1",
        "protocol_id": "hc-cortex-002",
        "protocol_sha256": "a" * 64,
        "cell_id": "sqlite-c1",
        "attempt_id": "attempt-1",
        "process_instance_id": "process-1",
    }


def test_journal_is_exclusive_chained_and_identity_bound(tmp_path: Path) -> None:
    path = tmp_path / "ledger.jsonl"
    source = identities()
    journal = ChainJournal(path, source)
    source["release_id"] = "mutated-after-construction"
    journal.record("first", value=1)
    journal.record("second", value=2)
    with pytest.raises(ValueError, match="override"):
        journal.record("third", release_id="drift")
    journal.close()

    records = read_verified(path)
    assert [record["sequence"] for record in records] == [1, 2]
    assert {record["release_id"] for record in records} == {"release-1"}
    assert records[1]["prev_sha256"] == records[0]["line_sha256"]
    assert all(record["recorded_at"].endswith("Z") for record in records)
    with pytest.raises(FileExistsError):
        ChainJournal(path, identities())


def test_journal_retries_short_writes_before_fsync(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "short-write.jsonl"
    real_write = os.write

    def short_write(fd: int, data: bytes) -> int:
        return real_write(fd, data[:7])

    monkeypatch.setattr(os, "write", short_write)
    journal = ChainJournal(path, identities())
    journal.record("short-write", value="complete-line")
    journal.close()
    assert read_verified(path)[0]["value"] == "complete-line"


def test_journal_requires_exact_identity_set(tmp_path: Path) -> None:
    invalid = identities()
    invalid.pop("cell_id")
    with pytest.raises(ValueError, match="identities"):
        ChainJournal(tmp_path / "invalid.jsonl", invalid)
