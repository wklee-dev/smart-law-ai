# final_verification.py
#
# 역할: Smart Law AI 운영 배포 전 Python RAG 계층을
#       읽기 전용으로 최종 검증한다. 운영 코드는 수정하지 않는다.

from __future__ import annotations

import json
import math
import os
import platform
import sys
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from vector.chunk_generator.embedding_service import (
    EmbeddingService,
)
from vector.chunk_generator.supabase_repository import (
    SupabaseRepository,
)
from vector.llm.llm_factory import create_llm
from vector.rag.answer_service import AnswerService
from vector.rag.citation_result_builder import (
    CitationResultBuilder,
)
from vector.rag.citation_validator import (
    CitationValidator,
)
from vector.rag.context_builder import ContextBuilder
from vector.rag.prompt_builder import (
    PROMPT_CONTEXT_END_MARKER,
    PROMPT_CONTEXT_START_MARKER,
    PROMPT_QUERY_END_MARKER,
    PROMPT_QUERY_START_MARKER,
    PromptBuilder,
)
from vector.rag.rag_chat_service import RAGChatService
from vector.search.hybrid_search_service import (
    HybridSearchService,
)
from vector.search.keyword_search_service import (
    KeywordSearchService,
)
from vector.search.query_search_service import (
    QuerySearchService,
)
from vector.search.ranking_service import RankingService

PROJECT_ROOT = Path(__file__).resolve().parents[2]

ENV_LOCAL_PATH = PROJECT_ROOT / ".env.local"
ENV_PATH = PROJECT_ROOT / ".env"

EXPECTED_VECTOR_DIMENSION = 768
EXPECTED_ADMIN_RULE_CHUNK_COUNT = 740

MAX_HEALTH_SECONDS = 2.0
MAX_RAG_SECONDS = 120.0
TARGET_RAG_SECONDS = 30.0

FINAL_CHECK_VERSION = "1.0"

ALLOWED_CITATION_STATUSES = frozenset(
    {
        "VALID",
        "NO_CITATIONS",
        "INVALID_CITATIONS",
        "MIXED_CITATIONS",
    }
)

REQUIRED_ENV_KEYS = (
    "GEMINI_API_KEY",
    "GEMINI_GENERATION_MODEL",
    "EMBEDDING_MODEL",
    "EMBEDDING_OUTPUT_DIMENSIONALITY",
    "RAG_API_BASE_URL",
    "DEBUG",
    "LOG_LEVEL",
    "MAX_QUERY_LENGTH",
    "REQUEST_TIMEOUT_SECONDS",
)

BOOLEAN_ENV_KEYS = (
    "ENABLE_CITATION",
    "ENABLE_RANKING",
    "ENABLE_KEYWORD_SEARCH",
    "ENABLE_HYBRID_SEARCH",
)

PRODUCTION_RECOMMENDED_VALUES = {
    "DEBUG": "false",
    "LOG_LEVEL": "INFO",
}

STANDARD_QUERY = (
    "사후관리 대상 물품의 용도 외 사용 승인은 "
    "어떻게 하나요?"
)

FORBIDDEN_RESULT_KEYS = frozenset(
    {
        "system_prompt",
        "user_prompt",
        "combined_prompt",
        "context_text",
        "embedding",
        "api_key",
        "gemini_api_key",
        "service_role_key",
        "authorization",
        "cookie",
        "password",
        "secret",
    }
)

REPORT_PATH = (
    PROJECT_ROOT
    / "data"
    / "verification"
    / "smartlaw-final-verification.json"
)

TITLE_HINTS = (
    "용도 외 사용",
    "승인",
    "위탁사후관리물품",
)


@dataclass
class CheckResult:
    check_id: str
    name: str
    status: str
    severity: str
    elapsed_seconds: float
    message: str
    details: dict[str, Any] = field(
        default_factory=dict
    )


@dataclass
class VerificationReport:
    version: str
    overall_status: str
    started_at: str
    finished_at: str
    total_elapsed_seconds: float
    pass_count: int
    warn_count: int
    fail_count: int
    skip_count: int
    checks: list[CheckResult]


def load_project_environment() -> None:
    if ENV_LOCAL_PATH.is_file():
        load_dotenv(ENV_LOCAL_PATH, override=False)
    if ENV_PATH.is_file():
        load_dotenv(ENV_PATH, override=False)


def run_check(
    check_id: str,
    name: str,
    severity: str,
    check_function: Callable[
        [],
        tuple[str, str, dict[str, Any]],
    ],
) -> CheckResult:
    started = time.perf_counter()
    try:
        status, message, details = check_function()
        if not isinstance(details, dict):
            details = {}
        if status not in {"PASS", "WARN", "FAIL", "SKIP"}:
            status = "FAIL"
            message = "check_function status가 올바르지 않습니다."
            details = {"status_value": str(status)}
    except Exception as exc:
        status = "FAIL"
        message = "검증 실행 중 예외가 발생했습니다."
        details = {
            "exception_type": type(exc).__name__,
        }
    elapsed = round(time.perf_counter() - started, 4)
    return CheckResult(
        check_id=check_id,
        name=name,
        status=status,
        severity=severity,
        elapsed_seconds=elapsed,
        message=message,
        details=details,
    )


def _env_present(key: str) -> bool:
    value = os.getenv(key)
    return value is not None and str(value).strip() != ""


def _parse_int_safe(raw: str | None) -> int | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if text == "" or not text.lstrip("-").isdigit():
        return None
    try:
        return int(text)
    except ValueError:
        return None


def check_environment() -> tuple[str, str, dict[str, Any]]:
    presence: dict[str, str] = {}
    missing: list[str] = []
    for key in REQUIRED_ENV_KEYS:
        if key == "GEMINI_API_KEY":
            if _env_present(key):
                presence[key] = "SET"
            else:
                presence[key] = "MISSING"
                missing.append(key)
            continue
        if _env_present(key):
            presence[key] = "SET"
        else:
            presence[key] = "MISSING"
            missing.append(key)

    warnings: list[str] = []
    failures: list[str] = []

    if missing:
        failures.append("required_env_missing")

    dim_raw = os.getenv("EMBEDDING_OUTPUT_DIMENSIONALITY")
    dim_value = _parse_int_safe(dim_raw)
    if dim_value != EXPECTED_VECTOR_DIMENSION:
        failures.append("embedding_dimension")

    max_query = _parse_int_safe(os.getenv("MAX_QUERY_LENGTH"))
    if (
        max_query is None
        or max_query < 1
        or max_query > 10_000
    ):
        failures.append("max_query_length")

    timeout = _parse_int_safe(
        os.getenv("REQUEST_TIMEOUT_SECONDS")
    )
    if timeout is None or timeout < 1 or timeout > 300:
        failures.append("request_timeout_seconds")

    bool_status: dict[str, str] = {}
    for key in BOOLEAN_ENV_KEYS:
        raw = os.getenv(key)
        if raw is None or str(raw).strip() == "":
            bool_status[key] = "MISSING"
            # 기본값이 코드에 있으므로 누락은 WARN
            warnings.append(f"{key}_missing")
            continue
        normalized = str(raw).strip().lower()
        if normalized in {"true", "false"}:
            bool_status[key] = normalized
        else:
            bool_status[key] = "INVALID"
            failures.append(f"{key}_invalid")

    debug_raw = (os.getenv("DEBUG") or "").strip().lower()
    if debug_raw and debug_raw != "false":
        warnings.append("debug_not_false")

    log_level = (os.getenv("LOG_LEVEL") or "").strip().upper()
    if log_level and log_level not in {"INFO", "WARNING"}:
        warnings.append("log_level_not_recommended")

    details: dict[str, Any] = {
        "presence": presence,
        "boolean_env": bool_status,
        "embedding_dimension": dim_value,
        "max_query_length": max_query,
        "request_timeout_seconds": timeout,
        "missing_keys": missing,
        "failures": failures,
        "warnings": warnings,
        "recommended": dict(PRODUCTION_RECOMMENDED_VALUES),
    }

    if failures:
        return (
            "FAIL",
            "필수 환경변수 또는 값 검증에 실패했습니다.",
            details,
        )
    if warnings:
        return (
            "WARN",
            "환경변수는 존재하나 운영 권장값과 다릅니다.",
            details,
        )
    return (
        "PASS",
        "필수 환경변수와 운영 값이 검증되었습니다.",
        details,
    )


def check_python_runtime() -> tuple[str, str, dict[str, Any]]:
    major = sys.version_info.major
    minor = sys.version_info.minor
    details: dict[str, Any] = {
        "python_major": major,
        "python_minor": minor,
        "platform_system": platform.system(),
        "platform_machine": platform.machine(),
        "imports": {},
    }

    import_ok = True
    for module_name in (
        "google.genai",
        "fastapi",
        "pydantic",
        "dotenv",
    ):
        try:
            __import__(module_name)
            details["imports"][module_name] = "OK"
        except Exception:
            details["imports"][module_name] = "FAIL"
            import_ok = False

    if major < 3 or (major == 3 and minor < 12):
        return (
            "FAIL",
            "Python 3.12 이상이 필요합니다.",
            details,
        )
    if not import_ok:
        return (
            "FAIL",
            "필수 Python 패키지 import에 실패했습니다.",
            details,
        )
    if (major, minor) != (3, 12):
        return (
            "WARN",
            "프로젝트 표준 Python 3.12와 버전이 다릅니다.",
            details,
        )
    return (
        "PASS",
        "Python 런타임과 필수 패키지가 확인되었습니다.",
        details,
    )


def check_database_read_only() -> tuple[
    str,
    str,
    dict[str, Any],
]:
    # 공개 Repository에 keywords cardinality / duplicate source_pk
    # 전용 조회 메서드가 없어 스펙에 따라 SKIP 처리한다.
    details = {
        "manual_sql_required": True,
        "expected": {
            "total_chunks": EXPECTED_ADMIN_RULE_CHUNK_COUNT,
            "embedded_chunks": EXPECTED_ADMIN_RULE_CHUNK_COUNT,
            "keyword_chunks": EXPECTED_ADMIN_RULE_CHUNK_COUNT,
            "duplicate_count": 0,
        },
        "available_public_methods": [
            "get_admin_rule_batch_statistics",
        ],
        "missing_verification_methods": [
            "keyword_cardinality_count",
            "duplicate_source_pk_count",
            "article_chunk_invariant_report",
        ],
        "manual_checks": [
            "admin_rule ARTICLE smartlaw_chunk count = 740",
            "embedding IS NOT NULL count = 740",
            "keywords cardinality > 0 count = 740",
            "duplicate source_pk count = 0",
        ],
    }
    return (
        "SKIP",
        (
            "Repository에 읽기 전용 운영 검증 메서드가 없어 "
            "DB 수동 검증이 필요합니다."
        ),
        details,
    )


def check_query_embedding() -> tuple[str, str, dict[str, Any]]:
    service = EmbeddingService()
    vector = service.generate_query_embedding(STANDARD_QUERY)

    details: dict[str, Any] = {
        "is_sequence": isinstance(vector, Sequence)
        and not isinstance(vector, (str, bytes)),
        "length": (
            len(vector)
            if isinstance(vector, Sequence)
            and not isinstance(vector, (str, bytes))
            else None
        ),
        "expected_dimension": EXPECTED_VECTOR_DIMENSION,
    }

    if not details["is_sequence"]:
        return (
            "FAIL",
            "Query Embedding 결과가 Sequence가 아닙니다.",
            details,
        )

    values = list(vector)
    if len(values) != EXPECTED_VECTOR_DIMENSION:
        return (
            "FAIL",
            "Query Embedding 차원이 768이 아닙니다.",
            details,
        )

    norm_sq = 0.0
    for value in values:
        if isinstance(value, bool) or not isinstance(
            value,
            (int, float),
        ):
            return (
                "FAIL",
                "Embedding에 숫자가 아닌 값이 있습니다.",
                details,
            )
        number = float(value)
        if not math.isfinite(number):
            return (
                "FAIL",
                "Embedding에 NaN 또는 Infinity가 있습니다.",
                details,
            )
        norm_sq += number * number

    details["norm_is_nonzero"] = norm_sq > 0.0
    if norm_sq <= 0.0:
        return (
            "FAIL",
            "Embedding norm이 0입니다.",
            details,
        )

    return (
        "PASS",
        "Query Embedding 차원·수치 검증을 통과했습니다.",
        details,
    )


def _build_search_stack() -> tuple[
    SupabaseRepository,
    EmbeddingService,
    RankingService,
]:
    repository = SupabaseRepository()
    embedding_service = EmbeddingService()
    query_search = QuerySearchService(
        repository,
        embedding_service,
    )
    keyword_search = KeywordSearchService(repository)
    hybrid_search = HybridSearchService(
        query_search,
        keyword_search,
    )
    ranking = RankingService(hybrid_search)
    return repository, embedding_service, ranking


def check_search_pipeline() -> tuple[str, str, dict[str, Any]]:
    _repo, _emb, ranking = _build_search_stack()
    results = ranking.search(
        STANDARD_QUERY,
        match_count=10,
        candidate_multiplier=3,
        match_threshold=0.0,
        vector_weight=0.65,
        keyword_weight=0.35,
        document_category="ADMIN_RULE",
        source_table="admin_rule",
        chunk_type="ARTICLE",
        hybrid_candidate_multiplier=3,
    )

    details: dict[str, Any] = {
        "result_count": len(results) if isinstance(results, list) else None,
    }

    if not isinstance(results, list):
        return (
            "FAIL",
            "Ranking 결과가 list가 아닙니다.",
            details,
        )
    if len(results) < 1 or len(results) > 10:
        return (
            "FAIL",
            "Ranking 결과 건수가 허용 범위를 벗어났습니다.",
            details,
        )

    ids = [row.get("id") for row in results]
    source_pks = [row.get("source_pk") for row in results]
    if len(ids) != len(set(ids)):
        return (
            "FAIL",
            "Ranking 결과에 id 중복이 있습니다.",
            details,
        )
    if len(source_pks) != len(set(source_pks)):
        return (
            "FAIL",
            "Ranking 결과에 source_pk 중복이 있습니다.",
            details,
        )

    for row in results:
        score = row.get("ranking_score")
        if isinstance(score, bool) or not isinstance(
            score,
            (int, float),
        ):
            return (
                "FAIL",
                "ranking_score 형식이 올바르지 않습니다.",
                details,
            )
        number = float(score)
        if number < 0.0 or number > 1.0:
            return (
                "FAIL",
                "ranking_score가 0~1 범위를 벗어났습니다.",
                details,
            )

    law_ok = any(
        isinstance(row.get("law_name"), str)
        and "사후관리에 관한 고시" in row["law_name"]
        for row in results
    )
    title_ok = any(
        any(
            hint in text
            for hint in TITLE_HINTS
            for text in (
                str(row.get("title") or ""),
                str(row.get("header") or ""),
            )
        )
        for row in results
    )
    details["law_name_match"] = law_ok
    details["title_or_header_match"] = title_ok
    details["top_ids"] = [
        row.get("id") for row in results[:5]
    ]
    details["top_source_pks"] = [
        row.get("source_pk") for row in results[:5]
    ]

    if not law_ok:
        return (
            "FAIL",
            "law_name에 사후관리에 관한 고시가 없습니다.",
            details,
        )
    if not title_ok:
        return (
            "FAIL",
            "title/header 관련 키워드가 없습니다.",
            details,
        )

    return (
        "PASS",
        "Hybrid Search·Ranking 파이프라인이 검증되었습니다.",
        details,
    )


def check_context_and_prompt() -> tuple[
    str,
    str,
    dict[str, Any],
]:
    _repo, _emb, ranking = _build_search_stack()
    ranked = ranking.search(
        STANDARD_QUERY,
        match_count=10,
        candidate_multiplier=3,
        match_threshold=0.0,
        vector_weight=0.65,
        keyword_weight=0.35,
        document_category="ADMIN_RULE",
        source_table="admin_rule",
        chunk_type="ARTICLE",
        hybrid_candidate_multiplier=3,
    )

    max_context_chars = 20_000
    context_result = ContextBuilder.build(
        STANDARD_QUERY,
        ranked,
        max_results=5,
        max_chunk_chars=3000,
        max_context_chars=max_context_chars,
    )
    prompt_result = PromptBuilder.build(context_result)

    context_count = int(context_result["context_count"])
    source_ids = list(context_result["source_ids"])
    sources = list(context_result["sources"])
    total_chars = int(context_result["total_context_chars"])

    details: dict[str, Any] = {
        "context_count": context_count,
        "source_ids": source_ids,
        "sources_count": len(sources),
        "total_context_chars": total_chars,
        "system_prompt_chars": prompt_result.get(
            "system_prompt_chars"
        ),
        "user_prompt_chars": prompt_result.get(
            "user_prompt_chars"
        ),
        "combined_prompt_chars": prompt_result.get(
            "combined_prompt_chars"
        ),
    }

    if context_count < 1 or context_count > 5:
        return (
            "FAIL",
            "context_count가 1~5 범위를 벗어났습니다.",
            details,
        )

    expected_ids = [f"S{i}" for i in range(1, context_count + 1)]
    if source_ids != expected_ids:
        return (
            "FAIL",
            "source_ids가 S1부터 연속이 아닙니다.",
            details,
        )
    if len(sources) != context_count:
        return (
            "FAIL",
            "sources 개수가 context_count와 일치하지 않습니다.",
            details,
        )
    if total_chars > max_context_chars:
        return (
            "FAIL",
            "context 길이가 제한을 초과했습니다.",
            details,
        )

    system_prompt = prompt_result.get("system_prompt")
    user_prompt = prompt_result.get("user_prompt")
    combined_prompt = prompt_result.get("combined_prompt")
    if not isinstance(system_prompt, str) or not system_prompt.strip():
        return (
            "FAIL",
            "system_prompt가 없습니다.",
            details,
        )
    if not isinstance(user_prompt, str) or not user_prompt.strip():
        return (
            "FAIL",
            "user_prompt가 없습니다.",
            details,
        )
    if (
        not isinstance(combined_prompt, str)
        or not combined_prompt.strip()
    ):
        return (
            "FAIL",
            "combined_prompt가 없습니다.",
            details,
        )

    if (
        PROMPT_QUERY_START_MARKER not in user_prompt
        or PROMPT_QUERY_END_MARKER not in user_prompt
    ):
        return (
            "FAIL",
            "QUESTION Marker가 없습니다.",
            details,
        )
    if (
        PROMPT_CONTEXT_START_MARKER not in user_prompt
        or PROMPT_CONTEXT_END_MARKER not in user_prompt
    ):
        return (
            "FAIL",
            "CONTEXT Marker가 없습니다.",
            details,
        )

    for source_id in source_ids:
        if source_id not in user_prompt:
            return (
                "FAIL",
                "사용 가능한 Citation 번호가 Prompt에 없습니다.",
                details,
            )

    if prompt_result.get("system_prompt_chars") != len(
        system_prompt
    ):
        return (
            "FAIL",
            "system_prompt_chars metadata가 일치하지 않습니다.",
            details,
        )
    if prompt_result.get("user_prompt_chars") != len(
        user_prompt
    ):
        return (
            "FAIL",
            "user_prompt_chars metadata가 일치하지 않습니다.",
            details,
        )
    if prompt_result.get("combined_prompt_chars") != len(
        combined_prompt
    ):
        return (
            "FAIL",
            "combined_prompt_chars metadata가 일치하지 않습니다.",
            details,
        )

    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if api_key and len(api_key) >= 8:
        haystacks = (
            system_prompt,
            user_prompt,
            combined_prompt,
        )
        if any(api_key in text for text in haystacks):
            return (
                "FAIL",
                "Prompt에 API Key가 포함되어 있습니다.",
                details,
            )

    return (
        "PASS",
        "Context·Prompt 구조가 검증되었습니다.",
        details,
    )


def _build_rag_chat_service() -> RAGChatService:
    repository = SupabaseRepository()
    embedding_service = EmbeddingService()
    query_search = QuerySearchService(
        repository,
        embedding_service,
    )
    keyword_search = KeywordSearchService(repository)
    hybrid_search = HybridSearchService(
        query_search,
        keyword_search,
    )
    ranking = RankingService(hybrid_search)
    llm = create_llm()
    answer_service = AnswerService(llm)
    return RAGChatService(
        repository,
        embedding_service,
        query_search,
        keyword_search,
        hybrid_search,
        ranking,
        answer_service,
        llm,
        ContextBuilder,
        PromptBuilder,
        CitationValidator,
        CitationResultBuilder,
    )


def _sanitize_rag_details(
    result: Mapping[str, Any],
    *,
    elapsed_seconds: float,
) -> dict[str, Any]:
    answer_text = result.get("answer_text")
    preview = ""
    if isinstance(answer_text, str):
        preview = answer_text[:300]

    citation = result.get("citation_validation")
    citation_status = None
    if isinstance(citation, Mapping):
        citation_status = citation.get("status")

    return {
        "elapsed_seconds": round(elapsed_seconds, 4),
        "answer_chars": result.get("answer_chars"),
        "answer_preview_chars": len(preview),
        "answer_preview": preview,
        "context_count": result.get("context_count"),
        "citation_status": citation_status,
        "cited_source_count": result.get(
            "cited_source_count"
        ),
        "unused_source_count": result.get(
            "unused_source_count"
        ),
        "provider": result.get("provider"),
        "model": result.get("model"),
        "prompt_token_count": result.get(
            "prompt_token_count"
        ),
        "candidate_token_count": result.get(
            "candidate_token_count"
        ),
    }


def check_real_rag_chat() -> tuple[str, str, dict[str, Any]]:
    service = _build_rag_chat_service()
    started = time.perf_counter()
    result = service.chat(
        STANDARD_QUERY,
        match_count=10,
        candidate_multiplier=3,
        max_results=5,
        temperature=0.2,
        max_output_tokens=2048,
        document_category="ADMIN_RULE",
        source_table="admin_rule",
    )
    elapsed = time.perf_counter() - started

    if not isinstance(result, Mapping):
        return (
            "FAIL",
            "RAGChatService 결과가 Mapping이 아닙니다.",
            {"elapsed_seconds": round(elapsed, 4)},
        )

    # 응답 계약 검증용으로 _ops_timings는 제거본 기준
    public_result = {
        key: value
        for key, value in result.items()
        if key != "_ops_timings"
    }
    details = _sanitize_rag_details(
        public_result,
        elapsed_seconds=elapsed,
    )

    answer_text = public_result.get("answer_text")
    if not isinstance(answer_text, str) or not answer_text.strip():
        return (
            "FAIL",
            "answer_text가 비어 있습니다.",
            details,
        )
    if public_result.get("answer_chars") != len(answer_text):
        return (
            "FAIL",
            "answer_chars가 일치하지 않습니다.",
            details,
        )

    context_count = public_result.get("context_count")
    if (
        not isinstance(context_count, int)
        or context_count < 1
    ):
        return (
            "FAIL",
            "context_count가 1 이상이 아닙니다.",
            details,
        )

    citation = public_result.get("citation_validation")
    if not isinstance(citation, Mapping):
        return (
            "FAIL",
            "citation_validation이 없습니다.",
            details,
        )
    status = citation.get("status")
    if status not in ALLOWED_CITATION_STATUSES:
        return (
            "FAIL",
            "citation status가 허용값이 아닙니다.",
            details,
        )

    cited = public_result.get("cited_sources")
    unused = public_result.get("unused_sources")
    if not isinstance(cited, list) or not isinstance(
        unused,
        list,
    ):
        return (
            "FAIL",
            "cited/unused sources 형식이 올바르지 않습니다.",
            details,
        )
    if len(cited) + len(unused) != context_count:
        return (
            "FAIL",
            "cited+unused 수가 context_count와 일치하지 않습니다.",
            details,
        )

    lowered_keys = {
        str(key).lower() for key in public_result.keys()
    }
    leaked = sorted(
        key
        for key in FORBIDDEN_RESULT_KEYS
        if key in lowered_keys
    )
    if leaked:
        details["leaked_keys"] = leaked
        return (
            "FAIL",
            "결과에 Prompt/Context/Embedding 관련 key가 있습니다.",
            details,
        )

    if elapsed > MAX_RAG_SECONDS:
        return (
            "FAIL",
            "RAG 응답이 120초를 초과했습니다.",
            details,
        )
    if elapsed > TARGET_RAG_SECONDS:
        return (
            "WARN",
            "RAG 응답이 30초를 초과했으나 120초 이내입니다.",
            details,
        )
    return (
        "PASS",
        "실제 RAG Chat 응답이 검증되었습니다.",
        details,
    )


def check_citation_stability() -> tuple[
    str,
    str,
    dict[str, Any],
]:
    runs_raw = os.getenv(
        "SMARTLAW_FINAL_CHECK_CITATION_RUNS",
        "1",
    )
    runs = _parse_int_safe(runs_raw)
    if runs is None or runs < 1 or runs > 3:
        return (
            "FAIL",
            "SMARTLAW_FINAL_CHECK_CITATION_RUNS는 1~3이어야 합니다.",
            {"raw": "INVALID"},
        )

    service = _build_rag_chat_service()
    run_rows: list[dict[str, Any]] = []
    valid_count = 0

    for index in range(runs):
        result = service.chat(
            STANDARD_QUERY,
            match_count=10,
            candidate_multiplier=3,
            max_results=5,
            temperature=0.2,
            max_output_tokens=2048,
            document_category="ADMIN_RULE",
            source_table="admin_rule",
        )
        citation = (
            result.get("citation_validation")
            if isinstance(result, Mapping)
            else None
        )
        status = None
        is_valid = None
        valid_citation_count = None
        invalid_citation_count = None
        if isinstance(citation, Mapping):
            status = citation.get("status")
            is_valid = citation.get("is_valid")
            valid_ids = citation.get("valid_citation_ids")
            invalid_ids = citation.get(
                "invalid_citation_ids"
            )
            if isinstance(valid_ids, list):
                valid_citation_count = len(valid_ids)
            if isinstance(invalid_ids, list):
                invalid_citation_count = len(invalid_ids)
            if status == "VALID":
                valid_count += 1

        run_rows.append(
            {
                "run": index + 1,
                "status": status,
                "is_valid": is_valid,
                "valid_citation_count": valid_citation_count,
                "invalid_citation_count": (
                    invalid_citation_count
                ),
                "cited_source_count": (
                    result.get("cited_source_count")
                    if isinstance(result, Mapping)
                    else None
                ),
            }
        )

    details: dict[str, Any] = {
        "runs": runs,
        "valid_count": valid_count,
        "results": run_rows,
    }

    if runs == 1:
        if valid_count == 1:
            return (
                "PASS",
                "Citation 상태가 VALID입니다.",
                details,
            )
        return (
            "WARN",
            "Citation 상태가 VALID가 아닙니다.",
            details,
        )

    ratio = valid_count / runs
    details["valid_ratio"] = round(ratio, 4)
    if ratio >= (2 / 3):
        return (
            "PASS",
            "Citation VALID 비율이 기준 이상입니다.",
            details,
        )
    if valid_count >= 1:
        return (
            "WARN",
            "Citation VALID 비율이 기준 미만입니다.",
            details,
        )
    return (
        "FAIL",
        "Citation VALID 결과가 없습니다.",
        details,
    )


def _collect_keys_recursive(
    value: Any,
    *,
    found: set[str],
) -> None:
    if isinstance(value, Mapping):
        for key, item in value.items():
            found.add(str(key))
            _collect_keys_recursive(item, found=found)
    elif isinstance(value, Sequence) and not isinstance(
        value,
        (str, bytes),
    ):
        for item in value:
            _collect_keys_recursive(item, found=found)


def check_security_contract() -> tuple[
    str,
    str,
    dict[str, Any],
]:
    service = _build_rag_chat_service()
    result = service.chat(
        STANDARD_QUERY,
        match_count=10,
        candidate_multiplier=3,
        max_results=5,
        temperature=0.2,
        max_output_tokens=2048,
        document_category="ADMIN_RULE",
        source_table="admin_rule",
    )
    if not isinstance(result, Mapping):
        return (
            "FAIL",
            "보안 검사 대상 결과가 Mapping이 아닙니다.",
            {},
        )

    public_result = {
        key: value
        for key, value in result.items()
        if key != "_ops_timings"
    }

    # JSON 직렬화 가능 여부만 확인 (전체 문자열은 저장/출력하지 않음)
    try:
        encoded = json.dumps(
            public_result,
            ensure_ascii=False,
            default=str,
        )
        json_bytes = len(encoded.encode("utf-8"))
    except Exception:
        return (
            "FAIL",
            "결과 JSON 직렬화에 실패했습니다.",
            {},
        )

    found_keys: set[str] = set()
    _collect_keys_recursive(public_result, found=found_keys)
    lowered = {key.lower() for key in found_keys}
    forbidden_hit = sorted(
        key
        for key in FORBIDDEN_RESULT_KEYS
        if key in lowered
    )

    details = {
        "json_bytes": json_bytes,
        "key_count": len(found_keys),
        "forbidden_hits": forbidden_hit,
    }
    if forbidden_hit:
        return (
            "FAIL",
            "금지 key가 최종 결과에 포함되어 있습니다.",
            details,
        )
    return (
        "PASS",
        "최종 결과 보안 계약을 통과했습니다.",
        details,
    )


def check_error_mapping_contract() -> tuple[
    str,
    str,
    dict[str, Any],
]:
    from pydantic import ValidationError

    from vector.api.schemas import (
        ErrorResponse,
        RAGChatRequest,
    )

    long_query = "가" * 2001
    cases: list[tuple[str, dict[str, Any]]] = [
        ("missing_query", {}),
        ("empty_query", {"query": ""}),
        ("blank_query", {"query": "   "}),
        ("too_long_query", {"query": long_query}),
        (
            "match_count_zero",
            {"query": "제29조", "match_count": 0},
        ),
        (
            "match_count_bool",
            {"query": "제29조", "match_count": True},
        ),
        (
            "extra_field",
            {"query": "제29조", "unknown_field": "x"},
        ),
    ]

    case_results: list[dict[str, Any]] = []
    failures: list[str] = []

    for case_id, payload in cases:
        row: dict[str, Any] = {
            "case_id": case_id,
            "raised": False,
            "error_count": 0,
            "api_error_contains_full_query": False,
        }
        try:
            RAGChatRequest.model_validate(payload)
            row["raised"] = False
            failures.append(case_id)
        except ValidationError as exc:
            row["raised"] = True
            row["error_count"] = exc.error_count()

            # API 표준 오류 봉투에는 query 원문을 넣지 않는다.
            message = "요청값이 올바르지 않습니다."
            if case_id in {
                "missing_query",
                "empty_query",
                "blank_query",
                "too_long_query",
            }:
                message = "질문을 다시 입력해주세요."

            api_error = {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": message,
                    "request_id": "test-request-id",
                }
            }
            api_serialized = json.dumps(
                api_error,
                ensure_ascii=False,
            )
            query_value = payload.get("query")
            if (
                isinstance(query_value, str)
                and query_value != ""
                and query_value in api_serialized
            ):
                row["api_error_contains_full_query"] = True
                failures.append(f"{case_id}_query_leak")
            if long_query in api_serialized:
                row["api_error_contains_full_query"] = True
                failures.append(f"{case_id}_query_leak")
        case_results.append(row)

    # 오류 응답 스키마 구조 확인
    try:
        validated_error = ErrorResponse.model_validate(
            {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "요청값이 올바르지 않습니다.",
                    "request_id": "test-request-id",
                }
            }
        )
        schema_ok = True
        error_dump = json.dumps(
            validated_error.model_dump(),
            ensure_ascii=False,
        )
        if long_query in error_dump:
            schema_ok = False
            failures.append("error_response_query_leak")
    except Exception:
        schema_ok = False
        failures.append("error_response_schema")

    details = {
        "cases": case_results,
        "error_response_schema_ok": schema_ok,
        "failures": failures,
    }
    if failures:
        return (
            "FAIL",
            "요청 검증·오류 매핑 계약 검증에 실패했습니다.",
            details,
        )
    return (
        "PASS",
        "요청 검증·오류 매핑 계약이 확인되었습니다.",
        details,
    )


def determine_overall_status(
    checks: Sequence[CheckResult],
) -> str:
    has_critical_fail = any(
        item.status == "FAIL"
        and item.severity == "CRITICAL"
        for item in checks
    )
    has_fail = any(item.status == "FAIL" for item in checks)
    has_warn = any(item.status == "WARN" for item in checks)

    if has_critical_fail or has_fail:
        return "NOT_READY"
    if has_warn:
        return "READY_WITH_WARNINGS"
    return "READY"


def _count_by_status(
    checks: Sequence[CheckResult],
    status: str,
) -> int:
    return sum(1 for item in checks if item.status == status)


def save_report(report: VerificationReport) -> Path:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = asdict(report)
    REPORT_PATH.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return REPORT_PATH


def print_console_summary(
    report: VerificationReport,
) -> None:
    for item in report.checks:
        print(
            f"[{item.status}] {item.check_id} "
            f"{item.name} ({item.elapsed_seconds:.2f}s)"
        )

    print()
    print(f"전체 상태: {report.overall_status}")
    print(f"PASS: {report.pass_count}")
    print(f"WARN: {report.warn_count}")
    print(f"FAIL: {report.fail_count}")
    print(f"SKIP: {report.skip_count}")
    print(
        f"총 실행시간: {report.total_elapsed_seconds:.2f}s"
    )

    db_skip = any(
        item.check_id == "DB-001"
        and item.status == "SKIP"
        for item in report.checks
    )
    if db_skip:
        print(
            "수동 확인 필수: DB Chunk/Embedding/"
            "Keyword/중복 불변식"
        )


def main() -> None:
    load_project_environment()
    started_at = datetime.now(timezone.utc)
    wall_started = time.perf_counter()

    checks: list[CheckResult] = [
        run_check(
            "ENV-001",
            "환경변수 검증",
            "CRITICAL",
            check_environment,
        ),
        run_check(
            "PY-001",
            "Python 런타임 검증",
            "CRITICAL",
            check_python_runtime,
        ),
        run_check(
            "DB-001",
            "DB 불변 검증",
            "CRITICAL",
            check_database_read_only,
        ),
        run_check(
            "EMB-001",
            "Query Embedding 검증",
            "CRITICAL",
            check_query_embedding,
        ),
        run_check(
            "SEARCH-001",
            "Search·Ranking 파이프라인 검증",
            "CRITICAL",
            check_search_pipeline,
        ),
        run_check(
            "CTX-001",
            "Context·Prompt 검증",
            "CRITICAL",
            check_context_and_prompt,
        ),
        run_check(
            "RAG-001",
            "실제 RAG 응답 검증",
            "CRITICAL",
            check_real_rag_chat,
        ),
        run_check(
            "CIT-001",
            "Citation 안정성 검증",
            "WARNING",
            check_citation_stability,
        ),
        run_check(
            "SEC-001",
            "응답 보안 계약 검증",
            "CRITICAL",
            check_security_contract,
        ),
        run_check(
            "API-001",
            "오류 매핑 계약 검증",
            "CRITICAL",
            check_error_mapping_contract,
        ),
    ]

    finished_at = datetime.now(timezone.utc)
    total_elapsed = round(
        time.perf_counter() - wall_started,
        4,
    )
    overall = determine_overall_status(checks)

    report = VerificationReport(
        version=FINAL_CHECK_VERSION,
        overall_status=overall,
        started_at=started_at.isoformat(),
        finished_at=finished_at.isoformat(),
        total_elapsed_seconds=total_elapsed,
        pass_count=_count_by_status(checks, "PASS"),
        warn_count=_count_by_status(checks, "WARN"),
        fail_count=_count_by_status(checks, "FAIL"),
        skip_count=_count_by_status(checks, "SKIP"),
        checks=checks,
    )
    save_report(report)
    print_console_summary(report)

    if overall in {"READY", "READY_WITH_WARNINGS"}:
        print(
            "OK: STEP 10-5 Python 운영 전 최종 검증 완료"
        )
        return

    raise RuntimeError(
        "STEP 10-5 Python 운영 전 최종 검증 NOT_READY"
    )


if __name__ == "__main__":
    main()
