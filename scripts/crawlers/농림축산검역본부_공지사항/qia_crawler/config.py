"""크롤링 대상 사이트 및 기본 설정.

대상: 농림축산검역본부(동물검역본부) 알림마당 > 공지사항
  목록  https://www.apqa.go.kr/animal/prevent/listwebQiaCom.do?type=7_depart
  상세  https://www.apqa.go.kr/viewwebQiaCom.do?id=<글번호>&type=7_depart
  첨부  https://www.apqa.go.kr/downloadwebQiaCom.do?id=<첨부번호>

페이지 이동은 `pager.offset` 파라미터를 사용하며 한 페이지에 10건씩 노출된다.
(예: 3페이지 → pager.offset=20)

저장 위치(고정)
  · 이력 DB   : D:\\SQLiteDB\\smart_law_ai.db
  · 다운로드  : C:\\SQLiteDB\\downloads
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# ---------------------------------------------------------------------------
# 사이트 상수
# ---------------------------------------------------------------------------
BASE_URL = "https://www.apqa.go.kr"
LIST_PATH = "/animal/prevent/listwebQiaCom.do"
VIEW_PATH = "/viewwebQiaCom.do"
DOWNLOAD_PATH = "/downloadwebQiaCom.do"

# 게시판 구분값(공지사항). 다른 게시판을 크롤링하려면 --type 으로 교체한다.
BOARD_TYPE = "7_depart"
BOARD_NAME = "공지사항"

# 목록 한 페이지당 게시글 수(사이트 고정값)
PAGE_SIZE = 10

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# ---------------------------------------------------------------------------
# 저장 경로 기본값 (윈도우 기준 고정 경로)
# ---------------------------------------------------------------------------
DB_DIR = r"D:\SQLiteDB"
DB_PATH = r"D:\SQLiteDB\smart_law_ai.db"
DOWNLOAD_DIR = r"C:\SQLiteDB\downloads"


def default_db_path() -> Path:
    """이력 DB 기본 경로.

    윈도우에서는 D:\\SQLiteDB\\smart_law_ai.db 를 그대로 사용한다.
    (리눅스/맥 등 D 드라이브가 없는 환경에서만 QIA_DB_PATH 또는 ./data 로 대체)
    """
    if os.name == "nt":
        return Path(DB_PATH)
    override = os.environ.get("QIA_DB_PATH")
    return Path(override) if override else Path("data") / "smart_law_ai.db"


def default_download_dir() -> Path:
    """첨부·본문 다운로드 기본 경로.

    윈도우에서는 C:\\SQLiteDB\\downloads 를 그대로 사용한다.
    """
    if os.name == "nt":
        return Path(DOWNLOAD_DIR)
    override = os.environ.get("QIA_DOWNLOAD_DIR")
    return Path(override) if override else Path("data") / "downloads"


@dataclass
class Settings:
    """실행 옵션(CLI 값이 그대로 주입된다)."""

    board_type: str = BOARD_TYPE
    board_name: str = BOARD_NAME

    # 저장 경로
    download_dir: Path = field(default_factory=default_download_dir)
    db_path: Path = field(default_factory=default_db_path)

    # 수집 범위
    from_page: int = 1
    to_page: int = 1

    # 다운로드/요청 제어
    delay: float = 1.0          # 요청 사이 대기(초)
    timeout: float = 20.0       # 요청 타임아웃(초)
    retries: int = 3            # 실패 시 재시도 횟수
    workers: int = 3            # 상세 페이지 동시 수집 수(사이트가 느려 3 권장)
    download_attachments: bool = True
    save_body: bool = True

    # 이력/중복 처리
    force: bool = False             # 이력 무시하고 다시 수집
    content_dedupe: bool = True     # 제목+등록일 기준 내용 중복 차단
    stop_on_known: bool = False     # 이미 아는 글만 있는 페이지에서 중단

    # 기타
    dry_run: bool = False
    quiet: bool = False
    max_pages: int = 2000           # 안전장치

    # ------------------------------------------------------------------
    # 파생 경로 (다운로드 폴더 하위에 게시판별로 정리)
    # ------------------------------------------------------------------
    @property
    def board_dir(self) -> Path:
        """게시판(화면) 이름 기준 저장 루트. 예: C:\\SQLiteDB\\downloads\\공지사항"""
        return self.download_dir / self.board_name

    @property
    def body_dir(self) -> Path:
        return self.board_dir / "본문"

    @property
    def attach_dir(self) -> Path:
        return self.board_dir / "첨부파일"

    @property
    def report_dir(self) -> Path:
        return self.board_dir / "수집리포트"

    @property
    def log_dir(self) -> Path:
        return self.download_dir / "logs"

    @property
    def history_db(self) -> Path:
        return self.db_path

    def ensure_dirs(self) -> None:
        for path in (
            self.download_dir,
            self.body_dir,
            self.attach_dir,
            self.report_dir,
            self.log_dir,
            self.db_path.parent,
        ):
            path.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    def list_url(self, page: int) -> str:
        offset = max(page - 1, 0) * PAGE_SIZE
        return f"{BASE_URL}{LIST_PATH}?type={self.board_type}&pager.offset={offset}"

    def view_url(self, post_id: str) -> str:
        return f"{BASE_URL}{VIEW_PATH}?id={post_id}&type={self.board_type}"

    def download_url(self, file_id: str) -> str:
        return f"{BASE_URL}{DOWNLOAD_PATH}?id={file_id}"
