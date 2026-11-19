from __future__ import annotations

import html
import json
import os
import re
import tempfile
import time
from datetime import date
from pathlib import Path
from typing import Any, Dict, Iterable, Optional
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

import requests
from bs4 import BeautifulSoup


class SiteError(Exception):
    """KOTRA endpoint, response, or schema failure."""


class SiteClient:
    """Client for the KOTRA menu 1580.

    The list is populated by an AJAX endpoint.  No page JavaScript is executed;
    unknown response shapes are rejected rather than guessed.
    """

    BASE = "https://dream.kotra.or.kr"
    MENU_URL = BASE + "/kotranews/cms/com/index.do"
    LIST_ENDPOINT = BASE + "/ajaxf/frNewsHotClip/getKotraBoardHotClipList.do"
    DETAIL_PATH = "/kotranews/cms/news/actionKotraBoardDetail.do"
    MENU_ID = "1580"
    SITE_NO = "3"
    CONTENTS_NO = "1"
    HOT_CLIP_GBN = "13"
    MAX_REDIRECTS = 3
    PAGE_SIZE = 10

    def __init__(self, timeout: float = 30, delay: float = 0.5, retries: int = 3) -> None:
        self.timeout = float(timeout)
        self.delay = max(0.0, float(delay))
        self.retries = max(0, int(retries))
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (compatible; KOTRA-client/1.0)",
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
        })
        self._last_request = 0.0

    @classmethod
    def _allowed_url(cls, url: str) -> bool:
        parsed = urlparse(url)
        try:
            port = parsed.port
        except ValueError:
            return False
        return (
            parsed.scheme == "https"
            and parsed.hostname
            and parsed.hostname.lower() == urlparse(cls.BASE).hostname.lower()
            and port in (None, 443)
            and not parsed.username and not parsed.password
        )

    def _request(self, method: str, url: str, **kwargs: Any) -> requests.Response:
        """Request without automatic redirects; validate every Location hop."""
        if not self._allowed_url(url):
            raise SiteError(f"허용되지 않은 URL 호스트: {url}")
        kwargs["allow_redirects"] = False
        current = url
        last: Optional[BaseException] = None
        for redirect_no in range(self.MAX_REDIRECTS + 1):
            checker = getattr(self, "can_fetch", None)
            if checker is not None and not checker(current):
                raise SiteError(f"robots.txt가 요청 경로를 차단했습니다: {current}")
            for attempt in range(self.retries + 1):
                wait = self.delay - (time.monotonic() - self._last_request)
                if wait > 0:
                    time.sleep(wait)
                try:
                    response = self.session.request(method, current, timeout=self.timeout, **kwargs)
                    self._last_request = time.monotonic()
                    if (response.status_code == 429 or 500 <= response.status_code < 600) and attempt < self.retries:
                        self._close_response(response)
                        time.sleep(min(2 ** attempt, 8))
                        continue
                    break
                except (requests.RequestException, OSError) as exc:
                    last = exc
                    if attempt >= self.retries:
                        raise SiteError(f"KOTRA 요청 실패 ({method} {current}): {exc}") from exc
                    time.sleep(min(2 ** attempt, 8))
            status = response.status_code
            if 300 <= status < 400:
                location = response.headers.get("Location")
                self._close_response(response)
                if not location:
                    raise SiteError(f"Location 없는 리다이렉트 응답: HTTP {status}")
                next_url = urljoin(current, location)
                if not self._allowed_url(next_url):
                    raise SiteError(f"다른 호스트로의 리다이렉트 차단: {next_url}")
                if redirect_no >= self.MAX_REDIRECTS:
                    raise SiteError("리다이렉트 횟수 제한 초과")
                if status == 303 or (status in (301, 302) and method.upper() == "POST"):
                    method = "GET"
                    kwargs.pop("data", None)
                    kwargs.pop("json", None)
                current = next_url
                continue
            try:
                response.raise_for_status()
            except requests.RequestException as exc:
                self._close_response(response)
                raise SiteError(f"KOTRA HTTP 오류 ({method} {current}): HTTP {status}") from exc
            return response
        raise SiteError(f"KOTRA 요청 실패 ({method} {url}): {last}") from last

    @staticmethod
    def _close_response(response: Optional[requests.Response]) -> None:
        if response is not None:
            try:
                response.close()
            except (AttributeError, OSError):
                pass

    @staticmethod
    def _clean(value: Any) -> str:
        return re.sub(r"\s+", " ", str(value or "")).strip()

    @staticmethod
    def _date(value: Any) -> str:
        text = SiteClient._clean(value)
        m = re.search(r"(20\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})", text)
        if not m:
            m = re.search(r"(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일", text)
        if not m:
            return ""
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
        except ValueError:
            return ""

    @staticmethod
    def _field(row: Dict[str, Any], *names: str) -> Any:
        upper = {str(k).upper(): v for k, v in row.items()}
        for name in names:
            if name.upper() in upper:
                return upper[name.upper()]
        return ""

    def _params(self, page_no: int, start_date: Optional[date], end_date: Optional[date]) -> Dict[str, str]:
        if int(page_no) < 1:
            raise ValueError("page_no must be >= 1")
        return {
            "pageNo": str(int(page_no)), "pagePerCnt": str(self.PAGE_SIZE),
            "recordCountPerPage": str(self.PAGE_SIZE), "SITE_NO": self.SITE_NO,
            "MENU_ID": self.MENU_ID, "CONTENTS_NO": self.CONTENTS_NO,
            "hotClipGbn": self.HOT_CLIP_GBN, "viewType": "", "pNttSn": "",
            "pStartDt": start_date.strftime("%Y/%m/%d") if start_date else "",
            "pEndDt": end_date.strftime("%Y/%m/%d") if end_date else "",
            "sSearchVal": "", "pRegnCd": "", "pNatCd": "", "pKbcCd": "", "pIndustCd": "",
        }

    @staticmethod
    def _list_and_total(data: Any) -> tuple[list[Any], Optional[int]]:
        if isinstance(data, list):
            return data, None
        if not isinstance(data, dict):
            raise SiteError("목록 JSON 최상위 구조가 객체/배열이 아닙니다")
        list_keys = {"data", "list", "rows", "result", "items", "content", "records"}
        total_keys = {"rowcount", "totalcount", "total", "count", "recordcount", "totalelements", "totalrecordcount"}
        candidates = [(str(k).lower(), v) for k, v in data.items()]
        rows = next((v for k, v in candidates if k in list_keys and isinstance(v, list)), None)
        if rows is None:
            nested = next((v for k, v in candidates if k in {"data", "result", "response", "body"} and isinstance(v, dict)), None)
            if nested is not None:
                return SiteClient._list_and_total(nested)
            raise SiteError("목록 리스트 키를 찾을 수 없습니다")
        if not isinstance(rows, list):
            raise SiteError("목록 리스트 키의 값이 배열이 아닙니다")
        total: Optional[int] = None
        for key, value in candidates:
            if key in total_keys:
                try:
                    if isinstance(value, bool) or isinstance(value, (dict, list)):
                        raise ValueError
                    total = int(str(value).strip())
                except (TypeError, ValueError) as exc:
                    raise SiteError("결과 총건수가 숫자가 아닙니다") from exc
                break
        return rows, total

    def get_list(self, page_no: int, start_date: Optional[date] = None,
                 end_date: Optional[date] = None) -> Dict[str, Any]:
        if start_date and end_date and start_date > end_date:
            raise ValueError("start_date must not be after end_date")
        params = self._params(page_no, start_date, end_date)
        response = self._request("POST", self.LIST_ENDPOINT, data=params,
                                 headers={"X-Requested-With": "XMLHttpRequest", "Accept": "application/json, text/javascript, */*"})
        try:
            data = response.json()
        except (ValueError, json.JSONDecodeError) as exc:
            self._close_response(response)
            raise SiteError("목록 응답이 JSON이 아닙니다") from exc
        self._close_response(response)
        rows, total = self._list_and_total(data)
        if total is not None and (total < 0 or (not rows and (int(page_no) - 1) * self.PAGE_SIZE < total)):
            raise SiteError("목록 건수와 응답 행 수가 일치하지 않습니다")
        items = []
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                raise SiteError(f"목록 {index}번째 행이 객체가 아닙니다")
            aid = self._clean(self._field(row, "NTT_SN", "pNttSn", "ARTICLE_ID", "id"))
            title = self._clean(html.unescape(str(self._field(row, "NTT_SJ", "TITLE", "SUBJECT", "title") or "")))
            if not aid or not title:
                raise SiteError(f"목록 {index}번째 행에 필수 id/title이 없습니다")
            detail_params = dict(params, pNttSn=aid, sSearchVal="")
            items.append({"article_id": aid, "title": title,
                          "published_date": self._date(self._field(row, "OTHBC_DT_NM", "OTHBC_DT", "PUBLISHED_DATE", "REG_DT")),
                          "url": self.BASE + self.DETAIL_PATH + "?" + urlencode(detail_params),
                          "raw_list": dict(row)})
        has_next = bool(total is not None and int(page_no) * self.PAGE_SIZE < total) if total is not None else len(rows) >= self.PAGE_SIZE
        return {"items": items, "has_next": has_next}

    @staticmethod
    def _body_text(node: Any) -> str:
        lines = []
        for line in node.get_text("\n").splitlines():
            line = re.sub(r"[ \t\f\r\v]+", " ", line).strip()
            if line:
                lines.append(line)
        return "\n".join(lines)

    def get_article(self, item: Dict[str, Any]) -> Dict[str, Any]:
        aid = self._clean(item.get("article_id"))
        if not aid:
            raise ValueError("item.article_id is required")
        url = str(item.get("url") or "")
        if not url:
            url = self.BASE + self.DETAIL_PATH + "?" + urlencode({"SITE_NO": self.SITE_NO, "MENU_ID": self.MENU_ID, "CONTENTS_NO": self.CONTENTS_NO, "pNttSn": aid, "hotClipGbn": self.HOT_CLIP_GBN})
        response = self._request("GET", url)
        soup = BeautifulSoup(response.content, "html.parser")
        self._close_response(response)
        for node in soup.select("script, style, noscript, nav, header, footer, .gnb, .lnb, .navigation, .ad, .banner"):
            node.decompose()
        title = self._clean(item.get("title"))
        if not title:
            for selector in (".view_tit", ".subject", ".tit", "[class*='view'][class*='title']"):
                node = soup.select_one(selector)
                if node and self._clean(node.get_text(" ", strip=True)):
                    title = self._clean(node.get_text(" ", strip=True)); break
        body = None
        for selector in ("#pdfArea", ".view_cont", ".board_view", ".news_view", ".article_view"):
            candidate = soup.select_one(selector)
            if candidate and self._body_text(candidate):
                body = candidate; break
        if body is None:
            raise SiteError(f"확인된 상세 본문 컨테이너가 없습니다: article_id={aid}")
        body_text = self._body_text(body)
        if not body_text:
            raise SiteError(f"상세 본문 텍스트가 없습니다: article_id={aid}")
        attachments = []
        areas = soup.select(".file_list, .attach_file, .board_file, .view_file, .attachment, [class*='attach']")
        seen = set()
        for area in areas:
            for a in area.select("a[href]"):
                href = urljoin(response.url if hasattr(response, "url") else url, a.get("href", ""))
                parsed = urlparse(href); qs = parse_qs(parsed.query)
                if not self._allowed_url(href): continue
                fid = next((qs[k][0] for k in ("atFileSn", "fileSn", "fileId", "FILE_ID", "atchFileId") if qs.get(k)), "")
                label = self._clean(a.get_text(" ", strip=True))
                path = parsed.path.lower()
                if not fid and not ("download" in path or "download" in parsed.query.lower() or "다운로드" in label): continue
                key = (href, label)
                if key in seen: continue
                seen.add(key)
                attachments.append({"file_id": fid or href, "filename": label or fid or Path(parsed.path).name or "attachment", "url": href})
        raw = dict(item.get("raw_list") or {})
        keyword_links = [
            self._clean(a.get_text(" ", strip=True)).lstrip("#")
            for a in soup.select("a[onclick*='fn_goKeywordSearch']")
        ]
        return {"article_id": aid, "title": title, "published_date": self._date(item.get("published_date")),
                "url": url, "body_html": str(body), "body_text": body_text,
                "author": self._clean(self._field(raw, "REGTR_NAME")),
                "office": self._clean(self._field(raw, "KBC")),
                "keywords": ", ".join(k for k in keyword_links if k),
                "attachments": attachments,
                "raw_list": dict(item.get("raw_list") or {})}

    @staticmethod
    def _text_first(soup: BeautifulSoup, selectors: Iterable[str]) -> str:
        for selector in selectors:
            node = soup.select_one(selector)
            if node: return node.get_text(" ", strip=True)
        return ""

    def download_attachment(self, attachment: Dict[str, Any], dest_path: Path) -> None:
        url = str(attachment.get("url") or "")
        if not url or not self._allowed_url(url):
            raise SiteError("첨부파일은 KOTRA 동일 호스트 URL만 허용합니다")
        dest = Path(dest_path)
        if dest.name in ("", ".", "..") or dest.name != Path(dest.name).name:
            raise ValueError("안전하지 않은 첨부파일 경로")
        dest.parent.mkdir(parents=True, exist_ok=True)
        temp_name: Optional[str] = None
        response = None
        try:
            response = self._request("GET", url, stream=True)
            content_type = (response.headers.get("Content-Type") or "").lower()
            if "text/html" in content_type or "application/xhtml" in content_type:
                charset = response.encoding or "미상"
                raise SiteError(f"첨부 응답이 HTML/login 페이지입니다(인코딩: {charset})")
            with tempfile.NamedTemporaryFile(dir=str(dest.parent), prefix=f".{dest.name}.", suffix=".tmp", delete=False) as fh:
                temp_name = fh.name
                first = True
                for chunk in response.iter_content(chunk_size=65536):
                    if not chunk: continue
                    if first:
                        first = False
                        sample = chunk.lstrip().lower()
                        if sample.startswith(b"<!doctype html") or sample.startswith(b"<html") or b"<form" in sample[:4096] and b"login" in sample[:4096]:
                            raise SiteError("첨부 응답이 HTML/login 페이지입니다(내용 인코딩을 확인하십시오)")
                    fh.write(chunk)
                fh.flush(); os.fsync(fh.fileno())
            os.replace(temp_name, dest)
            temp_name = None
        except (OSError, requests.RequestException) as exc:
            raise SiteError(f"첨부파일 저장 실패: {dest}") from exc
        finally:
            self._close_response(response)
            if temp_name:
                try: os.unlink(temp_name)
                except FileNotFoundError: pass
