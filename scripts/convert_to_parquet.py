"""
Convert large CSV files to Parquet using DuckDB.

Usage:
    python -m scripts.convert_to_parquet --csv data/train.csv
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

from backend.app.core.settings import get_settings
from backend.app.db.duckdb_session import duckdb_connection


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert CSV files to Parquet via DuckDB.")
    parser.add_argument(
        "--csv",
        type=Path,
        required=True,
        help="Path to the input CSV file (relative paths resolved against CSV_DATA_DIR).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output Parquet path. Defaults to the CSV path with .parquet suffix.",
    )
    parser.add_argument(
        "--row-group-size",
        type=int,
        default=100_000,
        help="Row group size for the Parquet file (default: 100000).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite the Parquet file if it already exists.",
    )
    return parser.parse_args()


def resolve_paths(csv_path: Path, output_path: Path | None) -> tuple[Path, Path]:
    settings = get_settings()
    base_csv = settings.csv_data_dir

    csv_resolved = csv_path if csv_path.is_absolute() else base_csv / csv_path
    if not csv_resolved.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_resolved}")

    if output_path is None:
        output_resolved = csv_resolved.with_suffix(".parquet")
    else:
        output_resolved = output_path if output_path.is_absolute() else base_csv / output_path

    output_resolved.parent.mkdir(parents=True, exist_ok=True)
    return csv_resolved, output_resolved


def convert(csv_path: Path, output_path: Path, *, row_group_size: int, overwrite: bool) -> None:
    if output_path.exists() and not overwrite:
        raise FileExistsError(
            f"Output file already exists: {output_path}. Use --overwrite to replace it."
        )

    settings = get_settings()
    csv_literal = str(csv_path).replace("'", "''")
    parquet_literal = str(output_path).replace("'", "''")

    start = time.perf_counter()
    with duckdb_connection() as conn:
        conn.execute(
            f"""
            COPY (
                SELECT *
                FROM read_csv_auto('{csv_literal}', SAMPLE_SIZE={int(settings.duckdb_sample_size)})
            ) TO '{parquet_literal}'
            (FORMAT 'parquet', ROW_GROUP_SIZE {int(row_group_size)})
            """
        )
    duration = time.perf_counter() - start
    print(f"[info] Wrote Parquet: {output_path} ({duration:.2f}s)")


def main() -> int:
    args = parse_args()
    csv_path, output_path = resolve_paths(args.csv, args.output)

    try:
        convert(
            csv_path,
            output_path,
            row_group_size=max(args.row_group_size, 1),
            overwrite=args.overwrite,
        )
    except Exception as exc:  # pylint: disable=broad-except
        print(f"[error] {exc}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
