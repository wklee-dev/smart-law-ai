#!/usr/bin/env python3
"""Stream crawler output to the console and the daily log; no extra packages."""
from __future__ import annotations

import os
import queue
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path


def relay(command: list[str], log_file: Path, *, heartbeat_seconds: float = 5.0,
          env: dict[str, str] | None = None) -> int:
    """Run a command without a shell, relay merged output, and keep its exit code."""
    log_file.parent.mkdir(parents=True, exist_ok=True)
    with log_file.open("a", encoding="utf-8", buffering=1) as log:
        def emit(text: str):
            sys.stdout.write(text)
            sys.stdout.flush()
            log.write(text)
            log.flush()

        emit(f"{datetime.now():%Y-%m-%d %H:%M:%S} INFO [실행] 화면 진행 표시 시작; 로그: {log_file}\n")
        try:
            child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                     text=True, encoding="utf-8", errors="replace", bufsize=1, env=env)
        except OSError as exc:
            emit(f"{datetime.now():%Y-%m-%d %H:%M:%S} ERROR 실행 실패: {exc}\n")
            return 2

        output: queue.Queue[str | None] = queue.Queue()

        def read_output():
            try:
                for line in child.stdout:
                    output.put(line)
            finally:
                output.put(None)

        reader = threading.Thread(target=read_output, daemon=True)
        reader.start()
        last_output = last_notice = time.monotonic()
        interrupted = False
        try:
            while True:
                try:
                    line = output.get(timeout=0.2)
                except queue.Empty:
                    current = time.monotonic()
                    if child.poll() is None and current - last_notice >= heartbeat_seconds:
                        emit(f"{datetime.now():%Y-%m-%d %H:%M:%S} INFO [대기] 작업 실행 중 "
                             f"(마지막 출력 후 {int(current - last_output)}초)\n")
                        last_notice = current
                    continue
                if line is None:
                    break
                emit(line)
                last_output = last_notice = time.monotonic()
            result = child.wait()
        except KeyboardInterrupt:
            interrupted = True
            emit(f"{datetime.now():%Y-%m-%d %H:%M:%S} WARNING 사용자 중단 요청; 종료 처리 대기\n")
            # On Windows the child shares the console and receives Ctrl+C too.
            if child.poll() is None and os.name != "nt":
                child.send_signal(signal.SIGINT)
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.terminate()
                child.wait()
            result = 130
            reader.join(timeout=2)
            while not output.empty():
                line = output.get_nowait()
                if line is not None:
                    emit(line)
        finally:
            if child.poll() is None:
                child.terminate()
                child.wait()
            reader.join(timeout=2)
            if child.stdout is not None:
                child.stdout.close()
        if interrupted or result < 0:
            result = 130 if interrupted or result == -signal.SIGINT else 1
        emit(f"{datetime.now():%Y-%m-%d %H:%M:%S} INFO [종료] 크롤러 종료 코드: {result}\n")
        return result


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    base = Path(__file__).resolve().parent
    override = os.environ.get("TAX_TRIBUNAL_LOG_FILE")
    log_file = Path(override).resolve() if override else base / "LOG" / f"{datetime.now():%Y%m%d}_TaxTribunalPress.LOG"
    env = dict(os.environ)
    env.update(PYTHONUTF8="1", PYTHONUNBUFFERED="1", TAX_TRIBUNAL_LOG_REDIRECTED="1",
               TAX_TRIBUNAL_LOG_FILE=str(log_file))
    command = [sys.executable, "-u", str(base / "crawler.py"), *(sys.argv[1:] if argv is None else argv)]
    try:
        return relay(command, log_file, env=env)
    except KeyboardInterrupt:
        return 130
    except OSError as exc:
        print(f"[ERROR] 화면/로그 출력 실패: {exc}", file=sys.stderr, flush=True)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
