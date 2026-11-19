"""게시판 HTML 파싱 (목록 / 상세)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import parse_qs, urljoin, urlparse

from bs4 import BeautifulSoup

from .config import BASE_URL
from .utils import body_html_clean, clean_text, html_to_text, parse_attachment_label

DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
TOTAL_RE = re.compile(r"전체\s*:\s*([\d,]+)\s*건\s*\(\s*(\d+)\s*쪽\s*/\s*(\d+)\s*쪽\s*\)")


@dataclass
class Attachment:
    file_id: str
    name: str            # 사이트 표기 파일명(크기 표기 제거)
    url: str
    local_path: str | None = None
    size: int | None = None
    status: str = "pending"   # downloaded | exists | failed | skipped


@dataclass
class ListItem:
    post_id: str
    no: str
    title: str
    writer: str
    posted_date: str
    views: str
    url: str
    has_attachment: bool


@dataclass
class PostDetail:
    post_id: str
    title: str = ""
    dept: str = ""
    writer: str = ""
    posted_date: str = ""
    views: str = ""
    url: str = ""
    body_text: str = ""
    body_html: str = ""
    attachments: list[Attachment] = field(default_factory=list)


def _id_from_href(href: str) -> str:
    query = parse_qs(urlparse(href).query)
    return (query.get("id") or [""])[0]


def parse_list(html: str, page: int = 1) -> tuple[list[ListItem], int | None]:
    """목록 페이지 → (게시글 목록, 전체 페이지 수)."""
    soup = BeautifulSoup(html, "lxml")

    total_pages: int | None = None
    page_info = soup.find(string=TOTAL_RE)
    if page_info:
        match = TOTAL_RE.search(str(page_info))
        if match:
            total_pages = int(match.group(3))

    table = soup.select_one("table.list01") or soup.select_one("table")
    if table is None:
        return [], total_pages

    items: list[ListItem] = []
    for tr in table.select("tbody tr"):
        link = tr.select_one("a[href*='viewwebQiaCom']")
        if link is None:
            continue

        post_id = _id_from_href(link.get("href", ""))
        if not post_id:
            continue

        cells = tr.find_all("td", recursive=False)
        texts = [clean_text(td.get_text(" ", strip=True)) for td in cells]

        no = texts[0] if texts else ""
        writer = texts[2] if len(texts) > 2 else ""
        row_text = clean_text(tr.get_text(" ", strip=True))
        date_match = DATE_RE.search(row_text)
        posted_date = date_match.group(0) if date_match else ""

        views = ""
        for value in reversed(texts):
            if value.isdigit() and value != no:
                views = value
                break

        has_attachment = bool(
            tr.select_one("a[href*='getZipwebQiaCom']")
            or tr.select_one("img[alt*='첨부']")
        )

        items.append(
            ListItem(
                post_id=post_id,
                no=no,
                title=clean_text(link.get_text(" ", strip=True)),
                writer=writer,
                posted_date=posted_date,
                views=views,
                url=urljoin(BASE_URL, link.get("href", "")),
                has_attachment=has_attachment,
            )
        )
    return items, total_pages


def _find_info_value(table, label: str) -> str:
    """'담당부서', '작성자' 처럼 th 라벨 다음 td 값을 찾는다."""
    for th in table.find_all("th"):
        if label in clean_text(th.get_text(" ", strip=True)):
            td = th.find_next_sibling("td")
            if td is not None:
                return clean_text(td.get_text(" ", strip=True))
    return ""


def parse_detail(html: str, post_id: str, url: str = "") -> PostDetail:
    """상세 페이지 → 제목/메타/본문/첨부파일."""
    soup = BeautifulSoup(html, "lxml")
    detail = PostDetail(post_id=post_id, url=url)

    table = soup.select_one("table.view01") or soup.select_one("table.bord_chocolate")
    if table is None:
        return detail

    title_th = table.select_one("th.top_th") or table.select_one("th[abbr='제목']")
    detail.title = clean_text(title_th.get_text(" ", strip=True)) if title_th else ""

    detail.dept = _find_info_value(table, "담당부서")
    detail.writer = _find_info_value(table, "작성자")

    tdbg = table.select_one("td.tdbg01")
    if tdbg is not None:
        detail.views = clean_text(tdbg.get_text(" ", strip=True))

    # 등록일: 메타 행에서 yyyy-mm-dd 패턴
    meta_row = title_th.find_parent("tr").find_next_sibling("tr") if title_th else None
    if meta_row is not None:
        date_match = DATE_RE.search(meta_row.get_text(" ", strip=True))
        if date_match:
            detail.posted_date = date_match.group(0)

    # 첨부파일
    seen: set[str] = set()
    for link in table.select("a[href*='downloadwebQiaCom']"):
        file_id = _id_from_href(link.get("href", ""))
        if not file_id or file_id in seen:
            continue
        seen.add(file_id)
        detail.attachments.append(
            Attachment(
                file_id=file_id,
                name=parse_attachment_label(link.get_text(" ", strip=True)),
                url=urljoin(BASE_URL, link.get("href", "")),
            )
        )

    # 본문: 첨부 목록(<ul><li><a download…>)이 아닌 colspan=6 셀
    body_cell = None
    for tr in table.select("tbody tr"):
        td = tr.find("td", attrs={"colspan": "6"})
        if td is None or tr.find("th") is not None:
            continue
        list_block = td.find("ul")
        if list_block is not None and list_block.select_one("a[href*='downloadwebQiaCom']"):
            continue  # 첨부파일 목록 행
        body_cell = td
        break

    if body_cell is not None:
        detail.body_text = html_to_text(body_cell)
        detail.body_html = body_html_clean(body_cell, BASE_URL)

    if not detail.title:
        og = soup.find("meta", attrs={"property": "og:title"})
        if og and og.get("content"):
            detail.title = clean_text(og["content"])

    return detail
