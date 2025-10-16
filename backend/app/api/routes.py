"""주요 CSV 관련 API 엔드포인트."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, List

from fastapi import APIRouter, HTTPException, status

from ..core.settings import get_settings
from ..services import data_access
from . import schemas

router = APIRouter(prefix="/v1", tags=["csv"])


def _to_filter_specs(items: List[schemas.FilterSpec]) -> List[data_access.FilterSpec]:
    """Pydantic 필터 스펙을 데이터 접근 레이어 스펙으로 변환."""

    return [
        data_access.FilterSpec(
            column=item.column,
            operator=item.operator.value,
            value=item.value,
        )
        for item in items
    ]


def _to_sort_specs(items: List[schemas.SortSpec]) -> List[data_access.SortSpec]:
    """Pydantic 정렬 스펙을 데이터 접근 레이어 스펙으로 변환."""

    return [
        data_access.SortSpec(
            column=item.column,
            descending=item.direction == schemas.SortDirection.desc,
        )
        for item in items
    ]


@router.get("/healthz")
async def health_check() -> dict[str, Any]:
    """기본 헬스체크 엔드포인트."""

    return {"status": "ok"}


@router.get("/files", response_model=list[schemas.CSVFileInfo])
async def list_files() -> list[schemas.CSVFileInfo]:
    """사용 가능한 CSV 파일 메타데이터를 반환한다."""

    settings = get_settings()
    files = data_access.list_csv_files()
    results: list[schemas.CSVFileInfo] = []

    for file_path in files:
        stat = file_path.stat()
        try:
            relative = file_path.relative_to(settings.csv_data_dir)
        except ValueError:
            relative = Path(file_path.name)

        results.append(
            schemas.CSVFileInfo(
                name=file_path.name,
                path=str(relative).replace("\\", "/"),
                size_bytes=stat.st_size,
                modified_at=datetime.fromtimestamp(stat.st_mtime).isoformat(),
            )
        )

    return results


@router.get("/tables", response_model=list[schemas.ColumnSchema])
async def table_schema(path: str) -> list[schemas.ColumnSchema]:
    """지정된 CSV 파일의 컬럼 스키마를 반환한다."""

    try:
        schema = data_access.describe_csv(path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return [
        schemas.ColumnSchema(name=col.name, dtype=col.dtype, nullable=col.null)
        for col in schema
    ]


@router.post("/preview", response_model=schemas.PreviewResponse)
async def preview(request: schemas.PreviewRequest) -> schemas.PreviewResponse:
    """CSV 데이터의 페이지네이션 미리보기를 반환한다."""

    filters = _to_filter_specs(request.filters)
    order_by = _to_sort_specs(request.order_by)

    try:
        df = data_access.preview_csv(
            request.path,
            limit=request.limit,
            offset=request.offset,
            filters=filters,
            order_by=order_by,
        )
        total_rows = data_access.count_rows(request.path, filters=filters)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    rows = df.to_dict(orient="records")
    columns = list(df.columns)
    return schemas.PreviewResponse(rows=rows, total_rows=total_rows, columns=columns)


@router.post("/query", response_model=schemas.QueryResponse)
async def run_query(request: schemas.QueryRequest) -> schemas.QueryResponse:
    """사용자 정의 SELECT 쿼리를 실행한다."""

    try:
        df = data_access.execute_sql(request.path, request.sql)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    rows = df.to_dict(orient="records")
    columns = list(df.columns)
    return schemas.QueryResponse(rows=rows, columns=columns, row_count=len(rows))


@router.post("/summary", response_model=schemas.SummaryResponse)
async def summary(request: schemas.SummaryRequest) -> schemas.SummaryResponse:
    """컬럼 요약 통계를 계산한다."""

    try:
        summaries = data_access.summarize_csv(request.path, columns=request.columns or None)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return schemas.SummaryResponse(
        summaries=[
            schemas.ColumnSummary(**asdict(summary))
            for summary in summaries
        ]
    )


@router.post("/charts", response_model=schemas.ChartResponse)
async def chart(request: schemas.ChartRequest) -> schemas.ChartResponse:
    """차트/대시보드를 위한 집계 데이터를 반환한다."""

    filters = _to_filter_specs(request.filters)

    metrics: list[tuple[str, str, str | None]]
    if request.metrics:
        metrics = [
            (metric.name, metric.agg, metric.column)
            for metric in request.metrics
        ]
    else:
        metrics = [("row_count", "count", None)]

    try:
        df = data_access.chart_aggregate(
            request.path,
            dimensions=request.dimensions,
            metrics=metrics,
            filters=filters,
            limit=request.limit,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    rows = df.to_dict(orient="records")
    return schemas.ChartResponse(series=rows)
