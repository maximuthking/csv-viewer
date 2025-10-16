"""FastAPI 애플리케이션 엔트리포인트."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import create_api_router
from .core.settings import get_settings


def create_app() -> FastAPI:
    """FastAPI 애플리케이션을 생성한다."""

    settings = get_settings()
    app = FastAPI(title="CSV Viewer API", version="0.1.0")

    # 프런트엔드 개발 환경을 고려해 와일드카드 허용(추후 제한 필요)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(create_api_router())
    return app


app = create_app()
