#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
VENV_DIR = ROOT_DIR / ".venv"
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
BACKEND_REQUIREMENTS = BACKEND_DIR / "requirements.txt"


def ensure_venv() -> Path:
    """Create the virtual environment when missing and return its python path."""

    if not VENV_DIR.exists():
        print(f"[setup] 가상환경이 없어 생성합니다: {VENV_DIR}")
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV_DIR)])
    else:
        print(f"[setup] 기존 가상환경을 재사용합니다: {VENV_DIR}")

    if os.name == "nt":
        python_path = VENV_DIR / "Scripts" / "python.exe"
    else:
        python_path = VENV_DIR / "bin" / "python"

    if not python_path.exists():
        raise FileNotFoundError(f"가상환경 Python 경로를 찾을 수 없습니다: {python_path}")

    return python_path


def run_pip(python_path: Path, args: list[str]) -> None:
    """Run pip with the provided arguments inside the venv."""

    cmd = [str(python_path), "-m", "pip", *args]
    subprocess.check_call(cmd, cwd=ROOT_DIR)


def ensure_python_deps(python_path: Path) -> None:
    """Install backend python dependencies."""

    print("[setup] pip 및 백엔드 의존성을 설치/업데이트합니다.")
    run_pip(python_path, ["install", "--upgrade", "pip"])

    if BACKEND_REQUIREMENTS.exists():
        run_pip(python_path, ["install", "-r", str(BACKEND_REQUIREMENTS)])
    else:
        print(f"[warn] {BACKEND_REQUIREMENTS} 파일을 찾지 못했습니다. 필요한 패키지를 수동으로 설치하세요.")


def ensure_npm_deps(npm_path: str) -> None:
    """Install frontend npm dependencies."""

    print("[setup] 프론트엔드 npm 패키지를 설치/업데이트합니다.")
    subprocess.check_call([npm_path, "install"], cwd=FRONTEND_DIR)


def start_processes(python_path: Path, npm_path: str) -> None:
    """Launch backend uvicorn dev server and frontend Vite dev server."""

    backend_cmd = [
        str(python_path),
        "-m",
        "uvicorn",
        "app.main:app",
        "--reload",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
    ]
    frontend_cmd = [
        npm_path,
        "run",
        "dev",
        "--",
        "--host",
        "0.0.0.0",
        "--port",
        "5173",
    ]

    print("[run] 백엔드와 프론트엔드 개발 서버를 시작합니다. 중지하려면 Ctrl+C.")

    backend_proc = subprocess.Popen(backend_cmd, cwd=BACKEND_DIR)
    frontend_proc = subprocess.Popen(frontend_cmd, cwd=FRONTEND_DIR)

    try:
        while True:
            backend_return = backend_proc.poll()
            frontend_return = frontend_proc.poll()
            if backend_return is not None:
                print(f"[exit] 백엔드 프로세스가 종료되었습니다 (코드 {backend_return}).")
                break
            if frontend_return is not None:
                print(f"[exit] 프론트엔드 프로세스가 종료되었습니다 (코드 {frontend_return}).")
                break
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[stop] 사용자가 중단을 요청했습니다. 프로세스를 종료합니다.")
    finally:
        for name, proc in (("backend", backend_proc), ("frontend", frontend_proc)):
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=10)
                    print(f"[stop] {name} 프로세스를 정상 종료했습니다.")
                except subprocess.TimeoutExpired:
                    proc.kill()
                    print(f"[stop] {name} 프로세스를 강제 종료했습니다.")


def main() -> None:
    if not BACKEND_DIR.exists() or not FRONTEND_DIR.exists():
        raise RuntimeError("backend 혹은 frontend 디렉터리를 찾을 수 없습니다. 루트에서 실행해주세요.")

    npm_path = shutil.which("npm")
    if npm_path is None:
        raise RuntimeError("npm 명령을 찾을 수 없습니다. Node.js가 설치되어 있는지 확인하세요.")

    python_path = ensure_venv()
    ensure_python_deps(python_path)
    ensure_npm_deps(npm_path)
    start_processes(python_path, npm_path)


if __name__ == "__main__":
    main()
