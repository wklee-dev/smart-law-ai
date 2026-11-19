# ops_settings.py
#
# 역할: RAG API 운영·보안 관련 환경변수를 읽는다.
#       기존 RAG 기능 기본값은 유지하고 옵션만 제공한다.

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _parse_bool(raw: str | None, default: bool) -> bool:
    if raw is None or str(raw).strip() == "":
        return default
    value = str(raw).strip().lower()
    if value in {"1", "true", "yes", "on", "y"}:
        return True
    if value in {"0", "false", "no", "off", "n"}:
        return False
    return default


def _parse_int(
    raw: str | None,
    default: int,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    if raw is None or str(raw).strip() == "":
        value = default
    else:
        try:
            value = int(str(raw).strip())
        except ValueError:
            value = default
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


def _parse_origins(raw: str | None) -> list[str]:
    if raw is None or str(raw).strip() == "":
        return [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    origins: list[str] = []
    for part in str(raw).split(","):
        cleaned = part.strip()
        if cleaned:
            origins.append(cleaned)
    return origins or [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


@dataclass(frozen=True)
class OpsSettings:
    debug: bool
    log_level: str

    enable_citation: bool
    enable_ranking: bool
    enable_keyword_search: bool
    enable_hybrid_search: bool
    enable_request_log: bool
    enable_performance_log: bool

    max_query_length: int
    max_context_length: int
    request_timeout_seconds: int
    api_timeout_seconds: int

    allow_origins: list[str]

    rag_version: str
    rag_build: str
    provider: str
    vector_dimension: int


@lru_cache(maxsize=1)
def get_ops_settings() -> OpsSettings:
    log_level = (
        os.getenv("LOG_LEVEL", "INFO") or "INFO"
    ).strip().upper()
    if log_level not in {
        "CRITICAL",
        "ERROR",
        "WARNING",
        "INFO",
        "DEBUG",
        "NOTSET",
    }:
        log_level = "INFO"

    return OpsSettings(
        debug=_parse_bool(os.getenv("DEBUG"), False),
        log_level=log_level,
        enable_citation=_parse_bool(
            os.getenv("ENABLE_CITATION"),
            True,
        ),
        enable_ranking=_parse_bool(
            os.getenv("ENABLE_RANKING"),
            True,
        ),
        enable_keyword_search=_parse_bool(
            os.getenv("ENABLE_KEYWORD_SEARCH"),
            True,
        ),
        enable_hybrid_search=_parse_bool(
            os.getenv("ENABLE_HYBRID_SEARCH"),
            True,
        ),
        enable_request_log=_parse_bool(
            os.getenv("ENABLE_REQUEST_LOG"),
            True,
        ),
        enable_performance_log=_parse_bool(
            os.getenv("ENABLE_PERFORMANCE_LOG"),
            True,
        ),
        max_query_length=_parse_int(
            os.getenv("MAX_QUERY_LENGTH"),
            2000,
            minimum=1,
            maximum=50_000,
        ),
        max_context_length=_parse_int(
            os.getenv("MAX_CONTEXT_LENGTH"),
            20_000,
            minimum=1_000,
            maximum=200_000,
        ),
        request_timeout_seconds=_parse_int(
            os.getenv("REQUEST_TIMEOUT_SECONDS"),
            60,
            minimum=5,
            maximum=600,
        ),
        api_timeout_seconds=_parse_int(
            os.getenv("API_TIMEOUT_SECONDS"),
            55,
            minimum=5,
            maximum=600,
        ),
        allow_origins=_parse_origins(
            os.getenv("ALLOW_ORIGINS")
        ),
        rag_version=(
            os.getenv("RAG_VERSION", "1.0.0") or "1.0.0"
        ).strip(),
        rag_build=(
            os.getenv("RAG_BUILD", "dev") or "dev"
        ).strip(),
        provider=(
            os.getenv("RAG_PROVIDER", "gemini") or "gemini"
        ).strip(),
        vector_dimension=_parse_int(
            os.getenv("EMBEDDING_OUTPUT_DIMENSIONALITY"),
            768,
            minimum=1,
            maximum=10_000,
        ),
    )


def clear_ops_settings_cache() -> None:
    get_ops_settings.cache_clear()
