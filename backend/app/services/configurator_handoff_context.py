"""Server-side trusted Configurator handoff context storage (AUTH-2E3C)."""

from __future__ import annotations

import json
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

_CONTEXT_TTL = timedelta(minutes=10)


@dataclass(frozen=True)
class ConfiguratorPrepareContext:
    context_id: str
    account_id: str
    operation: str
    inquiry_id: str
    trusted_transfer: dict[str, Any]
    created_at: datetime
    expires_at: datetime
    claimed_at: datetime | None
    claim_id: str | None
    consumed_at: datetime | None


@dataclass(frozen=True)
class ConfiguratorPrepareContextClaim:
    context_id: str
    claim_id: str


@dataclass(frozen=True)
class ConfiguratorPrepareContextClaimResult:
    status: str
    claim: ConfiguratorPrepareContextClaim | None = None


class ConfiguratorPrepareContextStore:
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            self._ensure_schema(connection)

    def create(
        self,
        *,
        account_id: str,
        operation: str,
        inquiry_id: str,
        trusted_transfer: dict[str, Any],
        now: datetime | None = None,
    ) -> ConfiguratorPrepareContext:
        created_at = now or datetime.now(UTC)
        expires_at = created_at + _CONTEXT_TTL
        context = ConfiguratorPrepareContext(
            context_id=secrets.token_urlsafe(24),
            account_id=account_id,
            operation=operation,
            inquiry_id=inquiry_id,
            trusted_transfer=trusted_transfer,
            created_at=created_at,
            expires_at=expires_at,
            claimed_at=None,
            claim_id=None,
            consumed_at=None,
        )
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO configurator_prepare_contexts (
                    context_id,
                    account_id,
                    operation,
                    inquiry_id,
                    trusted_transfer_json,
                    created_at,
                    expires_at,
                    claimed_at,
                    claim_id,
                    consumed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    context.context_id,
                    context.account_id,
                    context.operation,
                    context.inquiry_id,
                    json.dumps(context.trusted_transfer, separators=(",", ":")),
                    context.created_at.isoformat(),
                    context.expires_at.isoformat(),
                    None,
                    None,
                    None,
                ),
            )
            connection.commit()
        return context

    def get(self, context_id: str) -> ConfiguratorPrepareContext | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    context_id,
                    account_id,
                    operation,
                    inquiry_id,
                    trusted_transfer_json,
                    created_at,
                    expires_at,
                    claimed_at,
                    claim_id,
                    consumed_at
                FROM configurator_prepare_contexts
                WHERE context_id = ?
                """,
                (context_id,),
            ).fetchone()
        if row is None:
            return None
        return ConfiguratorPrepareContext(
            context_id=str(row[0]),
            account_id=str(row[1]),
            operation=str(row[2]),
            inquiry_id=str(row[3]),
            trusted_transfer=_load_transfer_json(str(row[4])),
            created_at=datetime.fromisoformat(str(row[5])),
            expires_at=datetime.fromisoformat(str(row[6])),
            claimed_at=datetime.fromisoformat(str(row[7])) if row[7] else None,
            claim_id=str(row[8]) if row[8] else None,
            consumed_at=datetime.fromisoformat(str(row[9])) if row[9] else None,
        )

    def claim(
        self,
        *,
        context_id: str,
        account_id: str,
        now: datetime | None = None,
    ) -> ConfiguratorPrepareContextClaimResult:
        claim_now = now or datetime.now(UTC)
        claim_id = str(uuid4())
        with self._connect() as connection:
            updated = connection.execute(
                """
                UPDATE configurator_prepare_contexts
                SET claimed_at = ?, claim_id = ?
                WHERE context_id = ?
                  AND account_id = ?
                  AND consumed_at IS NULL
                  AND expires_at > ?
                  AND claimed_at IS NULL
                  AND claim_id IS NULL
                """,
                (
                    claim_now.isoformat(),
                    claim_id,
                    context_id,
                    account_id,
                    claim_now.isoformat(),
                ),
            ).rowcount
            connection.commit()
        if updated == 1:
            return ConfiguratorPrepareContextClaimResult(
                status="claimed",
                claim=ConfiguratorPrepareContextClaim(
                    context_id=context_id, claim_id=claim_id
                ),
            )
        context = self.get(context_id)
        if context is None:
            return ConfiguratorPrepareContextClaimResult(status="not_found")
        if context.account_id != account_id:
            return ConfiguratorPrepareContextClaimResult(status="wrong_account")
        if context.consumed_at is not None:
            return ConfiguratorPrepareContextClaimResult(status="consumed")
        if context.expires_at <= claim_now:
            return ConfiguratorPrepareContextClaimResult(status="expired")
        if context.claimed_at is not None or context.claim_id is not None:
            return ConfiguratorPrepareContextClaimResult(status="active_claim")
        return ConfiguratorPrepareContextClaimResult(status="not_claimable")

    def release_claim(
        self,
        *,
        context_id: str,
        claim_id: str,
    ) -> bool:
        with self._connect() as connection:
            updated = connection.execute(
                """
                UPDATE configurator_prepare_contexts
                SET claimed_at = NULL,
                    claim_id = NULL
                WHERE context_id = ?
                  AND claim_id = ?
                  AND consumed_at IS NULL
                """,
                (context_id, claim_id),
            ).rowcount
            connection.commit()
        return updated == 1

    def consume(
        self,
        *,
        context_id: str,
        claim_id: str,
        now: datetime | None = None,
    ) -> bool:
        consumed_at = now or datetime.now(UTC)
        with self._connect() as connection:
            updated = connection.execute(
                """
                UPDATE configurator_prepare_contexts
                SET consumed_at = ?,
                    claimed_at = NULL,
                    claim_id = NULL
                WHERE context_id = ?
                  AND claim_id = ?
                  AND consumed_at IS NULL
                """,
                (consumed_at.isoformat(), context_id, claim_id),
            ).rowcount
            connection.commit()
        return updated == 1

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self._db_path))

    @staticmethod
    def _ensure_schema(connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS configurator_prepare_contexts (
                context_id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                inquiry_id TEXT NOT NULL,
                trusted_transfer_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                claimed_at TEXT,
                claim_id TEXT,
                consumed_at TEXT
            )
            """
        )
        columns = {
            str(row[1])
            for row in connection.execute(
                "PRAGMA table_info(configurator_prepare_contexts)"
            ).fetchall()
        }
        for name in ("claimed_at", "claim_id"):
            if name not in columns:
                connection.execute(
                    f"ALTER TABLE configurator_prepare_contexts ADD COLUMN {name} TEXT"
                )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_configurator_prepare_contexts_account
            ON configurator_prepare_contexts (account_id, operation)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_configurator_prepare_contexts_expiry
            ON configurator_prepare_contexts (expires_at, consumed_at)
            """
        )


def _load_transfer_json(raw: str) -> dict[str, Any]:
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("trusted transfer must be an object")
    return parsed
