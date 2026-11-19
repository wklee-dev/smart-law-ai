"""목록 행 기관 필터 소량 검증: 운영 DB/다운로드에는 접근하지 않는다."""
from __future__ import annotations

import json
import logging
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from national_law_notice_crawler import (
    ADMINISTRATIVE_MINISTRIES, LEGISLATION_MINISTRIES,
    CrawlOptions, NoticeCrawler, date_range,
)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    with tempfile.TemporaryDirectory(prefix="nlc_v3_rows_") as temp:
        options = CrawlOptions(
            week=date_range("20261026", "20261106"),
            notice_kinds=["legislation", "administrative"],
            db_path=Path(temp) / "test.db",
            download_root=Path(temp) / "downloads",
            max_items=1,
            download_files=True,
            delay_seconds=0.5,
        )
        crawler = NoticeCrawler(options)
        real_get = crawler.client.get
        list_queries = []

        def checked_get(url, **kwargs):
            params = kwargs.get("params", {})
            if params:
                assert not {"cptOfiOrgCd", "asndOfiNm"}.intersection(params), "기관 검색 조건이 전송되었습니다."
                list_queries.append(dict(params))
            return real_get(url, **kwargs)

        crawler.client.get = checked_get
        result = crawler.crawl()
        with sqlite3.connect(options.db_path) as db:
            leg = db.execute("SELECT notice_sequence, department, title FROM nlc_ministry_legislation_notice").fetchall()
            adm = db.execute("SELECT notice_sequence, institution, title FROM nlc_ministry_administrative_notice").fetchall()
        assert all(row[1] in LEGISLATION_MINISTRIES for row in leg)
        assert all(row[1] in ADMINISTRATIVE_MINISTRIES for row in adm)
        result["stored_legislation"] = leg
        result["stored_administrative"] = adm
        result["list_queries_without_agency_search"] = list_queries
        result["database"] = "검증 임시 DB (종료 시 삭제)"
        result["download_root"] = "검증 임시 다운로드 (종료 시 삭제)"
        print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
        (ROOT / "docs" / "live_validation_V3.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        return 0 if result["status"] == "SUCCESS" and leg and adm else 1


if __name__ == "__main__":
    raise SystemExit(main())
