"""
일괄 OPEN API 법령수집 배치

웹 UI「OPEN API 법령수집」과 동일하게 law_crawler.py(12개 API)를
gwanselaw_list 대상에 대해 순차 실행합니다.

사용 예:
  python batch_openlaw_crawl.py --all
  python batch_openlaw_crawl.py --all --skip-collected
  python batch_openlaw_crawl.py --all --limit 5 --dry-run
  python batch_openlaw_crawl.py --law-ids 000591,001556
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import traceback
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from law_crawler import (
    DB_PATH,
    LOG_DIR,
    crawl_by_law_id,
    emit_progress,
    get_db_connection,
    law_ids_with_openlaw_body,
    log,
    pad_law_id,
)


@dataclass
class BatchTarget:
    law_id: str
    api_name: str
    law_short_name: str
    upload_order: int
    already_collected: bool


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    cur = conn.cursor()
    cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
        (name,),
    )
    return cur.fetchone() is not None


def load_targets_from_db(
    *,
    skip_collected: bool,
    include_tybeop: bool,
    limit: int | None,
) -> list[BatchTarget]:
    conn = get_db_connection()
    try:
        if not table_exists(conn, "gwanselaw_list"):
            raise RuntimeError(
                f"gwanselaw_list 테이블이 없습니다. DB={DB_PATH}"
            )

        has_openlaw = table_exists(conn, "openlaw_efyd_info")
        sql = """
            SELECT
                g.upload_order,
                TRIM(g.law_id) AS law_id,
                COALESCE(g.api_name, '') AS api_name,
                COALESCE(g.law_short_name, '') AS law_short_name,
                CASE
                    WHEN ? = 1 AND oe.law_id IS NOT NULL THEN 1
                    ELSE 0
                END AS already_collected
            FROM gwanselaw_list g
            LEFT JOIN openlaw_efyd_info oe
              ON CAST(oe.law_id AS INTEGER) = CAST(TRIM(g.law_id) AS INTEGER)
            WHERE TRIM(g.law_id) != ''
              AND UPPER(TRIM(COALESCE(g.file_type, ''))) = 'JSON'
        """
        params: list[Any] = [1 if has_openlaw else 0]

        if not include_tybeop:
            sql += " AND COALESCE(g.api_name, '') NOT LIKE '%타법폐지%'"

        sql += " ORDER BY g.upload_order ASC, g.api_name ASC"

        cur = conn.cursor()
        rows = cur.execute(sql, params).fetchall()

        targets: list[BatchTarget] = []
        seen: set[str] = set()
        for upload_order, law_id, api_name, law_short_name, already_collected in rows:
            lid = pad_law_id(law_id)
            if not lid or lid in seen:
                continue
            seen.add(lid)
            collected = bool(already_collected)
            if skip_collected and collected:
                continue
            targets.append(
                BatchTarget(
                    law_id=lid,
                    api_name=str(api_name or ""),
                    law_short_name=str(law_short_name or ""),
                    upload_order=int(upload_order or 0),
                    already_collected=collected,
                )
            )
            if limit is not None and len(targets) >= limit:
                break
        return targets
    finally:
        conn.close()


def parse_law_ids_arg(raw: str) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for part in re.split(r"[\s,]+", raw.strip()):
        if not part:
            continue
        lid = pad_law_id(part)
        if lid and lid not in seen:
            seen.add(lid)
            ids.append(lid)
    return ids


def load_targets_from_ids(law_ids: list[str]) -> list[BatchTarget]:
    conn = get_db_connection()
    try:
        has_gwan = table_exists(conn, "gwanselaw_list")
        has_openlaw = table_exists(conn, "openlaw_efyd_info")
        cur = conn.cursor()
        targets: list[BatchTarget] = []
        for raw in law_ids:
            lid = pad_law_id(raw)
            api_name = ""
            short_name = ""
            upload_order = 0
            collected = lid in law_ids_with_openlaw_body([lid])
            if has_gwan:
                row = cur.execute(
                    """
                    SELECT upload_order, api_name, law_short_name
                    FROM gwanselaw_list
                    WHERE CAST(TRIM(law_id) AS INTEGER) = CAST(TRIM(?) AS INTEGER)
                    ORDER BY upload_order ASC
                    LIMIT 1
                    """,
                    (lid,),
                ).fetchone()
                if row:
                    upload_order = int(row[0] or 0)
                    api_name = str(row[1] or "")
                    short_name = str(row[2] or "")
            if has_openlaw:
                row2 = cur.execute(
                    "SELECT 1 FROM openlaw_efyd_info WHERE law_id = ? LIMIT 1",
                    (int(lid),),
                ).fetchone()
                collected = row2 is not None
            targets.append(
                BatchTarget(
                    law_id=lid,
                    api_name=api_name,
                    law_short_name=short_name,
                    upload_order=upload_order,
                    already_collected=collected,
                )
            )
        return targets
    finally:
        conn.close()


def print_target_preview(targets: list[BatchTarget]) -> None:
    print(f"대상 {len(targets)}건 (DB={DB_PATH})")
    for i, t in enumerate(targets[:20], start=1):
        flag = " [수집됨]" if t.already_collected else ""
        label = t.api_name or t.law_short_name or t.law_id
        print(f"  {i:>3}. {t.law_id}  {label}{flag}")
    if len(targets) > 20:
        print(f"  ... 외 {len(targets) - 20}건")


def save_summary(
    *,
    targets: list[BatchTarget],
    success_ids: list[str],
    failed: list[dict[str, str]],
    skipped: int,
    started_at: datetime,
) -> str:
    import os

    os.makedirs(LOG_DIR, exist_ok=True)
    stamp = started_at.strftime("%Y%m%d_%H%M%S")
    path = os.path.join(LOG_DIR, f"{stamp}_batch_openlaw_summary.json")
    payload = {
        "startedAt": started_at.isoformat(timespec="seconds"),
        "finishedAt": datetime.now().isoformat(timespec="seconds"),
        "dbPath": DB_PATH,
        "targetCount": len(targets),
        "successCount": len(success_ids),
        "failCount": len(failed),
        "skippedCollected": skipped,
        "successLawIds": success_ids,
        "failures": failed,
        "targets": [
            {
                "lawId": t.law_id,
                "apiName": t.api_name,
                "lawShortName": t.law_short_name,
                "uploadOrder": t.upload_order,
            }
            for t in targets
        ],
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return path


def run_batch(targets: list[BatchTarget]) -> tuple[list[str], list[dict[str, str]]]:
    if not targets:
        return [], []

    law_ids = [t.law_id for t in targets]
    emit_progress(
        {
            "type": "run_start",
            "lawTotal": len(targets),
            "stepTotal": 12,
            "mode": "batch_openlaw_crawl",
        }
    )

    success_ids: list[str] = []
    failed: list[dict[str, str]] = []

    for i, target in enumerate(targets, start=1):
        label = target.api_name or target.law_short_name or target.law_id
        log(f"=== 배치 [{i}/{len(targets)}] {target.law_id} {label} ===")
        try:
            crawl_by_law_id(
                target.law_id,
                law_index=i,
                law_total=len(targets),
            )
        except Exception as exc:
            err = str(exc) or exc.__class__.__name__
            log(f"배치 오류 law_id={target.law_id}: {err}")
            failed.append(
                {
                    "lawId": target.law_id,
                    "apiName": label,
                    "error": err,
                    "traceback": traceback.format_exc(),
                }
            )
            emit_progress(
                {
                    "type": "law_done",
                    "lawId": target.law_id,
                    "lawIndex": i,
                    "lawTotal": len(targets),
                    "ok": False,
                    "error": err,
                }
            )
            continue

        after_saved = law_ids_with_openlaw_body([target.law_id])
        if target.law_id in after_saved:
            success_ids.append(target.law_id)
        else:
            failed.append(
                {
                    "lawId": target.law_id,
                    "apiName": label,
                    "error": "openlaw_efyd_info 저장 확인 실패",
                }
            )

    emit_progress(
        {
            "type": "run_done",
            "lawTotal": len(targets),
            "successCount": len(success_ids),
            "failCount": len(failed),
        }
    )
    return success_ids, failed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="gwanselaw_list 기반 일괄 OPEN API 법령수집 (law_crawler 12 API)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="gwanselaw_list의 JSON·법령ID 대상 전체 수집",
    )
    parser.add_argument(
        "--law-ids",
        type=str,
        default="",
        help="지정 법령ID (쉼표/공백 구분). --all 과 함께 쓰면 교집합",
    )
    parser.add_argument(
        "--skip-collected",
        action="store_true",
        help="openlaw_efyd_info 에 이미 있는 법령은 제외",
    )
    parser.add_argument(
        "--include-tybeop",
        action="store_true",
        help="제공API명에「타법폐지」포함 항목도 포함 (기본: 제외)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="최대 처리 건수 (0=제한 없음)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="대상 목록만 출력하고 수집하지 않음",
    )
    parser.add_argument(
        "--yes",
        "-y",
        action="store_true",
        help="확인 없이 바로 실행 (비대화형)",
    )
    return parser


def confirm_run(count: int) -> bool:
    if os.environ.get("OPENLAWAPI_NONINTERACTIVE", "").strip() == "1":
        return True
    try:
        answer = input(
            f"\n{count}건 OPEN API 법령수집을 시작합니다. 계속? [y/N]: "
        ).strip().lower()
    except EOFError:
        return False
    return answer in ("y", "yes")


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    limit = args.limit if args.limit > 0 else None
    explicit_ids = parse_law_ids_arg(args.law_ids) if args.law_ids else []

    if not args.all and not explicit_ids:
        parser.print_help()
        print(
            "\n예: python batch_openlaw_crawl.py --all"
            "\n    python batch_openlaw_crawl.py --all --skip-collected -y"
        )
        return 1

    skipped = 0
    if args.all:
        all_targets = load_targets_from_db(
            skip_collected=args.skip_collected,
            include_tybeop=args.include_tybeop,
            limit=None,
        )
        if explicit_ids:
            allow = set(explicit_ids)
            targets = [t for t in all_targets if t.law_id in allow]
        else:
            targets = all_targets
        if args.skip_collected:
            skipped = 0  # already filtered in SQL
    else:
        targets = load_targets_from_ids(explicit_ids)
        if args.skip_collected:
            before = len(targets)
            targets = [t for t in targets if not t.already_collected]
            skipped = before - len(targets)

    if limit is not None:
        targets = targets[:limit]

    print_target_preview(targets)

    if args.dry_run:
        print("\n(dry-run: 수집하지 않았습니다.)")
        return 0

    if not targets:
        print("\n수집 대상이 없습니다.")
        return 0

    if not args.yes and not confirm_run(len(targets)):
        print("취소되었습니다.")
        return 0

    started_at = datetime.now()
    success_ids, failed = run_batch(targets)
    summary_path = save_summary(
        targets=targets,
        success_ids=success_ids,
        failed=failed,
        skipped=skipped,
        started_at=started_at,
    )

    print("\n=== 일괄 OPEN API 법령수집 완료 ===")
    print(f"대상: {len(targets)}건")
    print(f"성공: {len(success_ids)}건")
    print(f"실패: {len(failed)}건")
    if skipped:
        print(f"스킵(이미 수집): {skipped}건")
    print(f"요약: {summary_path}")
    if failed:
        print("\n실패 목록:")
        for item in failed[:30]:
            print(f"  · {item['lawId']} {item.get('apiName', '')}: {item['error']}")
        if len(failed) > 30:
            print(f"  ... 외 {len(failed) - 30}건 (요약 JSON 참고)")

    return 0 if not failed else 2


if __name__ == "__main__":
    sys.exit(main())
