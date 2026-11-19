# -*- coding: utf-8 -*-
"""config.ini loader."""
from __future__ import annotations

import configparser
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_INI = os.path.join(BASE_DIR, "config.ini")

# ---------------------------------------------------------------------------
# Tax category master (based on the site menu /mUser/dem/demList.do?semok=XX)
#   National : Corporate 20 / Income 12 / VAT 50 / CapitalGains 11 /
#              Inheritance-Gift 40 / Customs 90 / Others 99
#   Local    : Local 95 (all) = Acquisition 96 + Property 97 + Others 98
# ---------------------------------------------------------------------------
SEMOK_MASTER = [
    ("20", "Corporate", "National", 1),
    ("12", "Income", "National", 2),
    ("50", "VAT", "National", 3),
    ("11", "Capital Gains", "National", 4),
    ("40", "Inheritance/Gift", "National", 5),
    ("90", "Customs", "National", 6),
    ("99", "Others", "National", 7),
    ("95", "Local (all)", "Local", 8),
    ("96", "Local-Acquisition", "Local", 9),
    ("97", "Local-Property", "Local", 10),
    ("98", "Local-Others", "Local", 11),
]

# ---------------------------------------------------------------------------
# Collection scope : Customs only (semok 90)
#   NOTE 95 (Local all) is the sum of 96+97+98, so combining them duplicates rows.
#   NOTE To collect every category, set semok_list in config.ini to
#        "20,12,50,11,40,90,99,96,97,98".
# ---------------------------------------------------------------------------
DEFAULT_SEMOK = "90"

SEMOK_CODE_CUSTOMS = "90"
SEMOK_NAME_CUSTOMS = "Customs"


class Config:
    """Typed accessor for config.ini values."""

    def __init__(self, path: str = None):
        self.path = path or DEFAULT_INI
        cp = configparser.ConfigParser(interpolation=None)
        if not os.path.isfile(self.path):
            raise FileNotFoundError("config.ini not found: %s" % self.path)
        cp.read(self.path, encoding="utf-8")
        self._cp = cp

    # -- helpers -----------------------------------------------------------
    def _get(self, sec, key, default=""):
        try:
            return self._cp.get(sec, key)
        except Exception:
            return default

    def _get_int(self, sec, key, default=0):
        try:
            return int(str(self._get(sec, key, default)).strip())
        except Exception:
            return default

    def _get_float(self, sec, key, default=0.0):
        try:
            return float(str(self._get(sec, key, default)).strip())
        except Exception:
            return default

    def _get_bool(self, sec, key, default=False):
        v = str(self._get(sec, key, default)).strip().lower()
        return v in ("1", "y", "yes", "true", "on")

    # -- [db] --------------------------------------------------------------
    @property
    def db_path(self) -> str:
        """Target DB path (env SMART_LAW_DB_PATH > config.ini)."""
        env = os.environ.get("SMART_LAW_DB_PATH", "").strip()
        if env:
            return env
        return self._get("db", "path", r"C:\SQLiteDB\smart_law_ai.db").strip()

    @property
    def table_prefix(self) -> str:
        return self._get("db", "prefix", "tb_tt_").strip()

    @property
    def backup_before_run(self) -> bool:
        return self._get_bool("db", "backup_before_run", True)

    @property
    def backup_dir(self) -> str:
        return self._get("db", "backup_dir", r"C:\SQLiteDB\backup").strip()

    @property
    def db_timeout(self) -> int:
        return self._get_int("db", "timeout", 30)

    # -- [network] ---------------------------------------------------------
    @property
    def base_url(self) -> str:
        """Primary host. The certificate CN is www.tt.go.kr, so that is the default."""
        return self._get("network", "base_url", "https://www.tt.go.kr").strip().rstrip("/")

    @property
    def base_url_alt(self) -> str:
        """Fallback host used when base_url cannot be reached (bare domain)."""
        return self._get("network", "base_url_alt", "https://tt.go.kr").strip().rstrip("/")

    @property
    def base_urls(self) -> list:
        """Candidate hosts in priority order (primary, then alternative)."""
        out = []
        for u in (self.base_url, self.base_url_alt):
            if u and u not in out:
                out.append(u)
        return out

    def override_base_url(self, url: str) -> None:
        """Apply a command line --base-url override."""
        if url:
            self._cp.set("network", "base_url", url.strip().rstrip("/"))

    @property
    def user_agent(self) -> str:
        return self._get(
            "network",
            "user_agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        ).strip()

    @property
    def delay_sec(self) -> float:
        return self._get_float("network", "delay_sec", 1.0)

    @property
    def timeout_sec(self) -> int:
        return self._get_int("network", "timeout_sec", 30)

    @property
    def retry_cnt(self) -> int:
        return self._get_int("network", "retry_cnt", 3)

    @property
    def retry_backoff_sec(self) -> float:
        return self._get_float("network", "retry_backoff_sec", 3.0)

    # -- [crawl] -----------------------------------------------------------
    @property
    def semok_list(self) -> list:
        raw = self._get("crawl", "semok_list", DEFAULT_SEMOK)
        if str(raw).strip().lower() == "all":
            raw = DEFAULT_SEMOK
        return [x.strip() for x in str(raw).split(",") if x.strip()]

    @property
    def page_size(self) -> int:
        return self._get_int("crawl", "page_size", 10)

    @property
    def start_page(self) -> int:
        return self._get_int("crawl", "start_page", 1)

    @property
    def max_pages(self) -> int:
        return self._get_int("crawl", "max_pages", 0)  # 0 = all pages

    @property
    def only_new(self) -> bool:
        return self._get_bool("crawl", "only_new", True)

    @property
    def download_attach(self) -> bool:
        return self._get_bool("crawl", "download_attach", False)

    @property
    def attach_dir(self) -> str:
        return self._get("crawl", "attach_dir", r".\downloads").strip()

    @property
    def save_body_html(self) -> bool:
        return self._get_bool("crawl", "save_body_html", True)

    # -- [log] -------------------------------------------------------------
    @property
    def log_dir(self) -> str:
        d = self._get("log", "dir", r".\logs").strip()
        if not os.path.isabs(d):
            d = os.path.join(BASE_DIR, d.lstrip(".\\/"))
        return d

    @property
    def log_level(self) -> str:
        return self._get("log", "level", "INFO").strip()
