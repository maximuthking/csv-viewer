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


@dataclass(slots=True)
class LocateResult:
    """Result of locating a row index matching a search value."""

    row_index: int
    value: Any | None


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


def _build_window_order_clause(order_by: Sequence[SortSpec] | None) -> str:
    """Build the ORDER BY portion for window functions."""

    if not order_by:
        return ""

    parts = []
    for spec in order_by:
        column = _quote_identifier(spec.column)
        direction = "DESC" if spec.descending else "ASC"
        parts.append(f'"{column}" {direction}')

    return "ORDER BY " + ", ".join(parts)


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


def locate_row_position(
    csv_path: Path | str,
    *,
    column: str,
    value: Any | None,
    match_mode: str = "contains",
    sample_size: int | None = None,
    filters: Sequence[FilterSpec] | None = None,
    order_by: Sequence[SortSpec] | None = None,
) -> LocateResult | None:
    """Locate the zero-based row index for the first matching value."""

    if not column:
        raise ValueError("Column name is required for locating a value.")

    normalized_mode = (match_mode or "contains").lower()
    if normalized_mode not in {"contains", "exact"}:
        raise ValueError(f"Unsupported match mode: {match_mode}")

    column_identifier = _quote_identifier(column)

    with duckdb_connection() as conn:
        _register_csv_view(conn, csv_path, sample_size=sample_size)

        params: list[Any] = []
        where_clause = _build_filters_clause(filters, params)
        window_order_clause = _build_window_order_clause(order_by)
        over_clause = f"({window_order_clause})" if window_order_clause else "()"

        search_params: list[Any] = []
        if value is None:
            if normalized_mode == "contains":
                raise ValueError("Contains match mode does not support null search values.")
            search_condition = f'"{column_identifier}" IS NULL'
        elif normalized_mode == "contains":
            search_condition = f'CAST("{column_identifier}" AS TEXT) ILIKE ?'
            search_params.append(f"%{str(value)}%")
        else:  # exact
            search_condition = f'CAST("{column_identifier}" AS TEXT) = ?'
            search_params.append(str(value))

        query = f"""
            WITH ranked AS (
                SELECT
                    *,
                    ROW_NUMBER() OVER {over_clause} AS row_number
                FROM csv_view
                {where_clause}
            )
            SELECT
                row_number - 1 AS row_index,
                "{column_identifier}" AS match_value
            FROM ranked
            WHERE {search_condition}
            ORDER BY row_number
            LIMIT 1
        """

        bindings = [*params, *search_params]
        record = conn.execute(query, bindings).fetchone()

    if not record:
        return None

    row_index, match_value = record
    return LocateResult(row_index=int(row_index), value=match_value)


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
                    COUNT(\"{column_name}\") AS non_null_count,
                    COUNT(*) - COUNT(\"{column_name}\") AS null_count,
                    COUNT(DISTINCT \"{column_name}\") AS distinct_count
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
                        MIN(\"{column_name}\") AS min_value,
                        MAX(\"{column_name}\") AS max_value,
                        AVG(\"{column_name}\") AS mean_value,
                        STDDEV_SAMP(\"{column_name}\") AS stddev_value
                    FROM csv_view
                    WHERE \"{column_name}\" IS NOT NULL
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
                        MIN(\"{column_name}\") AS min_value,
                        MAX(\"{column_name}\") AS max_value
                    FROM csv_view
                    WHERE \"{column_name}\" IS NOT NULL
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


def get_chart_data(
    csv_path: Path | str,
    *,
    chart_type: str,
    value_columns: List[str],
    time_column: str | None = None,
    time_bucket: str | None = None,
    interpolation: str = "none",
    sample_size: int | None = None,
) -> pd.DataFrame:
    """Get aggregated or sampled data for chart visualization."""

    if not value_columns:
        raise ValueError("At least one value column is required.")

    with duckdb_connection() as conn:
        _register_csv_view(conn, csv_path, sample_size=sample_size, view_name="chart_view")

        if chart_type == "scatter":
            if len(value_columns) < 2:
                raise ValueError("Scatter plots require at least two value columns (X and Y).")
            x_col, y_col = _quote_identifier(value_columns[0]), _quote_identifier(value_columns[1])
            query = f"""
                SELECT {x_col}, {y_col}
                FROM chart_view
                USING SAMPLE 5000 ROWS
            """
            return conn.execute(query).fetch_df()

        if not time_column or not time_bucket:
            raise ValueError("Time column and bucket are required for line/bar charts.")

        time_col_quoted = _quote_identifier(time_column)

        agg_expressions = [
            f"AVG({_quote_identifier(col)}) AS {_quote_identifier(col)}"
            for col in value_columns
        ]
        agg_clause = ", ".join(agg_expressions)

        # Base query with aggregation
        base_query = f"""
            SELECT
                time_bucket(INTERVAL '{time_bucket}', CAST({time_col_quoted} AS TIMESTAMP)) AS {time_col_quoted},
                {agg_clause}
            FROM chart_view
            GROUP BY 1
        """

        if interpolation == "none":
            final_query = f"{base_query} ORDER BY 1"
            return conn.execute(final_query).fetch_df()

        gap_conditions = [
            f"(aggregated.{_quote_identifier(col)} IS NULL)"
            for col in value_columns
        ]
        aggregated_null_clause = " AND ".join(gap_conditions)
        if aggregated_null_clause:
            is_gap_expression = (
                f"CASE WHEN aggregated.bucket_start IS NULL OR ({aggregated_null_clause}) "
                f"THEN TRUE ELSE FALSE END AS is_gap"
            )
        else:
            is_gap_expression = (
                "CASE WHEN aggregated.bucket_start IS NULL THEN TRUE ELSE FALSE END AS is_gap"
            )

        joined_select_parts = [
            "buckets.bucket_start",
            *[
                f"aggregated.{_quote_identifier(col)} AS {_quote_identifier(col)}"
                for col in value_columns
            ],
            is_gap_expression,
        ]
        joined_select_clause = ",\n                        ".join(joined_select_parts)

        joined_cte = f"""
            WITH bounds AS (
                SELECT
                    MIN(CAST({time_col_quoted} AS TIMESTAMP)) AS min_time,
                    MAX(CAST({time_col_quoted} AS TIMESTAMP)) AS max_time
                FROM chart_view
            ),
            buckets AS (
                SELECT
                    bucket_start
                FROM (
                    SELECT
                        UNNEST(
                            GENERATE_SERIES(
                                time_bucket(INTERVAL '{time_bucket}', min_time),
                                time_bucket(INTERVAL '{time_bucket}', max_time),
                                INTERVAL '{time_bucket}'
                            )
                        ) AS bucket_start
                    FROM bounds
                    WHERE min_time IS NOT NULL AND max_time IS NOT NULL
                )
                WHERE bucket_start IS NOT NULL
            ),
            aggregated AS (
                SELECT
                    time_bucket(INTERVAL '{time_bucket}', CAST({time_col_quoted} AS TIMESTAMP)) AS bucket_start,
                    {agg_clause}
                FROM chart_view
                GROUP BY 1
            ),
            joined AS (
                SELECT
                    {joined_select_clause}
                FROM buckets
                LEFT JOIN aggregated ON aggregated.bucket_start = buckets.bucket_start
            )
        """

        # Interpolation logic using synthetic buckets
        if interpolation == "ffill":
            locf_expressions = [
                (
                    "MAX_BY("
                    f"joined.{_quote_identifier(col)}, "
                    f"CASE WHEN joined.{_quote_identifier(col)} IS NULL THEN NULL "
                    f"ELSE joined.bucket_start END"
                    ") OVER ("
                    "ORDER BY joined.bucket_start "
                    "ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW"
                    f") AS {_quote_identifier(col)}"
                )
                for col in value_columns
            ]
            locf_clause = ",\n                    ".join(locf_expressions)

            final_query = f"""
                {joined_cte}
                SELECT
                    joined.bucket_start AS {time_col_quoted},
                    {locf_clause},
                    joined.is_gap AS is_interpolated
                FROM joined
                ORDER BY 1
            """
            return conn.execute(final_query).fetch_df()

        if interpolation in {"bfill", "linear"}:
            value_select_clause = ",\n                    ".join(
                [
                    f"joined.{_quote_identifier(col)} AS {_quote_identifier(col)}"
                    for col in value_columns
                ]
            )

            base_join_query = f"""
                {joined_cte}
                SELECT
                    joined.bucket_start AS {time_col_quoted},
                    {value_select_clause},
                    joined.is_gap AS is_interpolated
                FROM joined
                ORDER BY 1
            """
            df = conn.execute(base_join_query).fetch_df()

            if df.empty:
                return df

            if interpolation == "bfill":
                df[value_columns] = df[value_columns].fillna(method="bfill")
            else:
                df[value_columns] = df[value_columns].interpolate(method="linear")

            df["is_interpolated"] = df["is_interpolated"].astype(bool)
            return df

        raise ValueError(f"Unsupported interpolation method: {interpolation}")
