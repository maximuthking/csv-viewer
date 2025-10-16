"""API 라우터 패키지."""

from __future__ import annotations

from fastapi import APIRouter

from .routes import router as v1_router


def create_api_router() -> APIRouter:
    """상위 라우터를 구성해 반환한다."""

    api_router = APIRouter()
    api_router.include_router(v1_router, prefix="/api")
    return api_router
