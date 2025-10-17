# CSV Viewer

CSV 기반 데이터를 탐색하고 시각화하기 위한 풀스택 애플리케이션입니다. FastAPI 백엔드와 React(Vite) 프론트엔드로 구성되며, DuckDB를 활용해 대용량 CSV를 효율적으로 다룹니다.

## 폴더 구조

- `backend/` – FastAPI 애플리케이션, DuckDB 기반 서비스 로직, 단위 테스트
- `frontend/` – React + Vite 프론트엔드, ECharts 기반 차트 UI
- `scripts/` – 개발 편의 스크립트 모음 (`start_dev.py` 등)
- `data/` – CSV 원천 데이터 및 DuckDB 캐시(스크립트 실행 시 자동 생성)

## 사전 준비

- Python 3.11 이상 권장
- Node.js 18 LTS 이상 및 npm
- Windows에서 PowerShell(또는 Bash) 사용 권장

## 빠른 시작 (추천)

`scripts/start_dev.py`는 다음 작업을 자동으로 수행합니다.

1. 루트 경로(`Project Root`)에 `.venv`가 없으면 새로 생성 후 Python 의존성 설치
2. `backend/requirements.txt` 기반 백엔드 패키지 설치
3. `frontend` 디렉터리에서 `npm install`
4. FastAPI 개발 서버(`http://localhost:8000`), Vite 개발 서버(`http://localhost:5173`) 동시 실행

실행 명령:

```powershell
python scripts/start_dev.py
```

실행 후 동일 터미널에서 `Ctrl+C`를 누르면 두 서버가 함께 종료됩니다.

## 수동 설정 방법 (필요 시)

### 백엔드

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend
```

### 프론트엔드

```powershell
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

## 환경 변수

- `backend/.env.example`, `frontend/.env.example`을 참고하여 `.env` 파일을 복사/수정하세요.
- `CSV_DATA_DIR`, `DUCKDB_DATABASE_PATH` 등의 설정은 스크립트 실행 시 자동으로 생성되는 디렉터리 경로(`data/`)를 기본값으로 사용합니다.

## 테스트

- 백엔드 단위 테스트: `.\.venv\Scripts\Activate.ps1` 실행 후 `pytest` (작업 디렉터리 `backend`)
- 프론트엔드 린트: `cd frontend` 후 `npm run lint`

## 문제 해결 팁

- npm을 찾지 못했다는 에러가 나면 Node.js 설치 또는 PATH 등록을 확인하세요.
- 포트 충돌 시 `start_dev.py` 수정 또는 개별 실행 명령에서 `--port` 값을 조정하세요.
- DuckDB 캐시나 생성된 데이터가 문제를 일으키면 `data/` 디렉터리를 백업 후 정리한 뒤 다시 실행하세요.
