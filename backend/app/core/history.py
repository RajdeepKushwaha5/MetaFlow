"""SQLite-backed conversation history for MetaFlow.

Stores chat messages persistently so users can revisit past conversations.
Uses aiosqlite for async access from FastAPI endpoints.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

_logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parents[2] / "conversations.db"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables if they don't exist."""
    conn = _get_conn()
    try:
        conn.executescript(
            """\
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id)
            );
            CREATE INDEX IF NOT EXISTS idx_messages_conv
                ON messages(conversation_id);
            """
        )
        conn.commit()
    finally:
        conn.close()


def save_message(conversation_id: str, role: str, content: str, title: str | None = None) -> None:
    """Persist a single message. Creates the conversation if needed."""
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    try:
        existing = conn.execute(
            "SELECT id FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        if not existing:
            conv_title = title or content[:80]
            conn.execute(
                "INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)",
                (conversation_id, conv_title, now),
            )
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
            (conversation_id, role, content, now),
        )
        conn.commit()
    finally:
        conn.close()


def list_conversations(limit: int = 50) -> list[dict]:
    """Return recent conversations with message counts."""
    conn = _get_conn()
    try:
        rows = conn.execute(
            """\
            SELECT c.id, c.title, c.created_at,
                   COUNT(m.id) AS message_count
            FROM conversations c
            LEFT JOIN messages m ON m.conversation_id = c.id
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_conversation(conversation_id: str) -> dict | None:
    """Return a conversation with all its messages."""
    conn = _get_conn()
    try:
        conv = conn.execute(
            "SELECT id, title, created_at FROM conversations WHERE id = ?",
            (conversation_id,),
        ).fetchone()
        if not conv:
            return None
        msgs = conn.execute(
            "SELECT role, content, timestamp FROM messages WHERE conversation_id = ? ORDER BY id",
            (conversation_id,),
        ).fetchall()
        return {
            "id": conv["id"],
            "title": conv["title"],
            "created_at": conv["created_at"],
            "messages": [dict(m) for m in msgs],
        }
    finally:
        conn.close()


def delete_conversation(conversation_id: str) -> bool:
    """Delete a conversation and its messages."""
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
        cur = conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
