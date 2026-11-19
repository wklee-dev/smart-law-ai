"""첨부파일 다운로드.

- 서버가 내려주는 Content-Disposition 파일명을 우선 사용
- 경로 조작/금지문자 제거, 중복 파일명은 (2), (3) … 부여
- 임시 파일(.part)로 받은 뒤 완료 시 교체하여 불완전 파일 방지
- 이미 같은 크기로 받아둔 파일은 재다운로드하지 않음
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from urllib.parse import unquote

from .http_client import HttpClient
from .parser import Attachment
from .utils import safe_filename

log = logging.getLogger(__name__)

_ENCODED_FILENAME = re.compile(r"filename\*\s*=\s*([^']*)''([^;]+)", re.I)
_PLAIN_FILENAME = re.compile(r'filename\s*=\s*"?([^";]+)"?', re.I)


def filename_from_headers(content_disposition: str | None, fallback: str) -> str:
    """Content-Disposition 헤더에서 파일명을 추출한다."""
    if content_disposition:
        match = _ENCODED_FILENAME.search(content_disposition)
        if match:
            charset = match.group(1) or "utf-8"
            try:
                return unquote(match.group(2).strip(), encoding=charset, errors="replace")
            except LookupError:
                return unquote(match.group(2).strip())
        match = _PLAIN_FILENAME.search(content_disposition)
        if match:
            raw = match.group(1).strip()
            if "%" in raw:
                return unquote(raw, errors="replace")
            try:
                # 일부 서버는 EUC-KR로 인코딩된 바이트를 그대로 내려준다.
                return raw.encode("latin-1").decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                return raw
    return fallback


def unique_path(directory: Path, filename: str) -> Path:
    target = directory / filename
    if not target.exists():
        return target
    stem, suffix = Path(filename).stem, Path(filename).suffix
    index = 2
    while True:
        candidate = directory / f"{stem} ({index}){suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def download_attachment(
    client: HttpClient,
    attachment: Attachment,
    dest_dir: Path,
    *,
    referer: str = "",
    force: bool = False,
) -> Attachment:
    """첨부 1건 다운로드. 성공/실패 상태를 attachment.status 에 기록한다."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    fallback_name = safe_filename(attachment.name or f"첨부파일_{attachment.file_id}")
    target = dest_dir / fallback_name

    # 이미 받아둔 파일이면 건너뛰기(강제 옵션 예외)
    if target.exists() and target.stat().st_size > 0 and not force:
        attachment.local_path = str(target)
        attachment.size = target.stat().st_size
        attachment.status = "exists"
        return attachment

    temp_path = target.with_name(target.name + ".part")
    try:
        with client.get(attachment.url, referer=referer, stream=True) as resp:
            header_name = filename_from_headers(resp.headers.get("Content-Disposition"), fallback_name)
            filename = safe_filename(header_name or fallback_name)
            if not Path(filename).suffix:
                # 확장자가 없으면 원본 표기에서 보완
                suffix = Path(fallback_name).suffix
                if suffix:
                    filename = f"{filename}{suffix}"

            target = dest_dir / filename
            if target.exists() and target.stat().st_size > 0 and not force:
                attachment.local_path = str(target)
                attachment.size = target.stat().st_size
                attachment.status = "exists"
                return attachment
            if target.exists() and force:
                target = unique_path(dest_dir, filename)
            temp_path = target.with_name(target.name + ".part")

            expected = resp.headers.get("Content-Length")
            written = 0
            with temp_path.open("wb") as fp:
                for chunk in resp.iter_content(chunk_size=64 * 1024):
                    if chunk:
                        fp.write(chunk)
                        written += len(chunk)

            if expected and expected.isdigit() and written != int(expected):
                raise IOError(f"용량 불일치(수신 {written} / 예상 {expected})")

        temp_path.replace(target)
        attachment.local_path = str(target)
        attachment.size = written
        attachment.status = "downloaded"
        log.info("    · 첨부 저장: %s (%.1f KB)", target.name, written / 1024)
        return attachment

    except Exception as exc:  # noqa: BLE001 - 개별 실패는 기록하고 계속 진행
        attachment.status = "failed"
        attachment.local_path = None
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
        log.warning("    ! 첨부 실패(%s): %s", attachment.file_id, exc)
        return attachment
