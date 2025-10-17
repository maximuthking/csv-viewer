#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
import hashlib

ROOT_DIR = Path(__file__).resolve().parent.parent
VENV_DIR = ROOT_DIR / ".venv"
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
BACKEND_REQUIREMENTS = BACKEND_DIR / "requirements.txt"

MIN_PYTHON = (3, 10)
MIN_NODE = (18, 0)
MIN_NPM = (9, 0)
REQUIREMENTS_STAMP = VENV_DIR / ".requirements.sha256"
NPM_HASH_FILE = FRONTEND_DIR / ".npm-deps.sha256"
FRONTEND_FINGERPRINT_FILES = [
    FRONTEND_DIR / "package.json",
    FRONTEND_DIR / "package-lock.json",
    FRONTEND_DIR / "yarn.lock",
    FRONTEND_DIR / "pnpm-lock.yaml",
]


def parse_version(raw: str) -> tuple[int, ...]:
    """Convert version string like 'v18.17.0' to tuple of ints (18, 17, 0)."""

    cleaned = raw.strip().lstrip("vV")
    parts = []
    for chunk in cleaned.split("."):
        if not chunk.isdigit():
            break
        parts.append(int(chunk))
    return tuple(parts)


def ensure_min_version(name: str, current: tuple[int, ...], minimum: tuple[int, ...]) -> None:
    if current < minimum:
        raise RuntimeError(f"{name} 버전이 최소 요구 사항을 충족하지 않습니다. 현재 {current}, 최소 {minimum} 이상이어야 합니다.")


def file_sha256(path: Path) -> str:
    """Return SHA-256 hex digest of the given file."""

    hasher = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def read_stamp(path: Path) -> str | None:
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8").strip()


def write_stamp(path: Path, value: str) -> None:
    path.write_text(value, encoding="utf-8")


def compute_frontend_hash() -> str | None:
    existing_files = [path for path in FRONTEND_FINGERPRINT_FILES if path.exists()]
    if not existing_files:
        return None

    hasher = hashlib.sha256()
    for candidate in existing_files:
        hasher.update(candidate.name.encode("utf-8"))
        with candidate.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                hasher.update(chunk)
    return hasher.hexdigest()


def load_env_files(*files: Path) -> dict[str, str]:
    """Merge environment variables from a sequence of .env-style files."""

    env: dict[str, str] = {}
    for file in files:
        if not file.exists():
            continue
        for line in file.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def check_runtime_versions(npm_path: str) -> None:
    """Make sure host runtime versions are new enough before doing work."""

    ensure_min_version("Python", sys.version_info[:3], MIN_PYTHON)

    node_path = shutil.which("node")
    if node_path is None:
        raise RuntimeError("Node.js 실행 파일을 찾을 수 없습니다. Node.js가 설치되어 있는지 확인하세요.")

    try:
        node_result = subprocess.run(
            [node_path, "--version"],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError("Node.js 버전을 확인할 수 없습니다.") from exc
    node_version = parse_version(node_result.stdout)
    ensure_min_version("Node.js", node_version, MIN_NODE)

    try:
        npm_result = subprocess.run(
            [npm_path, "--version"],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError("npm 버전을 확인할 수 없습니다.") from exc
    npm_version = parse_version(npm_result.stdout)
    ensure_min_version("npm", npm_version, MIN_NPM)


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

    print("[setup] pip 패키지와 백엔드 의존성을 확인합니다.")
    if not BACKEND_REQUIREMENTS.exists():
        print(f"[warn] {BACKEND_REQUIREMENTS} 파일을 찾을 수 없습니다. 필요한 패키지를 수동으로 설치하세요.")
        return

    requirements_hash = file_sha256(BACKEND_REQUIREMENTS)
    cached_hash = read_stamp(REQUIREMENTS_STAMP)

    if cached_hash == requirements_hash:
        print("[setup] requirements.txt 변경이 없어 패키지 설치를 건너뜁니다.")
        return

    run_pip(python_path, ["install", "--upgrade", "pip"])
    run_pip(python_path, ["install", "-r", str(BACKEND_REQUIREMENTS)])
    write_stamp(REQUIREMENTS_STAMP, requirements_hash)

def ensure_npm_deps(npm_path: str) -> None:
    """Install frontend npm dependencies."""

    print("[setup] 프론트엔드 npm 의존성을 확인합니다.")
    node_modules_dir = FRONTEND_DIR / "node_modules"
    fingerprint_before = compute_frontend_hash()
    cached_hash = read_stamp(NPM_HASH_FILE)

    if fingerprint_before and cached_hash == fingerprint_before and node_modules_dir.exists():
        print("[setup] 프론트엔드 패키지 변경이 없어 설치를 건너뜁니다.")
        return

    subprocess.check_call([npm_path, "install"], cwd=FRONTEND_DIR)

    fingerprint_after = compute_frontend_hash()
    if fingerprint_after:
        write_stamp(NPM_HASH_FILE, fingerprint_after)
    elif NPM_HASH_FILE.exists():
        NPM_HASH_FILE.unlink()

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

    backend_env = os.environ.copy()
    backend_env.update(load_env_files(ROOT_DIR / ".env", BACKEND_DIR / ".env"))

    frontend_env = os.environ.copy()
    frontend_env.update(load_env_files(ROOT_DIR / ".env", FRONTEND_DIR / ".env"))

    print("[run] 백엔드와 프론트엔드 개발 서버를 시작합니다. 중단하려면 Ctrl+C.")

    backend_proc = subprocess.Popen(backend_cmd, cwd=BACKEND_DIR, env=backend_env)
    frontend_proc = subprocess.Popen(frontend_cmd, cwd=FRONTEND_DIR, env=frontend_env)

    interrupted = False
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
        interrupted = True
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
    if interrupted:
        sys.exit(0)


def main() -> None:
    if not BACKEND_DIR.exists() or not FRONTEND_DIR.exists():
        raise RuntimeError("backend 혹은 frontend 디렉터리를 찾을 수 없습니다. 루트에서 실행해주세요.")

    npm_path = shutil.which("npm")
    if npm_path is None:
        raise RuntimeError("npm 명령을 찾을 수 없습니다. Node.js가 설치되어 있는지 확인하세요.")

    check_runtime_versions(npm_path)
    python_path = ensure_venv()
    ensure_python_deps(python_path)
    ensure_npm_deps(npm_path)
    start_processes(python_path, npm_path)


if __name__ == "__main__":
    main()
