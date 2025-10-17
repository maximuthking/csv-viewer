"""Tests for the DuckDB data access helpers."""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd

from backend.app.core import settings
from backend.app.services import data_access


def setup_module() -> None:
    """Ensure cached settings do not leak between tests."""
    settings.reset_settings_cache()


def create_fixture_csv(tmp_path: Path) -> Path:
    csv_path = tmp_path / "fixture.csv"
    df = pd.DataFrame(
        {
            "time": ["2024-01-01 00:00:00", "2024-01-01 00:05:00"],
            "pv_id": ["PV1", "PV2"],
            "value": [1.5, 3.2],
        }
    )
    df.to_csv(csv_path, index=False)
    return csv_path


def test_data_access_end_to_end(tmp_path: Path, monkeypatch) -> None:
    """Ensure the data access helpers can describe, preview, and sample data."""

    csv_path = create_fixture_csv(tmp_path)

    duckdb_path = tmp_path / "catalog.duckdb"
    monkeypatch.setenv("CSV_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DUCKDB_DATABASE_PATH", str(duckdb_path))
    monkeypatch.setenv("DUCKDB_SAMPLE_SIZE", "1000")

    settings.reset_settings_cache()
    current_settings = settings.get_settings()
    assert current_settings.csv_data_dir == tmp_path.resolve()

    schema = data_access.describe_csv(csv_path.name)
    assert schema[0].name == "time"

    total = data_access.count_rows(csv_path.name)
    assert total == 2

    preview = data_access.preview_csv(csv_path.name, limit=1)
    assert len(preview.index) == 1

    unique = data_access.unique_values(csv_path.name, "pv_id")
    assert sorted(unique) == ["PV1", "PV2"]

    sample = data_access.sample_rows(csv_path.name, sample_size=1)
    assert len(sample.index) == 1


def test_locate_row_position(tmp_path: Path, monkeypatch) -> None:
    """Locate the row index for a given value respecting ordering."""

    csv_path = create_fixture_csv(tmp_path)
    duckdb_path = tmp_path / "catalog.duckdb"

    monkeypatch.setenv("CSV_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DUCKDB_DATABASE_PATH", str(duckdb_path))
    monkeypatch.setenv("DUCKDB_SAMPLE_SIZE", "1000")
    settings.reset_settings_cache()

    exact_match = data_access.locate_row_position(
        csv_path.name,
        column="pv_id",
        value="PV2",
        match_mode="exact",
    )
    assert exact_match is not None
    assert exact_match.row_index == 1
    assert exact_match.value == "PV2"

    contains_match = data_access.locate_row_position(
        csv_path.name,
        column="pv_id",
        value="V1",
        match_mode="contains",
    )
    assert contains_match is not None
    assert contains_match.row_index == 0
