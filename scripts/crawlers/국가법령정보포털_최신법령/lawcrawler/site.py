"""Public HTML endpoints observed on the official site; no API key needed."""

import hashlib
import logging
import os
import re
import time
import zipfile
from urllib.parse import urljoin, urlparse, parse_qs
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from .rules import CATEGORIES, item_key, parse_date
from .paths import attachment_target, fs_path

BASE = "https://www.law.go.kr/LSW/"
LOG = logging.getLogger("lawcrawler")


class SiteStructureError(RuntimeError):
    pass


def js_args(value):
    return re.findall(r"'([^']*)'", value or "")


def text(element):
    if element is None:
        return ""
    clone = BeautifulSoup(str(element), "html.parser")
    for x in clone.select("script,style,input,img,.lawico01,.rule_box"):
        x.decompose()
    return clone.get_text(" ", strip=True)


def parse_list(html, category_name, page):
    soup = BeautifulSoup(html, "html.parser")
    label = CATEGORIES[category_name][0]
    table = soup.select_one("table")
    if table is None:
        raise SiteStructureError(
            "목록 표가 없습니다. 차단·오류 응답 또는 사이트 구조 변경입니다."
        )
    headers = [x.get_text(" ", strip=True) for x in table.select("thead th")]
    if "법령명" not in headers:
        raise SiteStructureError("법령명 열을 찾지 못했습니다.")
    jo_links = soup.select('a[onclick*="fJoDefView("]')
    items = []
    rows = table.select("tbody tr")
    for idx, row in enumerate(rows):
        cells = row.find_all("td", recursive=False)
        link = row.select_one('a[onclick*="lsViewWideAll("]')
        if not link:
            continue
        if len(cells) != len(headers):
            raise SiteStructureError("목록 열 수가 바뀌었습니다.")
        values = dict(zip(headers, [c.get_text(" ", strip=True) for c in cells]))
        args = js_args(link.get("onclick"))
        if len(args) < 2:
            raise SiteStructureError("법령 식별자 파싱 실패")
        source_id, effective_raw = args[:2]
        if not source_id.isdigit() or not effective_raw.isdigit():
            raise SiteStructureError("법령 식별자 또는 시행일자 형식 오류")
        item = dict(
            category=label,
            source_id=source_id,
            title=link.get_text(" ", strip=True),
            effective_raw=effective_raw,
            effective_date=parse_date(effective_raw),
            announce_date=parse_date(values.get("공포일자", "")),
            expire_date=parse_date(values.get("실효일자", "")),
            law_type=values.get("법령종류", ""),
            announce_no=values.get("공포번호", ""),
            revision_type=values.get("제정·개정구분", ""),
            ministry=values.get("소관부처", ""),
            article_label="",
            article_code="",
            page=page,
            anc_yn="0",
            ef_gubun="Y",
            tab_id=CATEGORIES[category_name][1],
        )
        if "폐지일자" in values:
            item["effective_date"] = parse_date(values["폐지일자"])
        if len(args) >= 6:
            item["anc_yn"] = args[4]
        if category_name in ("temporary_articles", "unconstitutional"):
            # Wide view incorrectly displays revision type under 조문명 on this site.
            # The left list carries real article codes/titles, in the same row order.
            if len(jo_links) != len(rows):
                raise SiteStructureError(
                    "조문 목록과 표 행 수가 다릅니다. 조문 누락을 방지하기 위해 중단합니다."
                )
            ja = js_args(jo_links[idx].get("onclick"))
            if len(ja) < 11 or ja[3] != source_id:
                raise SiteStructureError(
                    "조문 목록 순서·법령 식별자가 일치하지 않습니다."
                )
            item["article_code"] = ja[4] + ":" + ja[5] + ":" + ja[7]
            item["article_label"] = re.sub(
                r"^\d+\.\s*", "", jo_links[idx].get_text(" ", strip=True)
            )
            item["revision_type"] = values.get("조문명", "")
        item["key"] = item_key(item)
        item["source_url"] = (
            BASE
            + "lsInfoP.do?lsiSeq="
            + source_id
            + "&efYd="
            + effective_raw
            + "&efGubun=Y&ancYnChk="
            + item["anc_yn"]
        )
        items.append(item)
    if not items:
        visible = soup.get_text(" ", strip=True)
        if not any(
            x in visible
            for x in (
                "검색된",
                "검색 결과가",
                "검색결과가",
                "검색 결과는",
                "데이터가",
                "0건",
                "0 건",
                "검색결과 없음",
            )
        ):
            raise SiteStructureError("빈 목록을 정상 검색 결과로 확인할 수 없습니다.")
    # For ordinary latest-law lists pageSize is pages; article lists use total rows.
    size = soup.select_one("input#pageSize")
    total_pages = (
        int(size.get("value", "0")) if size and size.get("value", "").isdigit() else 0
    )
    if category_name in ("temporary_articles", "unconstitutional"):
        total_pages = (total_pages + 49) // 50
    return items, total_pages


def parse_detail(html, item):
    soup = BeautifulSoup(html, "html.parser")
    seq = soup.select_one("input#lsiSeq")
    name = soup.select_one("input#lsNm")
    if not seq or seq.get("value") != item["source_id"] or not name:
        raise SiteStructureError(
            "본문 식별자 검증 실패: 오류 페이지를 저장하지 않습니다."
        )
    scroll = soup.select_one("#conScroll")
    if not scroll:
        raise SiteStructureError("본문 conScroll 영역이 없습니다.")
    result = dict(articles=[], addenda=[], annexes=[], attachments=[])
    for n, group in enumerate(scroll.find_all("div", class_="pgroup", recursive=False)):
        checkbox = group.select_one('input[name="joNoList"]')
        if not checkbox:
            continue
        code = checkbox.get("value", str(n)).split(":")
        title_node = group.select_one(".lawcon .bl")
        result["articles"].append(
            dict(
                id=":".join(code[:3]),
                title=text(title_node),
                text=text(group.select_one(".lawcon") or group),
                html=str(group),
            )
        )
    ar = soup.select_one("#arDivArea")
    if ar:
        for n, group in enumerate(ar.find_all("div", class_="pgroup", recursive=False)):
            checkbox = group.select_one('input[name="arInf"]')
            result["addenda"].append(
                dict(
                    id=checkbox.get("value") if checkbox else f"ar-{n}",
                    title=text(group.select_one("p")),
                    text=text(group),
                    html=str(group),
                )
            )
    annex_info = {}
    for cover in soup.select("span.pcf_cover"):
        anchor = cover.select_one('a[id^="J"]')
        if not anchor or not anchor.get("id", "")[1:].isdigit():
            continue
        annex_id = anchor["id"][1:]
        title = text(cover)
        annex_info[annex_id] = (title, cover)
        result["annexes"].append(
            dict(id=annex_id, title=title, text=title, html=str(cover))
        )
    seen = set()
    for link in soup.select('a[href*="flDownload.do"]'):
        href = urljoin(BASE, link["href"])
        if href in seen:
            continue
        seen.add(href)
        container = link.find_parent("li")
        # Popup file layers are nested li's: climb to the enclosing annex li.
        while container and not container.find(
            "span", class_="pcf_cover", recursive=False
        ):
            container = container.find_parent("li")
        if not container:
            raise SiteStructureError("첨부파일의 별표 식별 영역을 찾지 못했습니다.")
        cover = container.find("span", class_="pcf_cover", recursive=False)
        anchor = cover.select_one('a[id^="J"]')
        if not anchor or anchor["id"][1:] not in annex_info:
            raise SiteStructureError("별표 식별자 누락")
        annex_id = anchor["id"][1:]
        title = annex_info[annex_id][0]
        image = link.select_one("img")
        alt = image.get("alt", "") if image else text(link)
        query = parse_qs(urlparse(href).query)
        ext = (
            "hwpx"
            if query.get("flExt", [""])[0].lower() == "hwpx" or "HWPX" in alt.upper()
            else (
                "hwp" if "HWP" in alt.upper() else "pdf" if "PDF" in alt.upper() else ""
            )
        )
        if not ext:
            m = re.search(r"\.(hwpx?|pdf|xlsx?|zip)", text(link), re.I)
            ext = m.group(1).lower() if m else "bin"
        result["attachments"].append(
            dict(
                id=hashlib.sha256(href.encode()).hexdigest()[:24],
                annex_id=annex_id,
                url=href,
                display_name=title + "." + ext,
                local_path="",
                size=0,
                sha256="",
                status="pending",
                error="",
            )
        )
    # Check all active titles as well as deleted annexes represented by pcf_cover.
    for link in soup.select('a[onclick*="bylInfoDiv("]'):
        args = js_args(link.get("onclick"))
        title = link.get_text(" ", strip=True)
        if args and title and not any(x["id"] == args[0] for x in result["annexes"]):
            result["annexes"].append(
                dict(id=args[0], title=title, text=title, html=str(link))
            )
    if not result["articles"]:
        # A completely repealed law can have repeal text rather than numbered articles.
        clone = BeautifulSoup(str(scroll), "html.parser")
        for e in clone.select("#arDivArea,.pconfile,.cont_subtit,script,style"):
            e.decompose()
        fallback = text(clone)
        if not fallback or not any(x in fallback for x in ("폐지", "삭제", "제1조")):
            raise SiteStructureError("조문 본문을 찾지 못했습니다.")
        result["articles"].append(
            dict(id="whole", title=item["title"], text=fallback, html=str(clone))
        )
    expected = set(annex_info) | {
        js_args(x.get("onclick"))[0]
        for x in soup.select('a[onclick*="bylInfoDiv("]')
        if js_args(x.get("onclick"))
    }
    actual = {x["id"] for x in result["annexes"]}
    if expected != actual:
        raise SiteStructureError("별표 목록이 누락되었습니다.")
    result["source_title"] = name.get("value", "")
    result["annexes_without_files"] = sorted(
        actual - {x["annex_id"] for x in result["attachments"]}
    )
    return result


class LawSite:
    def __init__(self, delay=1.0, timeout=30, retries=3):
        if delay < 0.2:
            raise ValueError("요청 간격은 최소 0.2초입니다.")
        self.delay = delay
        self.timeout = timeout
        self.retries = retries
        self.last_request = 0
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": "LawLatestCrawler/1.0 (personal research)",
                "Referer": BASE + "lsSc.do?menuId=1&subMenuId=23",
                "Accept-Language": "ko-KR,ko;q=0.9",
            }
        )
        retry = Retry(
            total=retries,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"],
            respect_retry_after_header=True,
        )
        self.session.mount("https://", HTTPAdapter(max_retries=retry))

    def close(self):
        self.session.close()

    def _get(self, url, **kwargs):
        if urlparse(url).hostname not in ("www.law.go.kr", "law.go.kr"):
            raise ValueError("공식 사이트 외부 주소는 다운로드하지 않습니다.")
        time.sleep(max(0, self.delay - (time.monotonic() - self.last_request)))
        LOG.info("요청 %s", url.split("?")[0])
        self.last_request = time.monotonic()
        r = self.session.get(url, timeout=(10, self.timeout), **kwargs)
        r.raise_for_status()
        if urlparse(r.url).hostname not in ("www.law.go.kr", "law.go.kr"):
            r.close()
            raise ValueError("공식 사이트 외부로 리다이렉트되었습니다.")
        return r

    def list_page(self, name, page, query):
        if not isinstance(query, str) or not query.strip() or query.strip() == "*":
            raise ValueError(
                "엑셀 키워드 검색어가 필요합니다. 전체 목록(*)은 조회하지 않습니다."
            )
        if re.search(r'"\s*[+|]\s*"', query):
            raise ValueError(
                "서버 다중 OR 검색은 사용하지 않습니다. K열을 하나씩 검색한 결과를 합쳐야 합니다."
            )
        label, tab, typ, extra = CATEGORIES[name]
        params = dict(
            menuId=1,
            subMenuId=23,
            tabMenuId=tab,
            lsType=typ,
            q=query,
            section="lawNm",
            pg=page,
            outmax=50,
            p19="1,3",
        )
        params.update(extra)
        r = self._get(BASE + "lsScListR.do", params=params)
        r.encoding = "utf-8"
        return parse_list(r.text, name, page)

    def detail(self, item):
        params = dict(
            lsiSeq=item["source_id"],
            efYd=item["effective_raw"],
            efGubun="Y",
            ancYnChk=item.get("anc_yn", "0"),
            chrClsCd="010202",
        )
        r = self._get(BASE + "lsInfoR.do", params=params)
        r.encoding = "utf-8"
        return parse_detail(r.text, item)

    @staticmethod
    def _actual_format(path, expected_extension):
        if expected_extension not in (".hwp", ".hwpx", ".pdf"):
            return expected_extension
        with open(fs_path(path), "rb") as f:
            head = f.read(32)
        if head.startswith(b"%PDF-"):
            return ".pdf"
        if head.startswith(bytes.fromhex("d0cf11e0a1b11ae1")):
            return ".hwp"
        if head.startswith(b"PK"):
            try:
                with zipfile.ZipFile(fs_path(path)) as archive:
                    names = archive.namelist()
                    if (
                        "mimetype" in names
                        and archive.read("mimetype").strip() == b"application/hwp+zip"
                    ):
                        return ".hwpx"
                    if any(name.startswith("Contents/section") for name in names):
                        return ".hwpx"
            except (OSError, zipfile.BadZipFile):
                pass
        raise SiteStructureError("PDF/HWP/HWPX 파일 시그니처가 유효하지 않습니다.")

    @staticmethod
    def _format_record(
        attachment, path, size, digest, status, expected_extension, actual_extension
    ):
        note = ""
        if actual_extension != expected_extension:
            status = "format_mismatch"
            note = f"사이트 표시 형식 {expected_extension}와 실제 응답 {actual_extension} 불일치. 실제 형식 확장자로 보존함."
        return dict(
            attachment,
            local_path=str(path),
            size=size,
            sha256=digest,
            status=status,
            error=note,
        )

    def download(self, attachment, item, root):
        target = attachment_target(
            root,
            item["category"],
            item,
            attachment["annex_id"],
            attachment["display_name"],
            attachment["url"],
        )
        os.makedirs(fs_path(target.parent), exist_ok=True)
        expected_extension = target.suffix.lower()
        candidates = [target]
        if expected_extension in (".hwp", ".hwpx", ".pdf"):
            candidates += [
                target.with_suffix(ext)
                for ext in (".hwp", ".hwpx", ".pdf")
                if ext != expected_extension
            ]
        for candidate in candidates:
            if (
                not os.path.isfile(fs_path(candidate))
                or os.path.getsize(fs_path(candidate)) == 0
            ):
                continue
            try:
                actual_extension = self._actual_format(candidate, expected_extension)
            except SiteStructureError:
                LOG.warning("기존 파일 형식 검증 실패, 다시 다운로드: %s", candidate)
                continue
            digest = hashlib.sha256()
            with open(fs_path(candidate), "rb") as f:
                for block in iter(lambda: f.read(65536), b""):
                    digest.update(block)
            actual_target = target.with_suffix(actual_extension)
            if candidate != actual_target:
                os.replace(fs_path(candidate), fs_path(actual_target))
            return self._format_record(
                attachment,
                actual_target,
                os.path.getsize(fs_path(actual_target)),
                digest.hexdigest(),
                "existing",
                expected_extension,
                actual_extension,
            )
        partial = str(target) + ".part"
        last_error = None
        for attempt in range(self.retries + 1):
            try:
                digest = hashlib.sha256()
                size = 0
                with self._get(attachment["url"], stream=True) as r:
                    if "text/html" in r.headers.get("Content-Type", "").lower():
                        raise SiteStructureError(
                            "다운로드가 HTML 오류 페이지를 반환했습니다."
                        )
                    expected = r.headers.get("Content-Length")
                    with open(fs_path(partial), "wb") as f:
                        for block in r.iter_content(65536):
                            if not block:
                                continue
                            if not size and block.lstrip().lower().startswith(
                                (b"<!doctype html", b"<html", b"<script")
                            ):
                                raise SiteStructureError(
                                    "다운로드 내용이 오류 HTML입니다."
                                )
                            f.write(block)
                            digest.update(block)
                            size += len(block)
                    if not size:
                        raise SiteStructureError("빈 첨부파일입니다.")
                    if (
                        expected
                        and expected.isdigit()
                        and not r.headers.get("Content-Encoding")
                        and size != int(expected)
                    ):
                        raise SiteStructureError("다운로드 크기가 일치하지 않습니다.")
                actual_extension = self._actual_format(partial, expected_extension)
                actual_target = target.with_suffix(actual_extension)
                os.replace(fs_path(partial), fs_path(actual_target))
                return self._format_record(
                    attachment,
                    actual_target,
                    size,
                    digest.hexdigest(),
                    "downloaded",
                    expected_extension,
                    actual_extension,
                )
            except (OSError, requests.RequestException, SiteStructureError) as exc:
                last_error = exc
                if os.path.isfile(fs_path(partial)):
                    os.remove(fs_path(partial))
                if isinstance(exc, SiteStructureError):
                    break
                if attempt < self.retries:
                    time.sleep(2**attempt)
        return dict(attachment, local_path="", status="failed", error=str(last_error))
