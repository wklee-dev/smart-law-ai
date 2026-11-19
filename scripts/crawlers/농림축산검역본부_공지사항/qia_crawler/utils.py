"""공통 유틸리티: 파일명 안전화, 제목 정규화, HTML→텍스트 변환."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

from bs4 import BeautifulSoup, Comment

KST = timezone(timedelta(hours=9))

# 파일명에 쓸 수 없는 문자(윈도우/리눅스 공통) 및 제어문자
_ILLEGAL_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
_MULTI_SPACE = re.compile(r"[ \t\u00a0]+")
_MULTI_NEWLINE = re.compile(r"\n{3,}")
_ZERO_WIDTH = re.compile(r"[\u200b\u200c\u200d\ufeff]")
_SIZE_SUFFIX = re.compile(r"\s*\((?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?\s*(?:KB|MB|GB|Bytes?|바이트)\)\s*$", re.I)


def now_kst() -> datetime:
    return datetime.now(KST)


def stamp(fmt: str = "%Y%m%d_%H%M%S") -> str:
    return now_kst().strftime(fmt)


def clean_text(value: str | None) -> str:
    """연속 공백/제로폭 문자/특수 공백을 정리한다."""
    if not value:
        return ""
    text = unicodedata.normalize("NFC", value)
    text = _ZERO_WIDTH.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _MULTI_SPACE.sub(" ", text)
    return text.strip()


def normalize_title(title: str) -> str:
    """중복 판정용 제목 정규화(공백/구두점/대소문자 제거)."""
    text = clean_text(title).lower()
    text = re.sub(r"[\s\W_]+", "", text, flags=re.UNICODE)
    return text


def content_key(title: str, posted_date: str) -> str:
    """제목+등록일 기반 내용 해시(게시글 ID가 바뀌어도 중복 판정 가능)."""
    raw = f"{normalize_title(title)}|{posted_date or ''}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def safe_filename(name: str, max_len: int = 120, default: str = "첨부파일") -> str:
    """운영체제에서 안전한 파일명으로 변환한다(확장자 보존)."""
    name = unicodedata.normalize("NFC", name or "").strip()
    name = _ILLEGAL_CHARS.sub("_", name)
    name = _MULTI_SPACE.sub(" ", name).strip(" .")
    if not name:
        return default

    path = Path(name)
    suffix = path.suffix
    stem = path.stem if suffix else path.name
    if len(name) > max_len:
        keep = max_len - len(suffix)
        stem = stem[:keep].rstrip(" .")
        name = f"{stem}{suffix}"
    return name or default


def short_title(title: str, limit: int = 40) -> str:
    """폴더/파일명에 붙일 짧은 제목."""
    text = re.sub(r"\s+", " ", clean_text(title))
    text = _ILLEGAL_CHARS.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    if len(text) > limit:
        text = text[:limit].rstrip(" .")
    return text or "제목없음"


def parse_attachment_label(label: str) -> str:
    """'파일명.hwpx (2,963KB)' → '파일명.hwpx'"""
    text = clean_text(label).replace("\u00a0", " ")
    text = _SIZE_SUFFIX.sub("", text).strip()
    return text


# ---------------------------------------------------------------------------
# HTML → 텍스트 / 마크다운
# ---------------------------------------------------------------------------
_BLOCK_TAGS = (
    "p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "ul", "ol", "blockquote", "section", "article", "pre",
)


def strip_comments(html: str) -> str:
    """HWP 에디터 JSON 등 주석 형태로 삽입된 대용량 데이터를 제거한다."""
    return re.sub(r"<!--.*?-->", "", html, flags=re.S)


def html_to_text(node) -> str:
    """BeautifulSoup 노드를 사람이 읽기 좋은 텍스트로 변환한다."""
    if node is None:
        return ""

    soup = BeautifulSoup(str(node), "lxml")

    # 주석(HWP 에디터 JSON) 제거
    for comment in soup.find_all(string=lambda s: isinstance(s, Comment)):
        comment.extract()

    # 표는 행 단위로, 셀은 ' | ' 로 구분
    for table in soup.find_all("table"):
        rows = []
        for tr in table.find_all("tr"):
            cells = [clean_text(td.get_text(" ", strip=True)) for td in tr.find_all(["th", "td"])]
            cells = [c for c in cells if c]
            if cells:
                rows.append(" | ".join(cells))
        table.replace_with(soup.new_string("\n" + "\n".join(rows) + "\n"))

    for tag in soup.find_all(_BLOCK_TAGS):
        if tag.name == "br":
            tag.replace_with("\n")
        else:
            tag.insert_before("\n")
            tag.insert_after("\n")

    text = soup.get_text()
    lines = [re.sub(r"[ \t\u00a0]+", " ", line).strip() for line in text.split("\n")]
    text = "\n".join(lines)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip()


def absolutize_urls(node, base_url: str) -> None:
    """본문 내 상대경로 이미지/링크를 절대 URL로 변환한다(오프라인 열람 대비)."""
    from urllib.parse import urljoin

    for tag, attr in (("img", "src"), ("a", "href")):
        for el in node.find_all(tag):
            value = el.get(attr)
            if value and not value.startswith(("http://", "https://", "mailto:", "javascript:", "#", "data:")):
                el[attr] = urljoin(base_url + "/", value)


def body_html_clean(body_node, base_url: str) -> str:
    """저장용 본문 HTML: 주석 제거 + 절대 URL 변환."""
    soup = BeautifulSoup(str(body_node), "lxml")
    for comment in soup.find_all(string=lambda s: isinstance(s, Comment)):
        comment.extract()
    absolutize_urls(soup, base_url)
    return str(soup)
