"""
HS 해설서 SQLite 경로 해석 (.env.local 의 HS_MANUAL_DB_PATH 와 동일 우선순위).
Next.js 의 app/lib/tariff-db.ts(getTariffDbPath) 과 맞춤.
"""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_HS_MANUAL_DB = Path(r"D:\SQLiteDB\hs_manual_complete.db")


def _project_root() -> Path:
    # app/hs-commentary/db_path.py -> 루트는 parent x3
    return Path(__file__).resolve().parent.parent.parent


def load_dotenv_local(*, override_existing: bool = False) -> None:
    """리포지토리 루트 `.env.local` 을 간단히 읽어 os.environ 에 반영."""
    env_path = _project_root() / ".env.local"
    if not env_path.is_file():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        if not key:
            continue
        val = val.strip('"').strip("'")
        if override_existing or key not in os.environ:
            os.environ[key] = val


def hs_manual_db_path() -> Path:
    load_dotenv_local(override_existing=True)
    p = (
        os.environ.get("HS_MANUAL_DB_PATH", "").strip()
        or os.environ.get("TARIFF_DB_PATH", "").strip()
    )
    if p:
        return Path(p).expanduser().resolve()
    return DEFAULT_HS_MANUAL_DB.resolve()
