"""Utilities for querying CSV data through DuckDB."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Sequence

import duckdb

import pandas as pd

from ..core.settings import get_settings
from ..db.duckdb_session import duckdb_connection


@dataclass(slots=True)
class ColumnSchema:
    """Schema information for a single column."""

    name: str
    dtype: str
    null: bool


def list_csv_files(patterns: Sequence[str] | None = None) -> List[Path]:
    """Return CSV files located inside the configured data directory."""

    settings = get_settings()
    base = settings.csv_data_dir
    resolved_patterns = list(patterns) if patterns else ["*.csv"]

    matches: set[Path] = set()
    for pattern in resolved_patterns:
        matches.update(base.glob(pattern))

    return sorted(path for path in matches if path.is_file())


def _register_csv_view(
    conn: duckdb.DuckDBPyConnection,
    csv_path: Path | str,
    *,
    sample_size: int | None = None,
    view_name: str = "csv_view",
) -> None:
    """Create an in-memory DuckDB view for a CSV file."""

    settings = get_settings()
    raw_path = Path(csv_path)
    target = raw_path if raw_path.is_absolute() else settings.csv_data_dir / raw_path
    if not target.exists():
        raise FileNotFoundError(f"CSV file not found: {target}")

    effective_sample = sample_size or settings.duckdb_sample_size

    csv_literal = str(target).replace("'", "''")
    conn.execute(
        f"""
        CREATE OR REPLACE TEMP VIEW {view_name} AS
        SELECT *
        FROM read_csv_auto('{csv_literal}', SAMPLE_SIZE={int(effective_sample)})
        """
    )


def describe_csv(csv_path: Path | str, *, sample_size: int | None = None) -> List[ColumnSchema]:
    """Return column names, types, and nullability for the given CSV file."""

    with duckdb_connection() as conn:
        _register_csv_view(conn, csv_path, sample_size=sample_size, view_name="describe_view")
        rows = conn.execute("DESCRIBE describe_view").fetchall()

    return [
        ColumnSchema(name=row[0], dtype=row[1], null=row[2] == "YES")
        for row in rows
    ]


def preview_csv(
    csv_path: Path | str,
    *,
    limit: int = 20,
    offset: int = 0,
    sample_size: int | None = None,
) -> pd.DataFrame:
    """Fetch a paginated preview of the CSV data."""

    with duckdb_connection() as conn:
        _register_csv_view(conn, csv_path, sample_size=sample_size)
        df = conn.execute(
            """
            SELECT *
            FROM csv_view
            LIMIT ?
            OFFSET ?
            """,
            [limit, offset],
        ).fetch_df()

    return df


def count_rows(csv_path: Path | str, *, sample_size: int | None = None) -> int:
    """Return the total number of rows in the CSV file."""

    with duckdb_connection() as conn:
        _register_csv_view(conn, csv_path, sample_size=sample_size)
        total = conn.execute("SELECT COUNT(*) FROM csv_view").fetchone()[0]

    return int(total or 0)


def unique_values(
    csv_path: Path | str,
    column: str,
    *,
    limit: int = 20,
    sample_size: int | None = None,
) -> List[str]:
    """Return distinct values for a column (useful for filters)."""

    column_identifier = column.replace('"', '""')

    with duckdb_connection() as conn:
        _register_csv_view(conn, csv_path, sample_size=sample_size)
        values = conn.execute(
            f"""
            SELECT DISTINCT "{column_identifier}"
            FROM csv_view
            WHERE "{column_identifier}" IS NOT NULL
            LIMIT ?
            """,
            [limit],
        ).fetchall()

    return [value[0] for value in values]


def sample_rows(
    csv_path: Path | str,
    *,
    sample_size: int = 1000,
    seed: int | None = None,
    read_sample_size: int | None = None,
) -> pd.DataFrame:
    """Return a random sample of rows from the CSV."""

    with duckdb_connection() as conn:
        _register_csv_view(conn, csv_path, sample_size=read_sample_size)
        seed_clause = f" (SEED {int(seed)})" if seed is not None else ""
        df = conn.execute(
            f"""
            SELECT *
            FROM csv_view
            USING SAMPLE {int(sample_size)} ROWS{seed_clause}
            """,
        ).fetch_df()

    return df
