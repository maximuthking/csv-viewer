"""
Quick DuckDB CSV loader prototype.

Run:
    python scripts/duckdb_profile.py --csv data/train.csv --limit 10
"""

from __future__ import annotations

import argparse
import pathlib
import sys
import time

import duckdb


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Profile CSV loading with DuckDB."
    )
    parser.add_argument(
        "--csv",
        type=pathlib.Path,
        default=pathlib.Path("data/train.csv"),
        help="Target CSV file path (default: data/train.csv).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Number of rows to preview.",
    )
    parser.add_argument(
        "--sample",
        type=int,
        default=100000,
        help=(
            "Number of rows DuckDB should scan when inferring schema. "
            "Lower values speed up startup for huge files."
        ),
    )
    parser.add_argument(
        "--threads",
        type=int,
        default=0,
        help="Number of DuckDB threads (0 lets DuckDB decide).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    csv_path = args.csv.resolve()

    if not csv_path.exists():
        print(f"[error] CSV file not found: {csv_path}", file=sys.stderr)
        return 1

    print(f"[info] Loading CSV with DuckDB: {csv_path}")
    print(f"[info] Preview limit={args.limit}, sample={args.sample}, threads={args.threads or 'auto'}")

    # Configure DuckDB
    connect_kwargs = {}
    if args.threads:
        connect_kwargs["config"] = {"threads": args.threads}

    conn = duckdb.connect(database=":memory:", read_only=False, **connect_kwargs)
    conn.execute(f"PRAGMA threads={args.threads};" if args.threads else "PRAGMA threads=AUTOMATIC;")

    start = time.perf_counter()
    relation = conn.from_csv_auto(str(csv_path), sample_size=args.sample)
    relation.create_view("csv_view")
    schema = conn.execute("DESCRIBE csv_view").fetchall()
    load_duration = time.perf_counter() - start

    row_start = time.perf_counter()
    preview_rows = conn.execute(
        "SELECT * FROM csv_view LIMIT ?",
        [args.limit],
    ).fetchdf()
    preview_duration = time.perf_counter() - row_start

    count_start = time.perf_counter()
    total_rows = conn.execute("SELECT COUNT(*) FROM csv_view").fetchone()[0]
    count_duration = time.perf_counter() - count_start

    print(f"[info] Schema inference took {load_duration:.2f}s, Columns={len(schema)}")
    print(f"[info] Preview query took {preview_duration:.2f}s")
    print(f"[info] Row count query took {count_duration:.2f}s, Total rows={total_rows}")
    print("[info] Preview:")
    print(preview_rows.to_string(index=False))

    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
