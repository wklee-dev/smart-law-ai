"""KOTRA 뉴스 상세 HTML 파서. 네트워크 요청이나 파일 저장은 하지 않는다.

표준 뉴스의 #pdfArea와 해외인증정보의 #pdfArea .authInfoView를 지원한다.
첨부 다운로드는 사이트 스크립트의 gbn/nttSn/atFileSn 규칙을 따른다.
"""

from __future__ import annotations

import copy
import hashlib
import re
from urllib.parse import parse_qs, unquote, urlencode, urljoin, urlparse

from bs4 import BeautifulSoup, Comment, NavigableString, Tag


_DOWNLOAD_PATH = "/ajaxa/fileCpnt/fileDown.do"
_BLOCKS = {
    "address", "article", "aside", "blockquote", "dd", "div", "dl", "dt",
    "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5",
    "h6", "header", "li", "main", "ol", "p", "pre", "section", "ul",
}


def _clean(value: str) -> str:
    """공백만 정리하며 한글 등 문자 자체는 변형하지 않는다."""
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def _text(node: Tag | None) -> str:
    """블록 및 표의 행/열을 보존한 읽기 쉬운 평문을 만든다."""
    if node is None:
        return ""

    def render(item) -> str:
        if isinstance(item, Comment):
            return ""
        if isinstance(item, NavigableString):
            return str(item)
        if not isinstance(item, Tag) or item.name in {"script", "style", "noscript"}:
            return ""
        if item.name == "br":
            return "\n"
        if item.name == "img":
            alt = _clean(item.get("alt", ""))
            return f"[이미지: {alt}]" if alt else ""
        if item.name == "table":
            lines = []
            caption = item.find("caption", recursive=False)
            if caption:
                cap = _clean(render(caption))
                if cap:
                    lines.append(cap)
            for row in item.find_all("tr"):
                if row.find_parent("table") is not item:
                    continue
                cells = []
                for cell in row.find_all(["th", "td"], recursive=False):
                    text = render(cell)
                    text = " / ".join(_clean(s) for s in text.splitlines() if _clean(s))
                    spans = []
                    for attr, label in (("rowspan", "행병합"), ("colspan", "열병합")):
                        val = str(cell.get(attr, "")).strip()
                        if val.isdigit() and int(val) > 1:
                            spans.append(f"{label} {val}")
                    if spans:
                        text = f"[{', '.join(spans)}] {text}"
                    cells.append(text)
                if cells:
                    lines.append(" | ".join(cells))
            return "\n" + "\n".join(lines) + "\n"
        text = "".join(render(child) for child in item.children)
        return "\n" + text + "\n" if item.name in _BLOCKS else text

    raw = render(node).replace("\xa0", " ").replace("\r", "\n")
    lines = [re.sub(r"[^\S\n]+", " ", line).strip() for line in raw.split("\n")]
    # HTML indentation often produces blank lines; keep at most one paragraph break.
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _valid_id(value: str, label: str) -> str:
    value = str(value or "").strip()
    if not re.fullmatch(r"[0-9]+", value) or int(value) <= 0:
        raise ValueError(f"잘못된 {label}: {value!r}")
    return value


def _article_id(soup: BeautifulSoup, page_url: str) -> str | None:
    field = soup.select_one('#sendForm input[name="pNttSn"]')
    form_id = str(field.get("value", "")).strip() if field else ""
    query = parse_qs(urlparse(page_url).query)
    url_id = (query.get("pNttSn") or query.get("nttSn") or [""])[0].strip()
    if form_id:
        _valid_id(form_id, "게시물 ID")
    if url_id:
        _valid_id(url_id, "URL 게시물 ID")
    if form_id and url_id and int(form_id) != int(url_id):
        raise ValueError(f"게시물 ID 불일치: HTML={form_id}, URL={url_id}")
    return form_id or url_id or None


def _filename(value: str) -> str:
    # BeautifulSoup has already decoded HTML entities once. Decode percent-encoded
    # UTF-8 where present, but don't corrupt malformed percent-encoded sequences.
    name = _clean(value)
    if re.search(r"%[0-9a-fA-F]{2}", name):
        try:
            name = unquote(name, encoding="utf-8", errors="strict")
        except UnicodeDecodeError:
            pass
    return name


def _is_download(tag: Tag) -> bool:
    if tag.name not in {"a", "button"}:
        return False
    onclick = str(tag.get("onclick", "")).lower()
    if "filepreview" in onclick or "priview" in " ".join(tag.get("class", [])).lower():
        return False
    href = str(tag.get("href", ""))
    classes = " ".join(tag.get("class", [])).lower()
    return (
        "fn_filedown" in onclick
        or "filecpnt/filedown.do" in href.lower()
        or (tag.has_attr("data-atfilesn") and tag.has_attr("data-filename"))
        or "file-download" in classes
        or ("file_" in classes and tag.has_attr("data-filename"))
    )


def _attachments(area: Tag, page_url: str, article_id: str | None) -> list[dict]:
    files = []
    seen = set()
    for tag in area.find_all(["a", "button"]):
        if not _is_download(tag):
            continue
        href = str(tag.get("href", "")).strip()
        onclick = str(tag.get("onclick", ""))
        query = parse_qs(urlparse(href).query)
        real_id = article_id
        query_id = (query.get("nttSn") or query.get("pNttSn") or [""])[0]
        if query_id:
            _valid_id(query_id, "첨부 게시물 ID")
            if real_id and int(query_id) != int(real_id):
                raise ValueError("첨부 링크의 게시물 ID가 상세 페이지와 다릅니다")
            real_id = query_id
        file_sn = str(tag.get("data-atfilesn", "") or (query.get("atFileSn") or [""])[0]).strip()
        gbn = str(tag.get("data-gbn", "") or (query.get("gbn") or [""])[0]).strip()
        is_etc = "fn_filedownetc" in onclick.lower()
        is_site_js = "fn_filedown" in onclick.lower() or bool(file_sn) or is_etc
        if is_site_js:
            if not real_id:
                raise ValueError("첨부파일 다운로드에 필요한 실제 게시물 ID가 없습니다")
            _valid_id(real_id, "첨부 게시물 ID")
            gbn = gbn or ("n01" if not is_etc else "")
            if not re.fullmatch(r"n[0-9]+", gbn):
                raise ValueError(f"알 수 없는 첨부파일 유형: {gbn!r}")
            params = {"gbn": gbn, "nttSn": real_id}
            if gbn == "n01":
                params["atFileSn"] = _valid_id(file_sn, "첨부파일 ID")
                params["pFrontYn"] = "Y"
            elif file_sn:
                params["atFileSn"] = _valid_id(file_sn, "첨부파일 ID")
            download_url = urljoin(page_url, _DOWNLOAD_PATH) + "?" + urlencode(params)
            # Safe as a filename on Windows while unique across posts and types.
            file_id = "_".join(x for x in (real_id, gbn, file_sn) if x)
        elif href and not href.startswith(("#", "javascript:")):
            download_url = urljoin(page_url, href)
            if urlparse(download_url).scheme not in {"http", "https"}:
                raise ValueError(f"지원하지 않는 첨부 URL: {href!r}")
            file_id = hashlib.sha256(download_url.encode("utf-8")).hexdigest()
        else:
            raise ValueError(f"첨부파일 다운로드 정보를 해석할 수 없습니다: {str(tag)[:200]}")
        original_name = _filename(str(tag.get("data-filename", "")) or tag.get_text(" ", strip=True))
        if not original_name and href:
            original_name = _filename(urlparse(href).path.rsplit("/", 1)[-1])
        if not original_name:
            raise ValueError(f"첨부파일 이름이 없습니다: {file_id}")
        # Make any download link that occurs in article content navigable too.
        tag["href"] = download_url
        if tag.has_attr("onclick"):
            del tag["onclick"]
        if file_id in seen:
            continue
        seen.add(file_id)
        record = {"file_id": file_id, "original_name": original_name, "download_url": download_url}
        if real_id:
            record["real_source_id"] = real_id
        files.append(record)
    return files


def _absolute_srcset(value: str, base: str) -> str:
    # Comma+space separates candidates; commas inside a data URI are left intact.
    parts = []
    for candidate in re.split(r",\s+", value):
        # Standard common form: URL followed by optional width/density descriptor.
        match = re.match(r"\s*(\S+)(.*)", candidate, flags=re.S)
        if match:
            url, suffix = match.groups()
            parts.append(urljoin(base, url) + suffix)
        elif candidate:
            parts.append(candidate)
    return ", ".join(parts)


def _absolute_urls(node: Tag, base: str) -> None:
    for tag in [node, *node.find_all(True)]:
        for attr in ("href", "src", "data-src", "poster"):
            value = tag.get(attr)
            if isinstance(value, str) and value.strip():
                tag[attr] = urljoin(base, value.strip())
        if isinstance(tag.get("srcset"), str):
            tag["srcset"] = _absolute_srcset(tag["srcset"], base)


def _table_field(area: Tag, label: str) -> str:
    wanted = re.sub(r"\s+", "", label)
    for th in area.find_all("th"):
        if re.sub(r"\s+", "", th.get_text(" ", strip=True)) == wanted:
            td = th.find_next_sibling("td")
            return _clean(td.get_text(" ", strip=True)) if td else ""
    return ""


def parse_detail(html: str, page_url: str, source_id: str) -> tuple[dict, list[dict]]:
    """상세 HTML을 (게시물 dict, 첨부 dict 리스트)로 반환한다.

    source_id는 호출자 쪽 식별자로 보존하며, 다운로드에 사용할 nttSn은
    sendForm 또는 상세 URL에서 얻는다. keywords는 문자열 목록이다.
    content_html에는 요약, 기사 본문 및 저작권자 문구가 순서대로 들어간다.
    """
    if not isinstance(html, str) or not html.strip():
        raise ValueError("상세 HTML이 비어 있습니다")
    parsed_url = urlparse(page_url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        raise ValueError("page_url은 절대 HTTP(S) URL이어야 합니다")
    soup = BeautifulSoup(html, "html.parser")
    area = soup.select_one("#pdfArea")
    if not area:
        raise ValueError("KOTRA 상세 영역 #pdfArea를 찾을 수 없습니다")
    article_id = _article_id(soup, page_url)
    # Process downloads before copying body so embedded JS download links work.
    attachments = _attachments(area, page_url, article_id)
    title_tag = area.select_one("dt .txtL strong")
    auth_area = area.select_one(".authInfoView")
    content_parts = []
    info = {"source_id": str(source_id), "source": "", "keywords": []}
    if title_tag:
        info["title"] = _clean(title_tag.get_text(" ", strip=True))
        body = area.select_one(".view_txt .viewDataWrap")
        if not body:
            raise ValueError("KOTRA 뉴스의 본문 영역 .viewDataWrap을 찾을 수 없습니다")
        if not _text(body) and not body.find(["img", "video", "audio"]):
            raise ValueError("KOTRA 뉴스의 본문이 비어 있습니다")
        subtitle = area.select_one(".subTitleArea")
        if subtitle:
            content_parts.append(copy.deepcopy(subtitle))
            info["summary"] = _text(subtitle)
        else:
            info["summary"] = ""
        content_parts.append(copy.deepcopy(body))
        copyright_tag = area.select_one(".view_txt .txt_copyRightHolder")
        if copyright_tag:
            content_parts.append(copy.deepcopy(copyright_tag))
        info["keywords"] = [
            _clean(a.get_text(" ", strip=True)).lstrip("#").strip()
            for a in area.select(".keywordArea a") if _clean(a.get_text(" ", strip=True)).lstrip("#").strip()
        ]
        categ = area.select_one("dt .txtInfo .categ")
        date = area.select_one("dt .txtInfo .date")
        source = area.select_one("dt .txtInfo .source")
        if categ:
            info["category"] = _clean(categ.get_text(" ", strip=True))
        if date:
            info["published_date"] = _clean(date.get_text(" ", strip=True))
        if source:
            info["source"] = re.sub(r"^출처\s*[:：]\s*", "", _clean(source.get_text(" ", strip=True)))
        for li in area.select("dt .txtInfo li"):
            if li.get("class"):
                continue
            value = _clean(li.get_text(" ", strip=True))
            if not value:
                continue
            if "무역관" in value:
                info.setdefault("office", value)
            else:
                info.setdefault("country", value)
    elif auth_area:
        # 인증정보 uses tables rather than the ordinary news article wrapper.
        info["title"] = _table_field(auth_area, "품목 명")
        info["summary"] = ""
        for label, key in (("국가", "country"), ("무역관", "office"), ("최종 업데이트", "updated_date")):
            value = _table_field(auth_area, label)
            if value:
                info[key] = value
        content_parts.append(copy.deepcopy(auth_area))
    else:
        raise ValueError("인식할 수 없는 KOTRA 상세 제목/본문 구조입니다")
    if not info.get("title"):
        raise ValueError("KOTRA 상세 제목이 비어 있습니다")
    wrapper = BeautifulSoup('<div class="kotra-article-content"></div>', "html.parser").div
    for part in content_parts:
        wrapper.append(part)
    _absolute_urls(wrapper, page_url)
    content_text = _text(wrapper)
    if not content_text and not wrapper.find(["img", "video", "audio"]):
        raise ValueError("KOTRA 상세 본문이 비어 있습니다")
    info["content_html"] = str(wrapper)
    info["content_text"] = content_text
    if article_id:
        info["real_source_id"] = article_id
    return info, attachments
