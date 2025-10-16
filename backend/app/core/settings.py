"""Application settings and environment helpers."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path


@dataclass(slots=True)
class AppSettings:
    """Configuration values sourced from environment variables."""

    csv_data_dir: Path = field(
        default_factory=lambda: Path(os.getenv("CSV_DATA_DIR", "./data")).resolve()
    )
    duckdb_database_path: Path = field(
        default_factory=lambda: Path(
            os.getenv("DUCKDB_DATABASE_PATH", "./data/cache/catalog.duckdb")
        ).resolve()
    )
    duckdb_sample_size: int = field(
        default_factory=lambda: int(os.getenv("DUCKDB_SAMPLE_SIZE", "100000"))
    )
    auto_convert_to_parquet: bool = field(
        default_factory=lambda: os.getenv("AUTO_CONVERT_TO_PARQUET", "1") not in {"0", "false", "False"}
    )
    parquet_row_group_size: int = field(
        default_factory=lambda: int(os.getenv("PARQUET_ROW_GROUP_SIZE", "100000"))
    )

    def ensure_directories(self) -> None:
        """Create required directories if they do not exist yet."""
        self.csv_data_dir.mkdir(parents=True, exist_ok=True)
        self.duckdb_database_path.parent.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    """Return cached application settings."""
    settings = AppSettings()
    settings.ensure_directories()
    return settings


def reset_settings_cache() -> None:
    """Clear cached settings, forcing a reload on next access."""

    get_settings.cache_clear()
