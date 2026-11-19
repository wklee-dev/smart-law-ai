"""Portable, traversal-safe names and output paths for downloaded attachments."""

from __future__ import annotations

import hashlib
import ntpath
import os
from pathlib import Path
import re
import unicodedata
from urllib.parse import unquote, urlsplit

_INVALID_WINDOWS = frozenset('<>:"/\\|?*')
_RESERVED_WINDOWS = frozenset(
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{number}" for number in range(1, 10)}
    | {f"LPT{number}" for number in range(1, 10)}
)
_ALLOWED_EXTENSIONS = frozenset(
    {
        ".pdf",
        ".hwp",
        ".hwpx",
        ".txt",
        ".csv",
        ".xml",
        ".json",
        ".html",
        ".htm",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".ppt",
        ".pptx",
        ".zip",
        ".7z",
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".bmp",
        ".tif",
        ".tiff",
        ".mp3",
        ".mp4",
    }
)


def _digest(value: str, length: int = 10) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:length]


def sanitize_component(value: object, max_length: int = 60) -> str:
    """Return one safe filename/path component, never a path.

    Alterations caused by invalid Windows characters, a reserved device name,
    or shortening gain a source hash.  This keeps names readable while making
    otherwise-colliding inputs distinct.
    """
    if (
        isinstance(max_length, bool)
        or not isinstance(max_length, int)
        or max_length < 1
    ):
        raise ValueError("max_length must be a positive integer")
    original = unicodedata.normalize("NFC", str(value))
    cleaned = "".join(
        char
        for char in original
        if char not in _INVALID_WINDOWS and unicodedata.category(char) != "Cc"
    )
    cleaned = cleaned.rstrip(" .")
    altered = cleaned != original
    if cleaned in ("", ".", ".."):
        cleaned = "untitled"
        altered = True
    # Windows reserves a device name even when it is followed by an extension.
    if cleaned.split(".", 1)[0].upper() in _RESERVED_WINDOWS:
        cleaned = "_" + cleaned
        altered = True
    if len(cleaned) > max_length:
        altered = True
    if altered:
        hash_length = min(10, max(4, max_length // 4))
        suffix = "-" + _digest(original, hash_length)
        if max_length <= len(suffix):
            return _digest(original, max_length)
        base = cleaned[: max_length - len(suffix)].rstrip(" .") or "x"
        return (base + suffix)[:max_length].rstrip(" .") or _digest(
            original, max_length
        )
    return cleaned


def fs_path(path: str | Path) -> str:
    """Return a filesystem path suitable for the current platform.

    On Windows, fully-qualified drive and UNC paths use the extended-length
    prefix.  Linux deliberately receives the unmodified path spelling.
    """
    raw = os.fspath(path)
    if os.name != "nt":
        return raw
    value = raw.replace("/", "\\")
    if value.startswith("\\\\?\\"):
        return value
    if value.startswith("\\\\"):
        return "\\\\?\\UNC\\" + value.lstrip("\\")
    if re.match(r"^[A-Za-z]:\\", value):
        return "\\\\?\\" + ntpath.normpath(value)
    return value


def _filename_from(value: str) -> str:
    return unquote(str(value)).replace("\\", "/").rsplit("/", 1)[-1]


def _allowed_extension(display_name: str, url: str) -> str:
    for candidate in (_filename_from(display_name), _filename_from(urlsplit(url).path)):
        match = re.search(r"(\.[A-Za-z0-9]{1,10})$", candidate)
        if match:
            extension = match.group(1).lower()
            if extension in _ALLOWED_EXTENSIONS:
                return extension
    return ""


def attachment_target(
    root: Path,
    category: str,
    item: dict,
    annex_id: str,
    display_name: str,
    url: str,
) -> Path:
    """Build a bounded, deterministic target path for one attachment.

    The caller supplies the trusted root.  Every source-controlled component
    is sanitized independently, so it cannot add parent components or change
    the selected root/category/item directory.
    """
    if not isinstance(item, dict):
        raise TypeError("item must be a dictionary")
    for key in ("source_id", "effective_date", "title"):
        if key not in item or not isinstance(item[key], str):
            raise ValueError(f"item requires string field: {key}")
    if not all(
        isinstance(value, str) for value in (category, annex_id, display_name, url)
    ):
        raise TypeError("category, annex_id, display_name, and url must be strings")

    safe_category = sanitize_component(category, 40)
    source_id = sanitize_component(item["source_id"], 28)
    effective_date = sanitize_component(item["effective_date"] or "undated", 16)
    short_title = sanitize_component(item["title"], 44)
    item_directory = sanitize_component(
        f"{source_id}-{effective_date}-{short_title}", 96
    )

    extension = _allowed_extension(display_name, url)
    raw_display = _filename_from(display_name)
    stem = re.sub(r"\.[^.]*$", "", raw_display) or "annex"
    filename_hash = _digest(annex_id + "\x00" + display_name + "\x00" + url, 12)
    base_limit = max(1, 100 - len(extension) - len(filename_hash) - 1)
    safe_stem = sanitize_component(stem, base_limit)
    filename = f"{safe_stem}-{filename_hash}{extension}"

    # The components above cannot contain slash, backslash, dot, or dot-dot.
    components = (safe_category, item_directory, filename)
    if any(
        component in ("", ".", "..") or "/" in component or "\\" in component
        for component in components
    ):
        raise ValueError("unsafe attachment path component")
    root_path = Path(root)
    target = root_path / safe_category / item_directory / filename
    try:
        target.relative_to(root_path)
    except ValueError as exc:
        raise ValueError("attachment target escapes root") from exc
    return target
