"""Utilities for querying CSV data through DuckDB."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from pathlib import Path
from typing import Any, List, Sequence

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


@dataclass(slots=True)
class FilterSpec:
    """Filtering specification for query construction."""

    column: str
    operator: str = "eq"
    value: Any | None = None


@dataclass(slots=True)
class SortSpec:
    """Ordering specification for query construction."""

    column: str
    descending: bool = False


@dataclass(slots=True)
class ColumnSummary:
    """Aggregated statistics for a column."""

    column: str
    dtype: str
    total_rows: int
    null_count: int
    non_null_count: int
    distinct_count: int
    min_value: Any | None = None
    max_value: Any | None = None
    mean_value: float | None = None
    stddev_value: float | None = None


def list_csv_files(patterns: Sequence[str] | None = None) -> List[Path]:
    """Return data files located inside the configured data directory.

    Includes both CSV and Parquet files by default. When auto conversion is enabled,
    missing or outdated Parquet counterparts are generated on the fly.
    """

    settings = get_settings()
    base = settings.csv_data_dir
    resolved_patterns = list(patterns) if patterns else ["*.csv", "*.parquet"]

    matches: set[Path] = set()
    for pattern in resolved_patterns:
        matches.update(base.glob(pattern))

    if settings.auto_convert_to_parquet:
        for path in list(matches):
            if path.suffix.lower() != ".csv":
                continue

            parquet_path = path.with_suffix(".parquet")
            try:
                _ensure_parquet_cache(path, parquet_path)
            except Exception:  # pragma: no cover - safeguard to avoid aborting listing
                continue
            else:
                matches.add(parquet_path)
                matches.discard(path)

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
    if target.suffix.lower() == ".parquet":
        conn.execute(
            f"""
            CREATE OR REPLACE TEMP VIEW {view_name} AS
            SELECT *
            FROM read_parquet('{csv_literal}')
            """
        )
    else:
        conn.execute(
            f"""
            CREATE OR REPLACE TEMP VIEW {view_name} AS
            SELECT *
            FROM read_csv_auto('{csv_literal}', SAMPLE_SIZE={int(effective_sample)})
            """
        )


def _ensure_parquet_cache(csv_path: Path, parquet_path: Path) -> None:
    """Ensure a Parquet copy exists and is up-to-date for the given CSV."""

    if parquet_path.exists() and parquet_path.stat().st_mtime >= csv_path.stat().st_mtime:
        return

    settings = get_settings()
    parquet_path.parent.mkdir(parents=True, exist_ok=True)

    csv_literal = str(csv_path).replace("'", "''")
    parquet_literal = str(parquet_path).replace("'", "''")

    with duckdb_connection() as conn:
        conn.execute(
            f"""
            COPY (
                SELECT *
                FROM read_csv_auto('{csv_literal}', SAMPLE_SIZE={int(settings.duckdb_sample_size)})
            )
            TO '{parquet_literal}'
            (FORMAT 'parquet', ROW_GROUP_SIZE {int(settings.parquet_row_group_size)})
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


def _quote_identifier(name: str) -> str:
    """Quote a SQL identifier safely."""

    return name.replace('"', '""')


def _build_filters_clause(filters: Sequence[FilterSpec] | None, params: List[Any]) -> str:
    """Build a WHERE clause using filter specifications."""

    if not filters:
        return ""

    clauses: list[str] = []
    for spec in filters:
        column = _quote_identifier(spec.column)
        operator = spec.operator.lower()
        if operator == "eq":
            clauses.append(f'"{column}" = ?')
            params.append(spec.value)
        elif operator == "ne":
            clauses.append(f'"{column}" <> ?')
            params.append(spec.value)
        elif operator == "lt":
            clauses.append(f'"{column}" < ?')
            params.append(spec.value)
        elif operator == "lte":
            clauses.append(f'"{column}" <= ?')
            params.append(spec.value)
        elif operator == "gt":
            clauses.append(f'"{column}" > ?')
            params.append(spec.value)
        elif operator == "gte":
            clauses.append(f'"{column}" >= ?')
            params.append(spec.value)
        elif operator == "contains":
            clauses.append(f'"{column}" ILIKE ?')
            params.append(f"%{spec.value}%")
        else:
            raise ValueError(f"Unsupported filter operator: {spec.operator}")

    return " WHERE " + " AND ".join(clauses)


def _build_order_clause(order_by: Sequence[SortSpec] | None) -> str:
    """Build an ORDER BY clause."""

    if not order_by:
        return ""

    parts = []
    for spec in order_by:
        column = _quote_identifier(spec.column)
        direction = "DESC" if spec.descending else "ASC"
        parts.append(f'"{column}" {direction}')

    return " ORDER BY " + ", ".join(parts)


def preview_csv(
    csv_path: Path | str,
    *,
    limit: int = 20,
    offset: int = 0,
    sample_size: int | None = None,
    order_by: Sequence[SortSpec] | None = None,
    filters: Sequence[FilterSpec] | None = None,
) -> pd.DataFrame:
    """Fetch a paginated preview of the CSV data."""

    with duckdb_connection() as conn:
        _register_csv_view(conn, csv_path, sample_size=sample_size)
        params: list[Any] = []
        where_clause = _build_filters_clause(filters, params)
        order_clause = _build_order_clause(order_by)
        params.extend([limit, offset])
        query = f"""
            SELECT *
            FROM csv_view
            {where_clause}
            {order_clause}
            LIMIT ?
            OFFSET ?
        """
        df = conn.execute(query, params).fetch_df()

    return df


def count_rows(
    csv_path: Path | str,
    *,
    sample_size: int | None = None,
    filters: Sequence[FilterSpec] | None = None,
) -> int:
    """Return the total number of rows in the CSV file."""

    with duckdb_connection() as conn:
        _register_csv_view(conn, csv_path, sample_size=sample_size)
        params: list[Any] = []
        where_clause = _build_filters_clause(filters, params)
        query = f"SELECT COUNT(*) FROM csv_view{where_clause}"
        total = conn.execute(query, params).fetchone()[0]

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


def execute_sql(
    csv_path: Path | str,
    sql: str,
    *,
    sample_size: int | None = None,
) -> pd.DataFrame:
    """Execute a SELECT SQL statement against the CSV view."""

    stripped = sql.strip()
    if not stripped.lower().startswith("select"):
        raise ValueError("Only SELECT statements are allowed.")

    with duckdb_connection() as conn:
        _register_csv_view(conn, csv_path, sample_size=sample_size)
        df = conn.execute(stripped).fetch_df()

    return df


NUMERIC_TYPES = {
    "TINYINT",
    "SMALLINT",
    "INTEGER",
    "BIGINT",
    "UTINYINT",
    "USMALLINT",
    "UINTEGER",
    "UBIGINT",
    "HUGEINT",
    "DOUBLE",
    "FLOAT",
    "REAL",
    "DECIMAL",
    "NUMERIC",
}


def _is_numeric_dtype(dtype: str) -> bool:
    """DuckDB 타입 문자열이 수치형인지 판별한다."""

    normalized = dtype.upper()
    return any(normalized.startswith(prefix) for prefix in NUMERIC_TYPES)


def _serialize_value(value: Any) -> Any:
    """DuckDB에서 반환된 값을 JSON 직렬화 가능한 형태로 변환한다."""

    if isinstance(value, (datetime, date, time)):
        # DuckDB는 time 타입도 지원하므로 ISO 포맷으로 통일
        return value.isoformat()
    return value


def summarize_csv(
    csv_path: Path | str,
    *,
    sample_size: int | None = None,
    columns: Sequence[str] | None = None,
) -> List[ColumnSummary]:
    """Calculate summary statistics for selected columns."""

    schema = describe_csv(csv_path, sample_size=sample_size)
    if columns:
        target_names = set(columns)
        targets = [col for col in schema if col.name in target_names]
    else:
        targets = schema

    summaries: list[ColumnSummary] = []
    with duckdb_connection() as conn:
        _register_csv_view(conn, csv_path, sample_size=sample_size)
        for column in targets:
            column_name = _quote_identifier(column.name)
            base_stats = conn.execute(
                f"""
                SELECT
                    COUNT(*) AS total_rows,
                    COUNT("{column_name}") AS non_null_count,
                    COUNT(*) - COUNT("{column_name}") AS null_count,
                    COUNT(DISTINCT "{column_name}") AS distinct_count
                FROM csv_view
                """
            ).fetchone()

            total_rows = int(base_stats[0] or 0)
            non_null = int(base_stats[1] or 0)
            nulls = int(base_stats[2] or 0)
            distinct = int(base_stats[3] or 0)

            min_value = max_value = mean_value = stddev_value = None

            if _is_numeric_dtype(column.dtype) and non_null > 0:
                numeric_stats = conn.execute(
                    f"""
                    SELECT
                        MIN("{column_name}") AS min_value,
                        MAX("{column_name}") AS max_value,
                        AVG("{column_name}") AS mean_value,
                        STDDEV_SAMP("{column_name}") AS stddev_value
                    FROM csv_view
                    WHERE "{column_name}" IS NOT NULL
                    """
                ).fetchone()
                min_value = numeric_stats[0]
                max_value = numeric_stats[1]
                mean_value = (
                    float(numeric_stats[2]) if numeric_stats[2] is not None else None
                )
                stddev_value = (
                    float(numeric_stats[3]) if numeric_stats[3] is not None else None
                )
            elif non_null > 0:
                minmax = conn.execute(
                    f"""
                    SELECT
                        MIN("{column_name}") AS min_value,
                        MAX("{column_name}") AS max_value
                    FROM csv_view
                    WHERE "{column_name}" IS NOT NULL
                    """
                ).fetchone()
                min_value = minmax[0]
                max_value = minmax[1]

            summaries.append(
                ColumnSummary(
                    column=column.name,
                    dtype=column.dtype,
                    total_rows=total_rows,
                    null_count=nulls,
                    non_null_count=non_null,
                    distinct_count=distinct,
                    min_value=_serialize_value(min_value),
                    max_value=_serialize_value(max_value),
                    mean_value=mean_value,
                    stddev_value=stddev_value,
                )
            )

    return summaries


def chart_aggregate(
    csv_path: Path | str,
    *,
    dimensions: Sequence[str],
    metrics: Sequence[tuple[str, str, str | None]],
    filters: Sequence[FilterSpec] | None = None,
    limit: int | None = None,
    sample_size: int | None = None,
) -> pd.DataFrame:
    """Aggregate data for charting purposes."""

    if not dimensions:
        raise ValueError("At least one dimension is required.")

    dim_identifiers = [f'"{_quote_identifier(dim)}"' for dim in dimensions]

    metric_expressions: list[str] = []
    for alias, agg, column in metrics:
        agg_lower = agg.lower()
        alias_identifier = _quote_identifier(alias)
        if agg_lower == "count" and column is None:
            metric_expressions.append(f"COUNT(*) AS \"{alias_identifier}\"")
        else:
            if column is None:
                raise ValueError(f"Metric '{alias}' requires a target column.")
            quoted_col = f'"{_quote_identifier(column)}"'
            if agg_lower == "count":
                metric_expressions.append(
                    f"COUNT({quoted_col}) AS \"{alias_identifier}\""
                )
            elif agg_lower == "sum":
                metric_expressions.append(
                    f"SUM({quoted_col}) AS \"{alias_identifier}\""
                )
            elif agg_lower == "avg":
                metric_expressions.append(
                    f"AVG({quoted_col}) AS \"{alias_identifier}\""
                )
            elif agg_lower == "min":
                metric_expressions.append(
                    f"MIN({quoted_col}) AS \"{alias_identifier}\""
                )
            elif agg_lower == "max":
                metric_expressions.append(
                    f"MAX({quoted_col}) AS \"{alias_identifier}\""
                )
            else:
                raise ValueError(f"Unsupported aggregate: {agg}")

    select_parts = dim_identifiers + metric_expressions
    select_clause = ", ".join(select_parts)
    group_clause = ", ".join(dim_identifiers)

    params: list[Any] = []
    where_clause = _build_filters_clause(filters, params)
    limit_clause = f" LIMIT {int(limit)}" if limit is not None else ""

    query = f"""
        SELECT {select_clause}
        FROM csv_view
        {where_clause}
        GROUP BY {group_clause}
        {limit_clause}
    """

    with duckdb_connection() as conn:
        _register_csv_view(conn, csv_path, sample_size=sample_size)
        df = conn.execute(query, params).fetch_df()

    return df
