"""수집 결과 저장: 본문 마크다운/HTML 파일, 실행 리포트(CSV), 누적 내보내기."""

from __future__ import annotations

import csv
import json
from pathlib import Path

from .parser import PostDetail
from .utils import clean_text, short_title


def body_filename(detail: PostDetail) -> str:
    date = detail.posted_date or "날짜없음"
    return f"{date}_{detail.post_id}_{short_title(detail.title)}"


def save_body_files(detail: PostDetail, body_dir: Path) -> tuple[Path, Path]:
    """본문을 .md(열람용)와 .html(원본 보존용)로 저장한다."""
    body_dir.mkdir(parents=True, exist_ok=True)
    base = body_filename(detail)

    md_path = body_dir / f"{base}.md"
    html_path = body_dir / f"{base}_본문.html"

    attach_lines = []
    for att in detail.attachments:
        local = att.local_path or "(다운로드 안 됨)"
        attach_lines.append(f"- {att.name} → `{local}`")

    md = [
        f"# {clean_text(detail.title)}",
        "",
        f"- 게시글 ID: `{detail.post_id}`",
        f"- 담당부서: {detail.dept or '-'}",
        f"- 작성자: {detail.writer or '-'}",
        f"- 등록일: {detail.posted_date or '-'}",
        f"- 조회수: {detail.views or '-'}",
        f"- 원문 URL: {detail.url}",
        f"- 첨부파일: {len(detail.attachments)}개",
        "",
    ]
    if attach_lines:
        md += ["## 첨부파일", ""] + attach_lines + [""]
    md += ["## 본문", "", detail.body_text or "(본문 없음)", ""]

    md_path.write_text("\n".join(md), encoding="utf-8")
    html_path.write_text(detail.body_html or "", encoding="utf-8")
    return md_path, html_path


REPORT_COLUMNS = [
    "번호", "제목", "담당부서", "작성자", "등록일", "조회수",
    "첨부수", "첨부파일", "원문URL", "본문파일", "첨부폴더", "수집시각",
]


def write_run_report(rows: list[dict], path: Path) -> Path:
    """이번 실행에서 새로 수집한 글 목록을 CSV로 저장(엑셀 호환 utf-8-sig)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=REPORT_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in REPORT_COLUMNS})
    return path


def export_history_csv(posts: list, path: Path) -> Path:
    """누적 이력 전체를 CSV로 내보낸다."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow(REPORT_COLUMNS)
        for post in posts:
            attachments = json.loads(post["attachments"] or "[]")
            names = ", ".join(a.get("name", "") for a in attachments)
            writer.writerow(
                [
                    post["board_no"],
                    post["title"],
                    post["dept"],
                    post["writer"],
                    post["posted_date"],
                    post["views"],
                    post["attachment_count"],
                    names,
                    post["url"],
                    post["body_path"],
                    "",
                    post["crawled_at"],
                ]
            )
    return path


def export_history_xlsx(posts: list, path: Path) -> Path:
    """누적 이력을 엑셀(.xlsx)로 내보낸다."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    path.parent.mkdir(parents=True, exist_ok=True)
    wb = Workbook()
    ws = wb.active
    ws.title = "공지사항 수집이력"

    header_fill = PatternFill("solid", fgColor="1F3864")
    header_font = Font(color="FFFFFF", bold=True)
    ws.append(REPORT_COLUMNS)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for post in posts:
        attachments = json.loads(post["attachments"] or "[]")
        ws.append(
            [
                post["board_no"],
                post["title"],
                post["dept"],
                post["writer"],
                post["posted_date"],
                post["views"],
                post["attachment_count"],
                ", ".join(a.get("name", "") for a in attachments),
                post["url"],
                post["body_path"],
                "",
                post["crawled_at"],
            ]
        )

    widths = [8, 60, 18, 12, 12, 8, 8, 40, 45, 55, 40, 20]
    for index, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(index)].width = width
    for row in ws.iter_rows(min_row=2):
        row[1].alignment = Alignment(wrap_text=True, vertical="top")

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    wb.save(path)
    return path
