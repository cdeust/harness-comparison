"""Create-exclusive, fsync-before-effect, SHA-256 chained JSONL journals."""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from types import MappingProxyType
from typing import Any, Mapping

from . import LEDGER_SCHEMA

_GENESIS_HASH = "0" * 64
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_IDENTITY_FIELDS = frozenset(
    {
        "release_id",
        "protocol_id",
        "protocol_sha256",
        "cell_id",
        "attempt_id",
        "process_instance_id",
    }
)
_RESERVED_FIELDS = _IDENTITY_FIELDS | {
    "schema",
    "sequence",
    "event",
    "recorded_at",
    "monotonic_ns",
    "prev_sha256",
    "line_sha256",
}


class JournalVerificationError(ValueError):
    """A ledger is malformed, incomplete, or fails its hash chain."""


def _canonical_bytes(value: dict[str, Any]) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


class ChainJournal:
    """Append-only writer backed by O_EXCL + O_APPEND and one fsync per line."""

    def __init__(self, path: Path, identities: Mapping[str, str]) -> None:
        missing = _IDENTITY_FIELDS - identities.keys()
        extra = identities.keys() - _IDENTITY_FIELDS
        if missing or extra or any(not identities[key] for key in _IDENTITY_FIELDS):
            raise ValueError(
                f"journal identities must be exactly {_IDENTITY_FIELDS}; "
                f"missing={sorted(missing)}, extra={sorted(extra)}"
            )
        if not _SHA256.fullmatch(identities["protocol_sha256"]):
            raise ValueError("protocol_sha256 must be lowercase SHA-256 hexadecimal")
        path.parent.mkdir(parents=True, exist_ok=True)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_APPEND
        self._fd = os.open(path, flags, 0o600)
        self.path = path
        self._sequence = 0
        self._previous = _GENESIS_HASH
        self._lock = threading.Lock()
        self._closed = False
        self._identities = MappingProxyType(dict(identities))

    def record(self, event: str, **fields: Any) -> dict[str, Any]:
        """Append and durably flush one event; returns the exact stored object."""
        with self._lock:
            if self._closed:
                raise ValueError("journal is closed")
            conflicts = _RESERVED_FIELDS & fields.keys()
            if conflicts:
                raise ValueError(
                    f"record cannot override journal-bound fields: {sorted(conflicts)}"
                )
            self._sequence += 1
            payload = {
                "schema": LEDGER_SCHEMA,
                "sequence": self._sequence,
                "event": event,
                "recorded_at": datetime.now(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
                "monotonic_ns": str(time.monotonic_ns()),
                "prev_sha256": self._previous,
                **self._identities,
                **fields,
            }
            digest = hashlib.sha256(_canonical_bytes(payload)).hexdigest()
            line = {**payload, "line_sha256": digest}
            encoded = _canonical_bytes(line) + b"\n"
            written = 0
            while written < len(encoded):
                count = os.write(self._fd, encoded[written:])
                if count == 0:
                    raise OSError("journal write made no progress")
                written += count
            os.fsync(self._fd)
            self._previous = digest
            return line

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            os.close(self._fd)
            self._closed = True

    def __enter__(self) -> ChainJournal:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()


def read_verified(path: Path) -> list[dict[str, Any]]:
    """Read JSONL and prove schema, sequence, predecessor, and line hashes."""
    records: list[dict[str, Any]] = []
    previous = _GENESIS_HASH
    bound_identity: dict[str, Any] | None = None
    with path.open("rb") as stream:
        for expected_sequence, raw_line in enumerate(stream, start=1):
            try:
                line = json.loads(raw_line)
            except json.JSONDecodeError as exc:
                raise JournalVerificationError(
                    f"invalid JSON at line {expected_sequence}: {exc}"
                ) from exc
            if not isinstance(line, dict):
                raise JournalVerificationError(
                    f"line {expected_sequence} is not a JSON object"
                )
            stored_hash = line.pop("line_sha256", None)
            computed_hash = hashlib.sha256(_canonical_bytes(line)).hexdigest()
            if line.get("schema") != LEDGER_SCHEMA:
                raise JournalVerificationError(
                    f"line {expected_sequence} has an unknown schema"
                )
            if line.get("sequence") != expected_sequence:
                raise JournalVerificationError(
                    f"line {expected_sequence} has a non-monotonic sequence"
                )
            if line.get("prev_sha256") != previous:
                raise JournalVerificationError(
                    f"line {expected_sequence} breaks the predecessor chain"
                )
            if stored_hash != computed_hash:
                raise JournalVerificationError(
                    f"line {expected_sequence} fails SHA-256 verification"
                )
            line_identity = {key: line.get(key) for key in _IDENTITY_FIELDS}
            if any(not line_identity[key] for key in _IDENTITY_FIELDS):
                raise JournalVerificationError(
                    f"line {expected_sequence} is missing a bound identity"
                )
            if bound_identity is None:
                bound_identity = line_identity
            elif line_identity != bound_identity:
                raise JournalVerificationError(
                    f"line {expected_sequence} changes a bound identity"
                )
            restored = {**line, "line_sha256": stored_hash}
            records.append(restored)
            previous = computed_hash
    if not records:
        raise JournalVerificationError("journal is empty")
    return records
