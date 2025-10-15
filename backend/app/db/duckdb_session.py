"""DuckDB connection helpers."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import duckdb

from ..core.settings import get_settings


def _database_path() -> str:
    settings = get_settings()
    path: Path = settings.duckdb_database_path
    if str(path) == ":memory:":
        return ":memory:"
    path.parent.mkdir(parents=True, exist_ok=True)
    return str(path)


@contextmanager
def duckdb_connection(read_only: bool = False) -> Iterator[duckdb.DuckDBPyConnection]:
    """Yield a DuckDB connection, ensuring it is closed afterwards."""

    conn = duckdb.connect(database=_database_path(), read_only=read_only)
    try:
        yield conn
    finally:
        conn.close()
