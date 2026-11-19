#!/usr/bin/env python3
"""산업통상부 FTA 포털 / 통상뉴스 / 주요동향 크롤러."""
from __future__ import annotations

import argparse
import configparser
import hashlib
import logging
import os
import re
import sys
import tempfile
import time
from datetime import date
from email.message import Message
from pathlib import Path
from urllib.parse import parse_qs, unquote, urljoin, urlparse

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    from bs4 import BeautifulSoup, Comment, NavigableString, Tag
except ImportError as exc:
    print("필요 패키지가 없습니다. install.bat 또는 python -m pip install -r requirements.txt 를 실행하세요.", file=sys.stderr)
    raise SystemExit(2) from exc

from storage import open_database, save_article, save_asset

BASE_URL = "https://fta.motir.go.kr/ftamain/promo/news/trend/"
LIST_URL = urljoin(BASE_URL, "index.jsp")
DETAIL_URL = urljoin(BASE_URL, "view/index.jsp")
ROOT = Path(__file__).resolve().parent
LOG = logging.getLogger("fta_crawler")
DATE_RE = re.compile(r"\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b")
BLOCK_TAGS = {"address", "article", "blockquote", "br", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "p", "pre", "section", "table", "tr"}


def configure_logging():
    log_dir = ROOT / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    LOG.setLevel(logging.INFO)
    LOG.handlers.clear()
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    file_handler = logging.FileHandler(log_dir / (date.today().isoformat() + ".log"), encoding="utf-8")
    file_handler.setFormatter(formatter)
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    LOG.addHandler(file_handler)
    LOG.addHandler(console)


def parse_date(text):
    match = DATE_RE.search(text)
    if not match:
        raise ValueError("등록일을 찾을 수 없습니다: " + text[:100])
    return date(*(int(n) for n in match.groups()))


def _count(soup):
    node = soup.select_one(".board-count i")
    if node:
        value = node.get_text(strip=True).replace(",", "")
        if value.isdigit():
            return int(value)
    return None


def parse_list(html, page):
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one(".board-list table")
    if table is None:
        raise ValueError("게시글 목록 테이블을 찾을 수 없습니다. 사이트 구조 또는 접근 상태를 확인하세요.")
    rows = []
    for tr in table.select("tbody tr"):
        cells = tr.find_all("td", recursive=False)
        if not cells:
            continue
        link = tr.select_one(".board-link a") or tr.find("a", onclick=re.compile("goView"))
        if not link:
            if "조회된" in tr.get_text() or "등록된" in tr.get_text() or "검색 결과" in tr.get_text():
                continue
            raise ValueError("목록 행에서 게시글 링크를 찾지 못했습니다: " + tr.get_text(" ", strip=True)[:120])
        if len(cells) < 4:
            raise ValueError("목록 행의 컬럼 수가 예상보다 적습니다.")
        onclick = link.get("onclick", "")
        match = re.search(r"goView\s*\(\s*['\"]?(\d+)", onclick)
        query = parse_qs(urlparse(link.get("href", "")).query)
        article_id = match.group(1) if match else (query.get("seqno", [None])[0])
        if not article_id or not re.fullmatch(r"\d+", article_id):
            raise ValueError("게시글 ID(seqno)를 찾을 수 없습니다: " + str(link)[:160])
        title = link.get_text(" ", strip=True).lstrip("\ufeff")
        registered = parse_date(cells[2].get_text(" ", strip=True))
        view_text = cells[3].get_text(strip=True).replace(",", "")
        rows.append({"article_id": article_id, "title": title, "registered_date": registered.isoformat(),
                     "view_count": int(view_text) if view_text.isdigit() else None, "list_page": page})
    return rows, _count(soup)


def plain_text(body):
    pieces = []
    def visit(node):
        if isinstance(node, Comment):
            return
        if isinstance(node, NavigableString):
            pieces.append(str(node))
            return
        if not isinstance(node, Tag) or node.name in {"script", "style", "noscript"}:
            return
        if node.name in BLOCK_TAGS:
            pieces.append("\n")
        for child in node.children:
            visit(child)
        if node.name in {"td", "th"}:
            pieces.append("\t")
        if node.name in BLOCK_TAGS:
            pieces.append("\n")
    visit(body)
    text = "".join(pieces).replace("\xa0", " ").replace("\r", "")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


def http_url(value, base_url):
    url = urljoin(base_url, value or "")
    parts = urlparse(url)
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        return None
    return url


def asset_key(kind, url):
    return hashlib.sha256((kind + "\n" + url).encode("utf-8")).hexdigest()


def discover_assets(soup, detail_url):
    assets = []
    seen = set()
    body = soup.select_one(".board-detail .detail-cont")
    if body:
        for image in body.select("img[src]"):
            src = image.get("src", "").strip()
            if not src or src.lower().startswith("data:"):
                continue
            url = http_url(src, detail_url)
            if url:
                name = unquote(Path(urlparse(url).path).name) or "image"
                key = asset_key("image", url)
                if key not in seen:
                    assets.append({"asset_key": key, "kind": "image", "original_name": name, "source_url": url})
                    seen.add(key)
    # 사이트의 첨부파일 영역 또는 다운로드 경로만 포함한다. 본문에 있는 일반 출처 링크는 제외한다.
    detail = soup.select_one(".board-detail")
    if detail:
        for link in detail.select("a[href], a[onclick]"):
            href = link.get("href", "").strip()
            parent_classes = " ".join(" ".join(p.get("class", [])) for p in [link, *link.parents] if isinstance(p, Tag))
            attachment_area = bool(re.search(r"(?:file|attach|download)", parent_classes, re.I))
            download_url = bool(re.search(r"(?:filedown|file_down|download|attach(?:ment)?down)", href, re.I))
            file_extension = bool(re.search(r"\.(?:pdf|hwp|hwpx|docx?|xlsx?|pptx?|zip|7z|csv|txt)(?:$|[?#])", href, re.I))
            if not (attachment_area or download_url or file_extension or link.has_attr("download")):
                continue
            name = link.get("download") or link.get_text(" ", strip=True) or unquote(Path(urlparse(href).path).name) or "attachment"
            if not href or href.startswith("#") or href.lower().startswith("javascript:"):
                # No unverified download URL is invented. Persist this as failed so it is visible.
                instruction = link.get("onclick", "") or href
                if attachment_area and instruction:
                    key = asset_key("attachment", detail_url + "\n" + instruction + "\n" + name)
                    if key not in seen:
                        assets.append({"asset_key": key, "kind": "attachment", "original_name": name,
                                       "source_url": detail_url, "unsupported_error": "스크립트 방식 첨부 링크: 실제 다운로드 주소 확인 및 대응 필요: " + instruction[:500]})
                        seen.add(key)
                continue
            url = http_url(href, detail_url)
            if not url:
                continue
            key = asset_key("attachment", url)
            if key not in seen:
                assets.append({"asset_key": key, "kind": "attachment", "original_name": name, "source_url": url})
                seen.add(key)
    return assets


def parse_detail(html, detail_url, row):
    soup = BeautifulSoup(html, "html.parser")
    title = soup.select_one(".board-detail .detail-tit")
    body = soup.select_one(".board-detail .detail-cont")
    if title is None or body is None:
        raise ValueError("상세 본문을 찾지 못했습니다. 삭제 게시글, 사이트 오류 또는 구조 변경 여부를 확인하세요.")
    registered = row["registered_date"]
    views = row.get("view_count")
    for li in soup.select(".board-detail .detail-info li"):
        label = li.select_one(".tit")
        value = li.select_one("div:not(.tit) p")
        if label and value:
            if "등록일" in label.get_text(strip=True):
                registered = parse_date(value.get_text(" ", strip=True)).isoformat()
            elif "조회수" in label.get_text(strip=True):
                s = value.get_text(strip=True).replace(",", "")
                if s.isdigit():
                    views = int(s)
    article = dict(row)
    article.update(title=title.get_text(" ", strip=True).lstrip("\ufeff"), registered_date=registered,
                   source_url=detail_url, body_html=body.decode_contents(), body_text=plain_text(body), view_count=views)
    return article, discover_assets(soup, detail_url)


def safe_filename(name):
    name = str(name).replace("\\", "/").split("/")[-1]
    name = re.sub(r'[\x00-\x1f<>:"/\\|?*]', "_", name).strip(" .")
    if not name:
        name = "file"
    stem, ext = os.path.splitext(name)
    if re.fullmatch(r"(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])", stem):
        stem = "_" + stem
    return (stem[:120] or "file") + ext[:20]


def disposition_filename(header):
    if not header:
        return None
    message = Message()
    message["content-disposition"] = header
    value = message.get_filename()
    return value if isinstance(value, str) and value else None


class Crawler:
    def __init__(self, conn, download_dir, delay=0.5, timeout=30):
        self.conn = conn
        self.download_dir = Path(download_dir)
        self.delay = delay
        self.timeout = timeout
        self.session = requests.Session()
        retry = Retry(total=3, connect=3, read=3, status=3, backoff_factor=1,
                      status_forcelist=(429, 500, 502, 503, 504), allowed_methods=frozenset(["GET"]))
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self.session.mount("http://", HTTPAdapter(max_retries=retry))
        self.session.headers.update({"User-Agent": "Mozilla/5.0 (compatible; FTA-news-crawler/1.0)", "Accept-Language": "ko-KR,ko;q=0.9"})
        self.last_request = 0.0

    def get(self, url, **kwargs):
        now = time.monotonic()
        wait = self.delay - (now - self.last_request)
        if wait > 0:
            time.sleep(wait)
        self.last_request = time.monotonic()
        response = self.session.get(url, timeout=self.timeout, **kwargs)
        response.raise_for_status()
        return response

    def download(self, article_id, asset, referer):
        row = self.conn.execute("SELECT saved_path, size_bytes, status FROM fta_trade_news_assets WHERE article_id=? AND asset_key=?", (article_id, asset["asset_key"])).fetchone()
        if row and row[2] == "downloaded" and row[0] and Path(row[0]).is_file():
            existing = Path(row[0])
            size = existing.stat().st_size
            expected_folder = (self.download_dir / str(article_id)).resolve()
            if existing.resolve().parent == expected_folder and (row[1] is None or size == row[1]):
                LOG.info("기존 파일 유지: %s", row[0])
                return
        data = dict(asset, article_id=article_id)
        temp_path = None
        try:
            if asset.get("unsupported_error"):
                raise ValueError(asset["unsupported_error"])
            folder = self.download_dir / str(article_id)
            folder.mkdir(parents=True, exist_ok=True)
            with self.get(asset["source_url"], headers={"Referer": referer}, stream=True, allow_redirects=True) as response:
                content_type = response.headers.get("Content-Type", "").lower()
                if "text/html" in content_type and not asset["original_name"].lower().endswith((".html", ".htm")):
                    raise ValueError("파일 대신 HTML 응답을 받았습니다 (접근 차단 또는 서버 오류 가능).")
                if asset["kind"] == "image" and content_type and not content_type.startswith("image/") and "octet-stream" not in content_type:
                    raise ValueError("이미지가 아닌 응답: " + content_type)
                name = disposition_filename(response.headers.get("Content-Disposition")) or asset["original_name"]
                name = safe_filename(name)
                destination = folder / (asset["asset_key"][:12] + "_" + name)
                with tempfile.NamedTemporaryFile(dir=folder, prefix=".tmp_", delete=False) as tmp:
                    temp_path = Path(tmp.name)
                    for chunk in response.iter_content(1024 * 128):
                        if chunk:
                            tmp.write(chunk)
                os.replace(temp_path, destination)
                temp_path = None
            data.update(original_name=name, saved_path=str(destination.resolve()), size_bytes=destination.stat().st_size,
                        status="downloaded", error_message=None)
            save_asset(self.conn, data)
            LOG.info("파일 저장: %s", destination)
        except Exception as exc:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)
            data.update(saved_path=None, size_bytes=None, status="failed", error_message=str(exc)[:2000])
            save_asset(self.conn, data)
            LOG.error("파일 다운로드 실패: %s | %s", asset["source_url"], exc)
            raise

    def run(self, start_page, end_page):
        errors = 0
        found = 0
        saved = 0
        page = start_page
        while end_page is None or page <= end_page:
            LOG.info("목록 %s페이지 조회", page)
            try:
                with self.get(LIST_URL, params={"searchType": "01", "searchTitle": "", "pageNum": page, "pageSize": 10}) as response:
                    response.encoding = "utf-8"
                    rows, total = parse_list(response.text, page)
            except Exception:
                LOG.exception("목록 페이지 %s 수집 실패", page)
                errors += 1
                break
            if not rows:
                if total is None or (page - 1) * 10 < total:
                    LOG.error("목록이 비정상적으로 비었습니다. 구조 변경/응답 오류를 확인하세요.")
                    errors += 1
                else:
                    LOG.info("마지막 페이지를 지나 수집 종료 (전체 %s건)", total)
                break
            for row in rows:
                found += 1
                detail_url = requests.Request("GET", DETAIL_URL, params={"seqno": row["article_id"], "searchType": "01", "searchTitle": "", "pageNum": page, "pageSize": 10}).prepare().url
                try:
                    with self.get(detail_url) as response:
                        response.encoding = "utf-8"
                        article, assets = parse_detail(response.text, detail_url, row)
                    save_article(self.conn, article)
                    saved += 1
                    LOG.info("기사 저장: %s | %s | %s | 자산 %s건", article["article_id"], article["registered_date"], article["title"], len(assets))
                    for asset in assets:
                        try:
                            self.download(article["article_id"], asset, detail_url)
                        except Exception:
                            errors += 1
                except Exception:
                    LOG.exception("게시글 수집 실패: %s", row["article_id"])
                    errors += 1
            if total is not None and page * 10 >= total:
                LOG.info("마지막 페이지에 도달했습니다. 전체 %s건", total)
                break
            page += 1
        LOG.info("수집 종료: 목록 게시글 %s건, 기사 저장 %s건, 실패 %s건", found, saved, errors)
        return errors


def load_config(path):
    config = configparser.ConfigParser(interpolation=None)
    if not path.is_file():
        raise ValueError("설정 파일을 찾을 수 없습니다: " + str(path))
    config.read(path, encoding="utf-8-sig")
    if not config.has_section("crawler"):
        raise ValueError("config.ini에 [crawler] 섹션이 없습니다.")
    return config["crawler"]


def build_parser():
    p = argparse.ArgumentParser(description="산업통상부 FTA 포털 통상뉴스(주요동향) 수집")
    p.add_argument("pages", nargs="*", help="페이지 1개, 시작과 끝 2개, 1~10 또는 all (미지정 시 입력)")
    p.add_argument("--from", dest="from_page", type=int, help="시작 페이지 (--to와 함께)")
    p.add_argument("--to", dest="to_page", type=int, help="끝 페이지 (--from과 함께)")
    p.add_argument("--db", help="SQLite DB 경로")
    p.add_argument("--download-dir", help="카테고리까지 포함된 다운로드 경로")
    p.add_argument("--init-db", action="store_true", help="DB가 없을 때 명시적으로 생성 (테스트용)")
    p.add_argument("--config", type=Path, default=ROOT / "config.ini", help="설정 파일 경로")
    return p


def parse_page_selection(text):
    text = text.strip()
    if text.lower() == "all":
        return 1, None
    match = re.fullmatch(r"(\d+)(?:(?:\s*[~\-]\s*|\s+)(\d+))?", text)
    if not match:
        raise ValueError("페이지는 1, 2 5, 2~5 또는 all 형식으로 입력하세요.")
    start = int(match.group(1))
    end = int(match.group(2)) if match.group(2) else start
    if start < 1 or end < start:
        raise ValueError("페이지는 1 이상이며 시작 페이지가 끝 페이지보다 클 수 없습니다.")
    return start, end


def parse_options(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        config = load_config(args.config)
        if bool(args.from_page is not None) != bool(args.to_page is not None):
            raise ValueError("--from과 --to는 함께 지정해야 합니다.")
        if args.pages and args.from_page is not None:
            raise ValueError("위치 페이지 인자와 --from/--to는 함께 사용할 수 없습니다.")
        if args.from_page is not None:
            start, end = args.from_page, args.to_page
        elif args.pages:
            start, end = parse_page_selection(" ".join(args.pages))
        else:
            default_start = config.getint("start_page", fallback=1)
            default_end = config.getint("end_page", fallback=1)
            try:
                text = input(f"수집 페이지 (예: 1, 2 5, 2~5, all; Enter: {default_start}~{default_end}): ").strip()
            except EOFError:
                text = ""
            start, end = parse_page_selection(text) if text else (default_start, default_end)
        if start < 1 or (end is not None and end < start):
            raise ValueError("페이지는 1 이상이며 시작 페이지가 끝 페이지보다 클 수 없습니다.")
        delay = config.getfloat("delay_seconds", fallback=0.5)
        timeout = config.getfloat("timeout_seconds", fallback=30)
        if delay < 0 or timeout <= 0:
            raise ValueError("delay_seconds는 0 이상, timeout_seconds는 0보다 커야 합니다.")
        db = Path(args.db or config.get("db_path", r"D:\SQLiteDB\smart_law_ai.db"))
        download = Path(args.download_dir or config.get("download_dir", r"C:\SQLiteDB\downloads\산업통상부\통상뉴스"))
        return args, start, end, delay, timeout, db, download
    except (ValueError, configparser.Error) as exc:
        parser.error(str(exc))


def main(argv=None):
    args, start, end, delay, timeout, db, download = parse_options(argv)
    try:
        configure_logging()
        if not db.exists():
            if not args.init_db:
                raise FileNotFoundError(f"DB가 없습니다: {db}. 기존 DB 경로를 확인하세요 (신규 테스트 DB는 --init-db).")
            db.parent.mkdir(parents=True, exist_ok=True)
            db.touch(exist_ok=False)
        if not db.is_file() and db.exists():
            raise ValueError("DB 경로가 파일이 아닙니다: " + str(db))
        LOG.info("DB: %s | 다운로드: %s | 페이지: %s~%s | 등록일: 전체", db, download, start, end or "끝")
        conn = open_database(db)
        try:
            crawler = Crawler(conn, download, delay, timeout)
            try:
                errors = crawler.run(start, end)
            finally:
                crawler.session.close()
        finally:
            conn.close()
        return 1 if errors else 0
    except KeyboardInterrupt:
        LOG.warning("사용자에 의해 중단되었습니다. 이미 저장된 항목은 유지됩니다.")
        return 130
    except Exception:
        LOG.exception("실행 실패")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
