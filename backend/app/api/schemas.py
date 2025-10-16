"""API 요청/응답 스키마 정의."""

from __future__ import annotations

from enum import Enum
from typing import Any, List, Optional, Union

from pydantic import BaseModel, Field, field_validator


class SortDirection(str, Enum):
    """정렬 방향."""

    asc = "asc"
    desc = "desc"


class FilterOperator(str, Enum):
    """필터 연산자."""

    eq = "eq"
    ne = "ne"
    lt = "lt"
    lte = "lte"
    gt = "gt"
    gte = "gte"
    contains = "contains"


class CSVFileInfo(BaseModel):
    """CSV 파일 메타데이터."""

    name: str
    path: str
    size_bytes: int
    modified_at: str


class ColumnSchema(BaseModel):
    """컬럼 스키마 정보."""

    name: str
    dtype: str
    nullable: bool


class SortSpec(BaseModel):
    """정렬 스펙."""

    column: str
    direction: SortDirection = SortDirection.asc


class FilterSpec(BaseModel):
    """필터 조건."""

    column: str
    operator: FilterOperator = FilterOperator.eq
    value: Optional[Any] = None


class PreviewRequest(BaseModel):
    """데이터 미리보기 요청."""

    path: str
    limit: int = Field(20, ge=1, le=500)
    offset: int = Field(0, ge=0)
    order_by: List[SortSpec] = Field(default_factory=list)
    filters: List[FilterSpec] = Field(default_factory=list)


class PreviewResponse(BaseModel):
    """데이터 미리보기 응답."""

    rows: List[dict[str, Any]]
    total_rows: int
    columns: List[str]


class QueryRequest(BaseModel):
    """사용자 정의 쿼리 요청."""

    path: str
    sql: str

    @field_validator("sql")
    @classmethod
    def validate_sql(cls, value: str) -> str:
        """SELECT 문만 허용한다."""

        if not value.strip():
            raise ValueError("SQL 문이 비어 있습니다.")
        if not value.lstrip().lower().startswith("select"):
            raise ValueError("SELECT 문만 허용됩니다.")
        return value


class QueryResponse(BaseModel):
    """쿼리 실행 결과."""

    rows: List[dict[str, Any]]
    columns: List[str]
    row_count: int


class SummaryRequest(BaseModel):
    """요약 통계 요청."""

    path: str
    columns: Optional[List[str]] = None


class ColumnSummary(BaseModel):
    """단일 컬럼 통계."""

    column: str
    dtype: str
    total_rows: int
    null_count: int
    non_null_count: int
    distinct_count: int
    min_value: Optional[Union[int, float, str]] = None
    max_value: Optional[Union[int, float, str]] = None
    mean_value: Optional[float] = None
    stddev_value: Optional[float] = None


class SummaryResponse(BaseModel):
    """요약 통계 응답."""

    summaries: List[ColumnSummary]


class ChartDataRequest(BaseModel):
    """차트 데이터 요청 스키마."""

    path: str
    chart_type: str = Field("line", description="e.g., 'line', 'bar', 'scatter'")
    time_column: Optional[str] = None  # scatter 에서는 사용되지 않을 수 있음
    value_columns: List[str]
    time_bucket: str = Field("1 day", description="e.g., '1 minute', '1 hour', '1 day'")
    interpolation: str = Field("none", description="e.g., 'none', 'forward_fill'")

    @field_validator("value_columns")
    @classmethod
    def validate_value_columns(cls, value: List[str]) -> List[str]:
        """값 컬럼은 최소 1개 이상이어야 한다."""
        if not value:
            raise ValueError("하나 이상의 value column이 필요합니다.")
        return value


class ChartDataResponse(BaseModel):
    """차트 데이터 응답 스키마."""

    columns: List[str]
    rows: List[dict[str, Any]]
