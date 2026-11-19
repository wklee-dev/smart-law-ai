"""Parse the KCTDI domestic customs-trends board without making HTTP requests.

Only recognized ``view-download--box`` links are treated as attachments.
Unknown markup is an error, not evidence that a page has no attachments.
``content_html`` is the inner HTML of ``.fr-view``, or of ``.view-txt``
when it directly contains the article's paragraphs. It is not sanitized.
"""

from datetime import date
import re
from urllib.parse import parse_qs, urljoin, urlsplit

from bs4 import BeautifulSoup, Comment, NavigableString, Tag


class SiteParseError(ValueError):
    """The response is not a recognized KCTDI list or detail page."""


def _absolute_page_url(page_url: str) -> str:
    parsed = urlsplit(page_url)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise SiteParseError("page_url must be an absolute HTTP(S) URL")
    if parsed.username is not None or parsed.password is not None:
        raise SiteParseError("page_url must not contain credentials")
    return page_url


def _resolve_same_board(href: str, page_url: str, what: str) -> str:
    if not isinstance(href, str) or not href.strip():
        raise SiteParseError(f"{what} has no href")
    absolute = urljoin(page_url, href.strip())
    target, page = urlsplit(absolute), urlsplit(page_url)
    if (target.scheme.lower() not in {"http", "https"}
            or target.netloc.lower() != page.netloc.lower()
            or target.path != page.path
            or target.username is not None or target.password is not None):
        raise SiteParseError(f"{what} points outside the current board")
    return absolute


def _single_parameter(url: str, key: str, what: str, *, required: bool = True):
    values = parse_qs(urlsplit(url).query, keep_blank_values=True).get(key, [])
    if not values and not required:
        return None
    if len(values) != 1 or not values[0].strip():
        raise SiteParseError(f"{what} must have exactly one nonempty {key}")
    return values[0].strip()


def _numeric_parameter(url: str, key: str, what: str, *, required: bool = True):
    value = _single_parameter(url, key, what, required=required)
    if value is not None and not re.fullmatch(r"[0-9]+", value):
        raise SiteParseError(f"{what} has an invalid {key}")
    return value


def _one(parent, selector: str, what: str):
    matches = parent.select(selector)
    if len(matches) != 1:
        raise SiteParseError(f"expected exactly one {what}; found {len(matches)}")
    return matches[0]


def _required_text(node, selector: str, what: str) -> str:
    text = _one(node, selector, what).get_text(" ", strip=True)
    if not text:
        raise SiteParseError(f"{what} is empty")
    return text


def _date_iso(value: str) -> str:
    match = re.fullmatch(r"(\d{4})[.\-](\d{2})[.\-](\d{2})", value)
    if not match or (value[4] != value[7]):
        raise SiteParseError(f"unrecognized registration date: {value!r}")
    try:
        return date(*(int(part) for part in match.groups())).isoformat()
    except ValueError as exc:
        raise SiteParseError(f"invalid registration date: {value!r}") from exc


def parse_list(html: str, page: int, page_url: str) -> list[dict]:
    """Return article metadata, or [] only for the recognized empty-list row.

    Malformed rows, response pages without the expected board, and ambiguous
    empty list structures raise SiteParseError rather than masquerading as [].
    """
    _absolute_page_url(page_url)
    if not isinstance(page, int) or isinstance(page, bool):
        raise SiteParseError("page must be an integer")
    soup = BeautifulSoup(html, "html.parser")
    board = _one(soup, "div.flex-table-list", "board list container")
    header = _one(board, ":scope > div.thead", "board header")
    for column in ("num", "subject", "writer", "date"):
        _one(header, f".th.{column}", f"{column} header")
    tbody = _one(board, ":scope > div.tbody", "board list body")
    children = tbody.find_all(recursive=False)
    if any(child.name != "div" or "tr" not in child.get("class", [])
           for child in children):
        raise SiteParseError("unrecognized element in board list body")
    if not children:
        raise SiteParseError("board list body has no rows or empty-list marker")

    results = []
    empty = False
    for row in children:
        markers = row.select(".td.no-list")
        if markers:
            if len(children) != 1 or len(markers) != 1 or results:
                raise SiteParseError("ambiguous empty-list marker")
            if row.find_all(recursive=False) != markers:
                raise SiteParseError("empty-list row contains unexpected cells")
            if markers[0].get_text(" ", strip=True) != "등록된 글이 없습니다.":
                raise SiteParseError("unrecognized empty-list message")
            empty = True
            continue
        number = _required_text(row, ".td.num", "board number")
        subject = _one(row, ".td.subject", "subject cell")
        link = _one(subject, "a[href]", "article link")
        title = link.get_text(" ", strip=True)
        if not title:
            raise SiteParseError("article title is empty")
        detail_url = _resolve_same_board(link.get("href"), page_url, "article link")
        article_no = _numeric_parameter(detail_url, "articleNo", "article link")
        mode = _single_parameter(detail_url, "mode", "article link", required=False)
        if mode is not None and mode != "view":
            raise SiteParseError("article link is not a view link")
        results.append({
            "article_no": article_no,
            "board_number": number,
            "title": title,
            "writer": _one(row, ".td.writer", "writer").get_text(" ", strip=True),
            "registered_date": _date_iso(_required_text(row, ".td.date", "date")),
            "detail_url": detail_url,
            "list_page": page,
        })
    if empty:
        return []
    return results


_BLOCK_TAGS = {"address", "article", "blockquote", "dd", "div", "dl", "dt",
               "h1", "h2", "h3", "h4", "h5", "h6", "li", "ol", "p",
               "pre", "section", "table", "td", "th", "tr", "ul"}


def _content_text(body: Tag) -> str:
    """Preserve inline adjacency while using line breaks at block boundaries."""
    pieces = []

    def visit(node):
        if isinstance(node, Comment):
            return
        if isinstance(node, NavigableString):
            pieces.append(str(node))
            return
        if not isinstance(node, Tag) or node.name in {"script", "style"}:
            return
        if node.name == "br":
            pieces.append("\n")
            return
        block = node.name in _BLOCK_TAGS
        if block:
            pieces.append("\n")
        for child in node.children:
            visit(child)
        if block:
            pieces.append("\n")

    for child in body.children:
        visit(child)
    lines = [re.sub(r"[^\S\n]+", " ", line).strip()
             for line in "".join(pieces).replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    return "\n".join(line for line in lines if line)


def _article_identity(view: Tag, page_url: str):
    from_url = _numeric_parameter(page_url, "articleNo", "detail URL", required=False)
    inputs = view.select(':scope > input[name="articleNo"]')
    if len(inputs) > 1:
        raise SiteParseError("multiple current article identifiers")
    from_input = inputs[0].get("value", "").strip() if inputs else None
    if from_input is not None and not re.fullmatch(r"[0-9]+", from_input):
        raise SiteParseError("invalid current article identifier")
    if from_url and from_input and from_url != from_input:
        raise SiteParseError("detail URL and HTML article identifiers disagree")
    return from_url or from_input


_BOARD_PATH = "/kctdi/research/research11.do"
_PDF_PREVIEW = re.compile(
    r"javascript:window\.open\('/_res/_common/js/pdf/web/viewer\.html\?file='"
    r"[ \t]*\+[ \t]*encodeURIComponent\('([^'\\\r\n]+)'\)\)"
)
_PDF_TARGET = re.compile(
    re.escape(_BOARD_PATH) + r"(?:;jsessionid=[A-Za-z0-9._-]+)?"
    r"\?mode=open-download&articleNo=([0-9]+)&attachNo=([0-9]+)"
)


def _pdf_preview_url(href: str, page_url: str) -> str:
    """Recognize only the observed viewer call; never execute JavaScript."""
    page = urlsplit(page_url)
    if (page.path != _BOARD_PATH or page.netloc.lower() not in {
            "www.kctdi.or.kr", "www.kctdi.or.kr:443",
            "kctdi.or.kr", "kctdi.or.kr:443"}):
        raise SiteParseError("PDF preview is not on the expected board")
    call = _PDF_PREVIEW.fullmatch(href.strip())
    target = _PDF_TARGET.fullmatch(call.group(1)) if call else None
    if not target:
        raise SiteParseError("unrecognized PDF preview link")
    # Reconstruct rather than use the embedded string: this removes the
    # optional session ID and ensures the result uses HTTPS on the same site.
    article, attachment = target.groups()
    return (f"https://{page.hostname}{_BOARD_PATH}"
            f"?mode=open-download&articleNo={article}&attachNo={attachment}")


def _attachments(box: Tag, page_url: str, article_no):
    if article_no is None:
        raise SiteParseError("cannot verify which article owns the attachments")
    children = box.find_all(recursive=False)
    if not children:
        raise SiteParseError("attachment container is unexpectedly empty")
    if any(isinstance(child, NavigableString) and child.strip()
           for child in box.children):
        raise SiteParseError("unrecognized text in attachment container")
    if any(not isinstance(child, Tag) or child.name != "a"
           or "b-file-dwn" not in child.get("class", []) for child in children):
        raise SiteParseError("unrecognized content in attachment container")
    results, seen = [], set()
    for link in children:
        href = link.get("href")
        if isinstance(href, str) and href.strip().startswith("javascript:"):
            if "pdf" not in link.get("class", []):
                raise SiteParseError("PDF preview link lacks the pdf class")
            url = _pdf_preview_url(href, page_url)
            suffix = "미리보기"
            expected_mode = "open-download"
        else:
            url = _resolve_same_board(href, page_url, "attachment link")
            suffix = "다운로드"
            expected_mode = "download"
        if _single_parameter(url, "mode", "attachment link") != expected_mode:
            raise SiteParseError("unrecognized attachment download mode")
        attached_article = _numeric_parameter(url, "articleNo", "attachment link")
        if article_no and attached_article != article_no:
            raise SiteParseError("attachment belongs to a different article")
        key = _numeric_parameter(url, "attachNo", "attachment link")
        if key in seen:
            raise SiteParseError("duplicate attachment identifier")
        seen.add(key)
        label = link.get_text(" ", strip=True)
        filename = re.sub(r"\s*\(" + suffix + r"\)\s*$", "", label).strip()
        if not filename or filename == label:
            raise SiteParseError("unrecognized attachment filename label")
        results.append({"file_key": key, "original_filename": filename, "url": url})
    return results


def parse_detail(html: str, page_url: str) -> dict:
    """Return the current article's inner HTML, plain text and attachments.

    Only direct children of the verified attachment box are downloads. Links
    in the article body, adjacent articles or elsewhere are never attachments.
    """
    _absolute_page_url(page_url)
    soup = BeautifulSoup(html, "html.parser")
    view = _one(soup, ".view-cont", "article view")
    question = _one(view, ":scope > .view-question", "article question")
    article_no = _article_identity(view, page_url)
    allowed_classes = {"view-tit--box", "view-download--box", "view-txt"}
    for child in question.find_all(recursive=False):
        if not allowed_classes.intersection(child.get("class", [])):
            raise SiteParseError("unrecognized element in article question")
    text_box = _one(question, ":scope > .view-txt", "article text container")
    bodies = text_box.select(":scope > .fr-view")
    children = text_box.find_all(recursive=False)
    if len(bodies) == 1:
        body = bodies[0]
        if any(child is not body for child in children):
            raise SiteParseError("unrecognized element beside article content")
    elif not bodies and children and all(child.name == "p" for child in children):
        body = text_box
    else:
        raise SiteParseError("unrecognized article content structure")
    if body is not text_box and any(
            isinstance(child, NavigableString) and not isinstance(child, Comment) and child.strip()
            for child in text_box.children):
        raise SiteParseError("unrecognized text beside article content")
    boxes = question.select(":scope > .view-download--box")
    if len(boxes) > 1:
        raise SiteParseError("multiple attachment containers")
    # If a new attachment-like section appears elsewhere in the article view,
    # do not silently interpret that markup as a no-attachment article.
    for child in view.find_all(recursive=False):
        if child is question or set(child.get("class", [])) & {"view-list", "btn-wrap"}:
            continue
        for node in [child, *child.find_all(True)]:
            classes = " ".join(node.get("class", []))
            if re.search(r"attach|file|download", classes, re.IGNORECASE):
                raise SiteParseError("unrecognized attachment section outside article question")
    return {
        "content_text": _content_text(body),
        "content_html": body.decode_contents(),
        "attachments": _attachments(boxes[0], page_url, article_no) if boxes else [],
    }
