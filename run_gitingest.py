import subprocess
import os
import sys

def run_gitingest_with_utf8():
    """
    'gitingest' 명령어를 UTF-8 모드가 강제된 환경에서 실행합니다.
    """
    print("UTF-8 모드를 강제하여 'gitingest' 실행을 시도합니다...")

    # 1. 현재 환경 변수를 복사합니다.
    env = os.environ.copy()

    # 2. 파이썬이 기본 인코딩으로 UTF-8을 사용하도록 PYTHONUTF8 변수를 '1'로 설정합니다.
    env['PYTHONUTF8'] = '1'

    # 3. 실행할 명령어를 정의합니다.
    command = ['gitingest']

    try:
        # 4. subprocess를 사용하여 명령어를 실행합니다.
        # check=True는 명령어 실행이 실패하면 예외를 발생시킵니다.
        result = subprocess.run(
            command,
            env=env,
            capture_output=True,
            text=True,
            check=True,
            encoding='utf-8' # 출력 스트림의 인코딩도 지정합니다.
        )

        print("\n--- 'gitingest'가 성공적으로 실행되었습니다! ---")
        print("\n--- STDOUT (표준 출력) ---")
        print(result.stdout)
        if result.stderr:
            print("\n--- STDERR (표준 에러) ---")
            print(result.stderr)

    except FileNotFoundError:
        print("\n--- 오류 ---")
        print("오류: 'gitingest' 명령어를 찾을 수 없습니다.")
        print("gitingest가 설치되어 있고 시스템 경로(PATH)에 등록되어 있는지 확인하세요.")

    except subprocess.CalledProcessError as e:
        # gitingest가 실행은 되었지만 오류 코드를 반환하며 종료된 경우입니다.
        print("\n--- 오류 ---")
        print(f"'gitingest'가 오류와 함께 종료되었습니다 (종료 코드: {e.returncode}).")
        print("\n--- STDOUT (표준 출력) ---")
        print(e.stdout)
        print("\n--- STDERR (표준 에러) ---")
        print(e.stderr)
        
        # 이전에 봤던 파이썬의 치명적 오류가 여기에 나타날 것입니다.
        if "preconfig_init_utf8_mode" in e.stderr:
            print("\n--- 분석 ---")
            print("동일한 'invalid PYTHONUTF8' 오류가 발생했습니다.")
            print("이 방법으로도 파이썬 설정 문제를 해결하지 못했습니다.")


if __name__ == "__main__":
    run_gitingest_with_utf8()