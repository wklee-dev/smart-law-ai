# -*- coding: utf-8 -*-
"""HTTP fetcher: session reuse + retry + inter-request delay + host fallback.

If the primary host cannot be resolved or connected to (e.g. a DNS problem with
tt.go.kr), the fetcher automatically switches to the alternative host
(config.ini [network] base_url_alt) and keeps using it for the rest of the run.
"""
from __future__ import annotations

import random
import time

# Error signatures that indicate a host-level problem (DNS / connect), where
# switching to the alternative host is worth trying.
_HOST_ERRORS = (
    "getaddrinfo",
    "NameResolutionError",
    "Failed to resolve",
    "Max retries exceeded",
    "ConnectionError",
    "NewConnectionError",
    "Temporary failure in name resolution",
    "timed out",
    "SSLError",
)


class FetchError(Exception):
    """Collection failure (after exhausting retries)."""


class Fetcher:
    def __init__(self, cfg, logger=None):
        import requests  # lazy import

        self.cfg = cfg
        self.log = logger
        self.bases = list(getattr(cfg, "base_urls", None) or [cfg.base_url])
        self.base = self.bases[0]
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": cfg.user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
                "Connection": "keep-alive",
            }
        )
        self._last_call = 0.0
        self.request_cnt = 0
        self.host_switched = False

    # ------------------------------------------------------------------
    def _throttle(self):
        gap = time.time() - self._last_call
        wait = self.cfg.delay_sec - gap
        if wait > 0:
            time.sleep(wait)
        self._last_call = time.time()

    # ------------------------------------------------------------------
    def _switch_base(self) -> bool:
        """Switch to the next candidate host. Returns True when switched."""
        for candidate in self.bases:
            if candidate != self.base:
                if self.log:
                    self.log.warning("host unreachable -> switching base_url to %s", candidate)
                self.base = candidate
                self.host_switched = True
                return True
        return False

    @staticmethod
    def _is_host_error(msg: str) -> bool:
        m = str(msg)
        return any(sig in m for sig in _HOST_ERRORS)

    # ------------------------------------------------------------------
    def get_text(self, path: str, params: dict = None, referer: str = None) -> str:
        """Return HTML text. Raises FetchError on failure."""
        last_err = None
        alt_used = False

        while True:
            url = path if str(path).startswith("http") else self.base + path
            for attempt in range(1, self.cfg.retry_cnt + 1):
                self._throttle()
                try:
                    headers = {"Referer": referer} if referer else None
                    resp = self.session.get(
                        url, params=params, headers=headers, timeout=self.cfg.timeout_sec
                    )
                    self.request_cnt += 1
                    if resp.status_code == 200:
                        resp.encoding = resp.apparent_encoding or "utf-8"
                        return resp.text
                    last_err = "HTTP %s" % resp.status_code
                except Exception as e:  # noqa: BLE001
                    last_err = "%s: %s" % (type(e).__name__, e)

                if attempt < self.cfg.retry_cnt:
                    sleep = self.cfg.retry_backoff_sec * attempt + random.uniform(0, 1.0)
                    if self.log:
                        self.log.warning(
                            "request failed (%s/%s) %s -> retry in %.1fs",
                            attempt, self.cfg.retry_cnt, last_err, sleep,
                        )
                    time.sleep(sleep)

            # Retries exhausted for this host: try the alternative host once.
            if not alt_used and self._is_host_error(last_err) and self._switch_base():
                alt_used = True
                continue

            raise FetchError("[%s] %s" % (last_err, url))

    # ------------------------------------------------------------------
    def get_bytes(self, path: str, params: dict = None, referer: str = None) -> bytes:
        """Binary download (attachments)."""
        url = path if str(path).startswith("http") else self.base + path
        self._throttle()
        headers = {"Referer": referer} if referer else None
        resp = self.session.get(url, params=params, headers=headers, timeout=self.cfg.timeout_sec)
        self.request_cnt += 1
        if resp.status_code != 200:
            raise FetchError("HTTP %s %s" % (resp.status_code, url))
        return resp.content

    # ------------------------------------------------------------------
    def list_url(self, semok: str, page: int) -> str:
        return self.base + "/mUser/dem/demList.do"

    def list_params(self, semok: str, page: int) -> dict:
        return {"semok": str(semok), "pageNumber": str(page)}

    def detail_url(self, semok: str, dem_no) -> str:
        return self.base + "/mUser/dem/demView.do"

    def detail_params(self, semok: str, dem_no) -> dict:
        return {"semok": str(semok), "dem_no": str(dem_no), "menuNm": "demList", "rdView": "subject"}

    def body_url(self) -> str:
        return self.base + "/mUser/common/xmlViewer.do"

    def body_params(self, dem_no, db_flag: str = "s") -> dict:
        return {"dem_no": str(dem_no), "db": db_flag}
