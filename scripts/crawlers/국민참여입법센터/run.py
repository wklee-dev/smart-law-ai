#!/usr/bin/env python3
"""프로젝트 루트에서 크롤러를 실행하는 진입점."""
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from national_law_notice_crawler import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
