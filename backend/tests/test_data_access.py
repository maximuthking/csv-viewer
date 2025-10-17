"""Tests for the DuckDB data access helpers."""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
import pytest

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


def create_chart_fixture_csv(tmp_path: Path) -> Path:
    csv_path = tmp_path / "chart_fixture.csv"
    df = pd.DataFrame(
        {
            "time": [
                "2024-01-01 00:00:00",
                "2024-01-01 00:10:00",
                "2024-01-01 00:20:00",
                "2024-01-01 00:30:00",
                "2024-01-01 00:40:00",
            ],
            "value": [10.0, 40.0, 70.0, 100.0, 130.0],
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


def test_chart_data_interpolation_methods(tmp_path: Path, monkeypatch) -> None:
    """Ensure interpolation modes fill gaps as expected."""

    csv_path = create_chart_fixture_csv(tmp_path)
    duckdb_path = tmp_path / "catalog.duckdb"

    monkeypatch.setenv("CSV_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DUCKDB_DATABASE_PATH", str(duckdb_path))
    monkeypatch.setenv("DUCKDB_SAMPLE_SIZE", "1000")
    settings.reset_settings_cache()

    def bucket_value(df: pd.DataFrame, minutes: int) -> float:
        timestamp = pd.Timestamp("2024-01-01 00:00:00") + pd.Timedelta(minutes=minutes)
        row = df[df["time"] == timestamp]
        assert not row.empty
        return float(row.iloc[0]["value"])

    common_kwargs = dict(
        chart_type="line",
        time_column="time",
        value_columns=["value"],
        time_bucket="5 minutes",
    )

    result_none = data_access.get_chart_data(csv_path.name, interpolation="none", **common_kwargs)
    assert len(result_none) == 5
    assert result_none["value"].tolist() == [10.0, 40.0, 70.0, 100.0, 130.0]

    result_bfill = data_access.get_chart_data(csv_path.name, interpolation="bfill", **common_kwargs)
    assert not result_bfill["value"].isna().any()
    assert len(result_bfill) == 9
    assert bucket_value(result_bfill, 5) == pytest.approx(40.0)
    assert bucket_value(result_bfill, 15) == pytest.approx(70.0)
    assert bucket_value(result_bfill, 25) == pytest.approx(100.0)
    assert bucket_value(result_bfill, 35) == pytest.approx(130.0)

    result_linear = data_access.get_chart_data(csv_path.name, interpolation="linear", **common_kwargs)
    assert not result_linear["value"].isna().any()
    assert len(result_linear) == 9
    assert bucket_value(result_linear, 5) == pytest.approx(25.0)
    assert bucket_value(result_linear, 15) == pytest.approx(55.0)
    assert bucket_value(result_linear, 25) == pytest.approx(85.0)
    assert bucket_value(result_linear, 35) == pytest.approx(115.0)

    result_spline = data_access.get_chart_data(csv_path.name, interpolation="spline", **common_kwargs)
    assert not result_spline["value"].isna().any()
    assert len(result_spline) == 9
    assert bucket_value(result_spline, 5) == pytest.approx(25.0, abs=1e-6)
    assert bucket_value(result_spline, 15) == pytest.approx(55.0, abs=1e-6)
    assert bucket_value(result_spline, 25) == pytest.approx(85.0, abs=1e-6)
    assert bucket_value(result_spline, 35) == pytest.approx(115.0, abs=1e-6)

    result_polynomial = data_access.get_chart_data(
        csv_path.name, interpolation="polynomial", **common_kwargs
    )
    assert not result_polynomial["value"].isna().any()
    assert len(result_polynomial) == 9
    assert bucket_value(result_polynomial, 5) == pytest.approx(25.0, abs=1e-6)
    assert bucket_value(result_polynomial, 15) == pytest.approx(55.0, abs=1e-6)
    assert bucket_value(result_polynomial, 25) == pytest.approx(85.0, abs=1e-6)
    assert bucket_value(result_polynomial, 35) == pytest.approx(115.0, abs=1e-6)

    result_pchip = data_access.get_chart_data(csv_path.name, interpolation="pchip", **common_kwargs)
    assert not result_pchip["value"].isna().any()
    assert len(result_pchip) == 9
    assert bucket_value(result_pchip, 5) == pytest.approx(25.0, abs=1e-6)
    assert bucket_value(result_pchip, 15) == pytest.approx(55.0, abs=1e-6)
    assert bucket_value(result_pchip, 25) == pytest.approx(85.0, abs=1e-6)
    assert bucket_value(result_pchip, 35) == pytest.approx(115.0, abs=1e-6)

    result_akima = data_access.get_chart_data(csv_path.name, interpolation="akima", **common_kwargs)
    assert not result_akima["value"].isna().any()
    assert len(result_akima) == 9
    assert bucket_value(result_akima, 5) == pytest.approx(25.0, abs=1e-6)
    assert bucket_value(result_akima, 15) == pytest.approx(55.0, abs=1e-6)
    assert bucket_value(result_akima, 25) == pytest.approx(85.0, abs=1e-6)
    assert bucket_value(result_akima, 35) == pytest.approx(115.0, abs=1e-6)

    # is_interpolated 표시는 보간된 행에서 True로 유지된다.
    interpolated_targets = pd.to_datetime(
        [
            "2024-01-01 00:05:00",
            "2024-01-01 00:15:00",
            "2024-01-01 00:25:00",
            "2024-01-01 00:35:00",
        ]
    )
    for df in (
        result_bfill,
        result_linear,
        result_spline,
        result_polynomial,
        result_pchip,
        result_akima,
    ):
        assert df["is_interpolated"].dtype == bool
        interpolated_flags = df.loc[df["time"].isin(interpolated_targets), "is_interpolated"].tolist()
        assert all(interpolated_flags)
