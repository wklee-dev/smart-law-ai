"""HTTP 요청 처리: 세션 재사용, 재시도, 예의 있는 딜레이."""

from __future__ import annotations

import logging
import random
import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .config import USER_AGENT

log = logging.getLogger(__name__)


class HttpClient:
    """검역본부 사이트 전용 HTTP 클라이언트.

    - 세션 쿠키/커넥션 재사용
    - 5xx/타임아웃에 대한 지수 백오프 재시도
    - 요청 간 최소 딜레이(서버 부담 완화)
    """

    def __init__(self, timeout: float = 20.0, retries: int = 3, delay: float = 1.0) -> None:
        self.timeout = timeout
        self.delay = max(delay, 0.0)
        self._last_request_at = 0.0

        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                "Connection": "keep-alive",
            }
        )
        retry = Retry(
            total=retries,
            backoff_factor=1.0,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset(["GET", "HEAD"]),
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=10)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    # ------------------------------------------------------------------
    def _throttle(self) -> None:
        if self.delay <= 0:
            return
        elapsed = time.monotonic() - self._last_request_at
        wait = self.delay - elapsed + random.uniform(0, 0.3)
        if wait > 0:
            time.sleep(wait)

    def get(self, url: str, *, referer: str | None = None, stream: bool = False) -> requests.Response:
        """GET 요청(실패 시 예외)."""
        self._throttle()
        headers = {"Referer": referer} if referer else None
        try:
            resp = self.session.get(url, timeout=self.timeout, headers=headers, stream=stream)
        finally:
            self._last_request_at = time.monotonic()

        if resp.status_code >= 400:
            raise requests.HTTPError(f"HTTP {resp.status_code} · {url}", response=resp)
        return resp

    def get_text(self, url: str, *, referer: str | None = None) -> str:
        resp = self.get(url, referer=referer)
        resp.encoding = resp.encoding or "utf-8"
        if not resp.encoding or resp.encoding.lower() in ("iso-8859-1", "ascii"):
            resp.encoding = "utf-8"
        return resp.text

    def close(self) -> None:
        self.session.close()

    def __enter__(self) -> "HttpClient":
        return self

    def __exit__(self, *exc_info) -> None:
        self.close()
