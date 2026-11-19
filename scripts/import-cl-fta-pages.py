# -*- coding: utf-8 -*-
"""씨엘HS FTA협정관세 화면 원문(협정관세율 <코드>.asp / 원산지결정기준 <코드>1.asp) → cl_fta_page

입력: D:/Crawling/CIEL_FTA_crawl/fetch_fta_pages.py 로 저장한 HTML 폴더
출력: SQLite cl_fta_page (fta_cd, page_kind, html, text, source_url, crawl_dt)
      page_kind = 'duty' (협정관세율) | 'origin' (원산지결정기준)

본문은 허용 태그만 남기고, CL 내부 링크는 포털 경로로 바꾸거나 제거한다.
"""
from __future__ import annotations

import html as htmllib
import os
import re
import sqlite3
import sys
from datetime import datetime
from html.parser import HTMLParser
from urllib.parse import parse_qs, quote, unquote, urlparse

DB = r"D:/SQLiteDB/smart_law_ai.db"
BASE = "https://www.clhs.co.kr"
YEAR = "2026"

CODES = [
    "FCL", "FSG", "FEF", "FAS", "FIN", "FEU", "FGB", "FPE", "FUS", "FTR", "FAU", "FCA",
    "FCO", "FCN", "FVN", "FNZ", "FCE", "FRC", "FIL", "FKH", "FID", "FPH", "FAE",
]

LAW_SUFFIX = re.compile(r"(법률|법|시행령|시행규칙|고시|요령|지침|규정|훈령|예규)$")


def nospace(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


def load_law_names(c: sqlite3.Connection) -> dict[str, str]:
    names: dict[str, str] = {}
    for sql in (
        "SELECT law_name_kr FROM laws",
        "SELECT law_name FROM admin_rule",
    ):
        try:
            for (n,) in c.execute(sql):
                if n:
                    names.setdefault(nospace(n), n.strip())
        except sqlite3.Error:
            pass
    return names


class Cleaner(HTMLParser):
    """CL 본문 셀 → 정리된 HTML"""

    KEEP = {"p", "b", "strong", "br", "table", "tr", "td", "th", "a", "ul", "ol", "li", "sup", "sub"}

    def __init__(self, code: str, law_names: dict[str, str]):
        super().__init__(convert_charrefs=True)
        self.code = code
        self.law_names = law_names
        self.out: list[str] = []
        self.stack: list[str] = []
        self.a_open: list[bool] = []
        self.cell_head: list[bool] = []
        self.borderless: list[bool] = []
        self.p_cls: list[str] = []

    # ---------------------------------------------------------------- links
    def rewrite(self, href: str) -> tuple[str, bool]:
        """(새 href, 외부여부). 빈 href = 링크 제거"""
        href = htmllib.unescape(href.strip())
        u = urlparse(href)
        path = u.path.lower()
        q = {k.lower(): v[0] for k, v in parse_qs(u.query).items()}
        host = (u.netloc or "").lower()
        if host and "clhs.co.kr" not in host:
            return href, True
        if "/uploads/" in path:
            return (href if host else BASE + u.path), True
        hs = q.get("strhs", "")
        m = re.search(r"/duty/(\d{10})$", u.path)
        if m:
            hs = m.group(1)
        if path.endswith(("answer.asp", "search.asp")) or (hs and re.fullmatch(r"F[A-Z]{2}\.asp", os.path.basename(u.path) or "")) or m:
            d = re.sub(r"\D", "", hs)
            if len(d) == 10:
                return f"/tariff/item?hs={d}", False
            if len(d) == 4:
                return f"/tariff/heading?hs={d}", False
            if len(d) == 2:
                return f"/tariff/chapter?hs={d}", False
            return "", False
        if path.endswith("tariffbase.asp") and "hsrules" in u.query.lower():
            return "/tariff/rules", False
        if path.endswith(("law.asp", "lawlink.asp")):
            raw = unquote(q.get("strlaw", ""))
            key = nospace(raw)
            if not key:
                return "", False
            if "협정" in key and not LAW_SUFFIX.search(key):
                return f"/rates/fta/treaty?code={self.code}", False
            name = self.law_names.get(key)
            if name:
                return f"/laws/general/customs/read?name={quote(name)}", False
            return "", False
        return "", False

    # ---------------------------------------------------------------- parse
    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "a":
            href, ext = self.rewrite(a.get("href", "")) if a.get("href") else ("", False)
            if href:
                extra = ' target="_blank" rel="noopener noreferrer"' if ext else ""
                self.out.append(f'<a href="{htmllib.escape(href, quote=True)}"{extra}>')
            self.a_open.append(bool(href))
            return
        if tag == "div":
            tag = "p"
        if tag not in self.KEEP:
            return
        if tag == "br":
            self.out.append("<br>")
            return
        cls: list[str] = []
        style = a.get("style", "").lower()
        if tag == "p":
            m = re.search(r"margin-left:\s*(\d+)", style)
            if m:
                lv = min(4, max(1, round(int(m.group(1)) / 15)))
                cls.append(f"i{lv}")
            if re.search(r"margin-top:\s*(1\d|[2-9]\d)px", style):
                cls.append("gap")
            if re.search(r"text-indent:\s*-", style):
                cls.append("hang")
            align = a.get("align", "").lower() or (re.search(r"text-align:\s*(center|right)", style) or [None, ""])[1]
            if align == "center":
                cls.append("c")
            elif align == "right":
                cls.append("r")
        css: list[str] = []
        w = a.get("width", "").strip()
        if tag == "table":
            borderless = a.get("border", "") == "0"
            self.borderless.append(borderless)
            if borderless:
                cls.append("nb")
            # 브라우저는 <p> 안의 <table>을 허용하지 않으므로 문단을 닫고 들여쓰기만 표로 옮긴다
            if self.stack and self.stack[-1] == "p":
                cls += [c for c in self.p_cls if re.fullmatch(r"i\d", c)]
                self.stack.pop()
                self.out.append("</p>")
            if re.fullmatch(r"\d{2,4}", w):
                css.append(f"width:{w}px")
            elif re.fullmatch(r"\d{1,3}%", w):
                css.append(f"width:{w}")
        attr = ""
        if tag in ("td", "th"):
            if self.borderless and self.borderless[-1]:
                if re.search(r"border:\s*1px solid", style):
                    pass
                elif re.search(r"border-bottom:\s*1px solid", style):
                    cls += ["nb", "frac"]
                elif re.search(r"border-top:\s*1px solid", style):
                    cls += ["nb", "frac-t"]
                else:
                    cls.append("nb")
            if re.fullmatch(r"\d{1,2}%", w):
                css.append(f"width:{w}")
            head = a.get("bgcolor", "").upper() in ("#CCCCCC", "#C0C0C0", "#E0E0E0", "#D9D9D9")
            if head:
                tag = "th"
            if a.get("align", "").lower() == "center" or "center" in style:
                cls.append("c")
            elif a.get("align", "").lower() == "right":
                cls.append("r")
            for k in ("rowspan", "colspan"):
                if a.get(k, "").isdigit() and a[k] != "1":
                    attr += f' {k}="{a[k]}"'
            self.cell_head.append(tag == "th")
        if cls:
            attr += f' class="{" ".join(cls)}"'
        if css:
            attr += f' style="{";".join(css)}"'
        if tag == "p":
            self.p_cls = cls
        self.out.append(f"<{tag}{attr}>")
        self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag == "a":
            if self.a_open and self.a_open.pop():
                self.out.append("</a>")
            return
        if tag == "div":
            tag = "p"
        if tag in ("td", "th"):
            if self.cell_head:
                tag = "th" if self.cell_head.pop() else "td"
        if tag not in self.KEEP or tag == "br":
            return
        if tag == "table" and self.borderless:
            self.borderless.pop()
        if tag in self.stack:
            while self.stack:
                t = self.stack.pop()
                self.out.append(f"</{t}>")
                if t == tag:
                    break

    def handle_data(self, data):
        t = re.sub(r"\s+", " ", data)
        if t:
            self.out.append(htmllib.escape(t, quote=False))

    def result(self) -> str:
        while self.stack:
            self.out.append(f"</{self.stack.pop()}>")
        s = "".join(self.out)
        s = re.sub(r"<p( class=\"[^\"]*\")?>\s*</p>", "", s)
        s = re.sub(r"<b>\s*</b>", "", s)
        s = re.sub(r"(<br>\s*){3,}", "<br><br>", s)
        s = re.sub(r" +", " ", s)
        return s.strip()


def content_cell(page: str) -> str:
    """양식(form) 아래 본문 셀(bgcolor #F4F4F4)의 내부 HTML"""
    m = re.search(r'<td[^>]*bgcolor="#F4F4F4"[^>]*>', page, re.I)
    if not m:
        return ""
    start = m.end()
    depth = 1
    for t in re.finditer(r"<(/?)td\b[^>]*>", page[start:], re.I):
        depth += -1 if t.group(1) else 1
        if depth == 0:
            return page[start:start + t.start()]
    return page[start:]


def plain(html: str) -> str:
    s = re.sub(r"<br>|</p>|</tr>|</li>", "\n", html)
    s = re.sub(r"</t[dh]>", "\t", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = htmllib.unescape(s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    return re.sub(r"\n{3,}", "\n\n", s).strip()


def main() -> int:
    src = sys.argv[1] if len(sys.argv) > 1 else r"D:/CursorProject/smart-law-ai/_tmp_cl_fta/pages"
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c = sqlite3.connect(DB, timeout=120)
    c.execute("PRAGMA busy_timeout=120000")
    c.execute(
        """CREATE TABLE IF NOT EXISTS cl_fta_page (
               fta_cd     TEXT NOT NULL,
               page_kind  TEXT NOT NULL,
               html       TEXT,
               text       TEXT,
               source_url TEXT,
               base_yr    TEXT,
               crawl_dt   TEXT,
               PRIMARY KEY (fta_cd, page_kind)
           )"""
    )
    law_names = load_law_names(c)
    n = 0
    for code in CODES:
        for kind, page in (("duty", code), ("origin", code + "1")):
            p = os.path.join(src, f"{page}.html")
            if not os.path.exists(p):
                print(f"missing {page}")
                continue
            raw = open(p, encoding="utf-8").read()
            raw = re.sub(r"<script.*?</script>|<style.*?</style>|<!--.*?-->", "", raw, flags=re.S | re.I)
            cell = content_cell(raw)
            cl = Cleaner(code, law_names)
            cl.feed(cell)
            body = cl.result()
            text = plain(body)
            if len(text) < 50:
                print(f"short {page}: {len(text)}")
                continue
            c.execute(
                """INSERT OR REPLACE INTO cl_fta_page
                   (fta_cd, page_kind, html, text, source_url, base_yr, crawl_dt)
                   VALUES (?,?,?,?,?,?,?)""",
                (code, kind, body, text, f"{BASE}/Y{YEAR}/duty/{page}.asp", YEAR, now),
            )
            n += 1
            print(f"{page}\thtml={len(body):,}\ttext={len(text):,}")
    c.commit()
    c.close()
    print(f"OK {n} pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
