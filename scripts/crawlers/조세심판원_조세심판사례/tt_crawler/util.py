# -*- coding: utf-8 -*-
"""Common utilities: logging, text normalization, file paths."""
from __future__ import annotations

import datetime
import hashlib
import logging
import os
import re
import sys


# --------------------------------------------------------------------------
# Console encoding (avoid mojibake on Windows consoles)
# --------------------------------------------------------------------------
def setup_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            if hasattr(stream, "reconfigure"):
                stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


# --------------------------------------------------------------------------
# Time
# --------------------------------------------------------------------------
def now_str(fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    return datetime.datetime.now().strftime(fmt)


def stamp_str() -> str:
    return datetime.datetime.now().strftime("%Y%m%d_%H%M%S")


# --------------------------------------------------------------------------
# Text normalization
# --------------------------------------------------------------------------
_WS = re.compile(r"[\s\u00a0]+")
_BLANK_LINES = re.compile(r"\n{3,}")


def clean_text(s) -> str:
    """Collapse repeated spaces and excessive blank lines."""
    if s is None:
        return ""
    s = str(s).replace("\r\n", "\n").replace("\r", "\n").replace("\u00a0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n[ \t]+", "\n", s)
    s = _BLANK_LINES.sub("\n\n", s)
    return s.strip()


def norm_key(s) -> str:
    """Key for label comparison: strip spaces and middle dots."""
    return re.sub(r"[\s\u00a0\u00b7\u318d]", "", str(s or "")).strip()


def cut(s, n: int) -> str:
    """Truncate a value for DB storage."""
    if s is None:
        return None
    s = str(s)
    return s if len(s) <= n else s[:n]


def one_line(s) -> str:
    """For short fields (title/summary/law): merge layout line-breaks into spaces."""
    s = clean_text(s)
    if not s:
        return ""
    s = re.sub(r"\s*\n\s*", " ", s)
    s = re.sub(r"[ ]{2,}", " ", s)
    return s.strip()


_DATE3 = re.compile(r"(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})")
_DATE2 = re.compile(r"(\d{4})\s*[.\-/]\s*(\d{1,2})")


def norm_date(s) -> str:
    """'2026.09.08' / '2026-09-16' -> 'YYYY-MM-DD'."""
    s = clean_text(s)
    if not s:
        return ""
    m = _DATE3.search(s)
    if m:
        return "%04d-%02d-%02d" % (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = _DATE2.search(s)
    if m:
        return "%04d-%02d" % (int(m.group(1)), int(m.group(2)))
    return s


def sha1(text: str) -> str:
    return hashlib.sha1((text or "").encode("utf-8", "replace")).hexdigest()


# --------------------------------------------------------------------------
# Files / paths
# --------------------------------------------------------------------------
def ensure_dir(path: str) -> None:
    if path and not os.path.isdir(path):
        os.makedirs(path, exist_ok=True)


def safe_filename(name: str, max_len: int = 120) -> str:
    """Remove characters that are invalid on Windows."""
    name = re.sub(r'[\\/:*?"<>|]', "_", str(name or "")).strip()
    name = re.sub(r"\s+", "_", name)
    return name[:max_len] or "unnamed"


# --------------------------------------------------------------------------
# Logger
# --------------------------------------------------------------------------
def setup_logger(log_dir: str, level: str = "INFO", name: str = "tt") -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, str(level).upper(), logging.INFO))
    logger.propagate = False
    if logger.handlers:
        return logger

    fmt = logging.Formatter("[%(asctime)s] %(levelname)-7s %(message)s", "%Y-%m-%d %H:%M:%S")

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    logger.addHandler(sh)

    if log_dir:
        try:
            ensure_dir(log_dir)
            fh = logging.FileHandler(
                os.path.join(log_dir, "crawl_%s.log" % datetime.date.today().strftime("%Y%m%d")),
                encoding="utf-8",
            )
            fh.setFormatter(fmt)
            logger.addHandler(fh)
        except Exception:
            pass
    return logger