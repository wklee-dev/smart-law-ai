# admin_rule_quality_test.py
#
# 역할: 행정규칙 smartlaw_chunk 적재·검색·답변·Citation
#       품질을 읽기 전용으로 검증한다. 운영 코드는 수정하지 않는다.

from __future__ import annotations

import json
import math
import os
import time
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass, field
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
from vector.quality.admin_rule_quality_cases import (
    QUALITY_CASES,
    QualityCase,
)
from vector.rag.answer_service import AnswerService
from vector.rag.citation_result_builder import (
    CitationResultBuilder,
)
from vector.rag.citation_validator import (
    CitationValidator,
)
from vector.rag.context_builder import ContextBuilder
from vector.rag.prompt_builder import PromptBuilder
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

EXPECTED_CHUNK_COUNT = 740
EXPECTED_EMBEDDING_DIMENSION = 768

QUALITY_REPORT_PATH = (
    PROJECT_ROOT
    / "data"
    / "quality"
    / "admin-rule-quality-report.json"
)

MAX_QUERY_SECONDS = 120.0
TARGET_QUERY_SECONDS = 30.0

QUALITY_VERSION = "1.0"

ALLOWED_CITATION_STATUSES = frozenset(
    {
        "VALID",
        "NO_CITATIONS",
        "INVALID_CITATIONS",
        "MIXED_CITATIONS",
    }
)

FORBIDDEN_RESULT_KEYS = frozenset(
    {
        "system_prompt",
        "user_prompt",
        "combined_prompt",
        "context_text",
        "embedding",
        "api_key",
        "authorization",
        "cookie",
        "password",
        "secret",
    }
)

DEFAULT_RAG_CASE_IDS = frozenset(
    {
        "GENERAL_USAGE_APPROVAL",
        "ARTICLE_29",
        "LOW_EVIDENCE",
    }
)

FULL_QUALITY_ENV = "SMARTLAW_RUN_FULL_ADMIN_RULE_QUALITY_TEST"
FULL_QUALITY_VALUE = "YES"


@dataclass
class QualityCheck:
    check_id: str
    category: str
    status: str
    message: str
    elapsed_seconds: float
    details: dict[str, Any] = field(
        default_factory=dict
    )


@dataclass
class QualityReport:
    version: str
    overall_status: str
    pass_count: int
    warn_count: int
    fail_count: int
    skip_count: int
    total_elapsed_seconds: float
    checks: list[QualityCheck]
    summary: dict[str, Any] = field(
        default_factory=dict
    )


def load_project_environment() -> None:
    if ENV_LOCAL_PATH.is_file():
        load_dotenv(ENV_LOCAL_PATH, override=False)
    if ENV_PATH.is_file():
        load_dotenv(ENV_PATH, override=False)


def _contains_any_term(
    text: object,
    terms: Sequence[str],
) -> bool:
    if not isinstance(text, str) or not text:
        return False
    return any(term in text for term in terms)


def _top_rows(
    results: Sequence[Mapping[str, Any]],
    limit: int = 5,
) -> list[Mapping[str, Any]]:
    return list(results[:limit])


def _match_law_name(
    rows: Sequence[Mapping[str, Any]],
    terms: Sequence[str],
) -> bool:
    return any(
        _contains_any_term(row.get("law_name"), terms)
        for row in rows
    )


def _match_article(
    rows: Sequence[Mapping[str, Any]],
    terms: Sequence[str],
) -> bool:
    for row in rows:
        for field_name in (
            "article_no",
            "title",
            "header",
        ):
            if _contains_any_term(
                row.get(field_name),
                terms,
            ):
                return True
    return False


def _match_title(
    rows: Sequence[Mapping[str, Any]],
    terms: Sequence[str],
) -> bool:
    for row in rows:
        for field_name in ("title", "header"):
            if _contains_any_term(
                row.get(field_name),
                terms,
            ):
                return True
    return False


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


def _build_ranking_service() -> RankingService:
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
    return RankingService(hybrid_search)


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


def check_database_invariants() -> QualityCheck:
    started = time.perf_counter()
    details = {
        "manual_sql_required": True,
        "expected": {
            "total_chunks": EXPECTED_CHUNK_COUNT,
            "embedded_chunks": EXPECTED_CHUNK_COUNT,
            "valid_dimension_chunks": EXPECTED_CHUNK_COUNT,
            "keyword_chunks": EXPECTED_CHUNK_COUNT,
            "duplicate_source_pk_count": 0,
            "empty_body_count": 0,
            "empty_law_name_count": 0,
            "empty_document_category_count": 0,
            "empty_chunk_type_count": 0,
        },
        "available_public_methods": [
            "get_admin_rule_batch_statistics",
        ],
        "missing_verification_methods": [
            "article_chunk_quality_invariants",
            "keyword_cardinality_count",
            "duplicate_source_pk_count",
            "empty_metadata_counts",
            "embedding_dimension_count",
        ],
        "manual_checks": [
            "total_chunks = 740",
            "embedded_chunks = 740",
            "valid_dimension_chunks = 740",
            "keyword_chunks = 740",
            "duplicate_source_pk_count = 0",
            "empty_body/law_name/document_category/chunk_type = 0",
        ],
    }
    return QualityCheck(
        check_id="DB-QUALITY",
        category="DATABASE",
        status="SKIP",
        message=(
            "Repository에 읽기 전용 품질 집계 메서드가 없어 "
            "DB 수동 검증이 필요합니다."
        ),
        elapsed_seconds=round(
            time.perf_counter() - started,
            4,
        ),
        details=details,
    )


def check_embedding_sample() -> QualityCheck:
    started = time.perf_counter()
    query = QUALITY_CASES[0]["query"]
    details: dict[str, Any] = {
        "expected_dimension": EXPECTED_EMBEDDING_DIMENSION,
    }
    try:
        service = EmbeddingService()
        vector = service.generate_query_embedding(query)
    except Exception as exc:
        return QualityCheck(
            check_id="EMB-SAMPLE",
            category="EMBEDDING",
            status="FAIL",
            message="Query Embedding 생성에 실패했습니다.",
            elapsed_seconds=round(
                time.perf_counter() - started,
                4,
            ),
            details={
                "exception_type": type(exc).__name__,
            },
        )

    if not isinstance(vector, Sequence) or isinstance(
        vector,
        (str, bytes),
    ):
        return QualityCheck(
            check_id="EMB-SAMPLE",
            category="EMBEDDING",
            status="FAIL",
            message="Embedding 결과가 Sequence가 아닙니다.",
            elapsed_seconds=round(
                time.perf_counter() - started,
                4,
            ),
            details=details,
        )

    values = list(vector)
    details["length"] = len(values)
    if len(values) != EXPECTED_EMBEDDING_DIMENSION:
        return QualityCheck(
            check_id="EMB-SAMPLE",
            category="EMBEDDING",
            status="FAIL",
            message="Embedding 차원이 768이 아닙니다.",
            elapsed_seconds=round(
                time.perf_counter() - started,
                4,
            ),
            details=details,
        )

    norm_sq = 0.0
    for value in values:
        if isinstance(value, bool) or not isinstance(
            value,
            (int, float),
        ):
            return QualityCheck(
                check_id="EMB-SAMPLE",
                category="EMBEDDING",
                status="FAIL",
                message="Embedding에 숫자가 아닌 값이 있습니다.",
                elapsed_seconds=round(
                    time.perf_counter() - started,
                    4,
                ),
                details=details,
            )
        number = float(value)
        if not math.isfinite(number):
            return QualityCheck(
                check_id="EMB-SAMPLE",
                category="EMBEDDING",
                status="FAIL",
                message="Embedding에 NaN 또는 Infinity가 있습니다.",
                elapsed_seconds=round(
                    time.perf_counter() - started,
                    4,
                ),
                details=details,
            )
        norm_sq += number * number

    details["norm_is_nonzero"] = norm_sq > 0.0
    if norm_sq <= 0.0:
        return QualityCheck(
            check_id="EMB-SAMPLE",
            category="EMBEDDING",
            status="FAIL",
            message="Embedding norm이 0입니다.",
            elapsed_seconds=round(
                time.perf_counter() - started,
                4,
            ),
            details=details,
        )

    return QualityCheck(
        check_id="EMB-SAMPLE",
        category="EMBEDDING",
        status="PASS",
        message="Query Embedding 샘플 검증을 통과했습니다.",
        elapsed_seconds=round(
            time.perf_counter() - started,
            4,
        ),
        details=details,
    )


def run_search_quality_case(
    case: QualityCase,
    ranking_service: RankingService,
) -> QualityCheck:
    started = time.perf_counter()
    case_id = str(case["case_id"])
    query = str(case["query"])
    low_evidence = bool(case.get("low_evidence", False))

    try:
        results = ranking_service.search(
            query,
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
    except Exception as exc:
        return QualityCheck(
            check_id=f"SEARCH-{case_id}",
            category=str(case.get("category", "SEARCH")),
            status="FAIL",
            message="검색 실행 중 예외가 발생했습니다.",
            elapsed_seconds=round(
                time.perf_counter() - started,
                4,
            ),
            details={
                "exception_type": type(exc).__name__,
            },
        )

    details: dict[str, Any] = {
        "result_count": (
            len(results) if isinstance(results, list) else None
        ),
        "expectation_matches": {},
    }

    if not isinstance(results, list):
        return QualityCheck(
            check_id=f"SEARCH-{case_id}",
            category=str(case.get("category", "SEARCH")),
            status="FAIL",
            message="검색 결과가 list가 아닙니다.",
            elapsed_seconds=round(
                time.perf_counter() - started,
                4,
            ),
            details=details,
        )

    if len(results) < 1 or len(results) > 10:
        return QualityCheck(
            check_id=f"SEARCH-{case_id}",
            category=str(case.get("category", "SEARCH")),
            status="FAIL",
            message="검색 결과 건수가 허용 범위를 벗어났습니다.",
            elapsed_seconds=round(
                time.perf_counter() - started,
                4,
            ),
            details=details,
        )

    ids = [row.get("id") for row in results]
    source_pks = [row.get("source_pk") for row in results]
    if len(ids) != len(set(ids)):
        return QualityCheck(
            check_id=f"SEARCH-{case_id}",
            category=str(case.get("category", "SEARCH")),
            status="FAIL",
            message="검색 결과에 id 중복이 있습니다.",
            elapsed_seconds=round(
                time.perf_counter() - started,
                4,
            ),
            details=details,
        )
    if len(source_pks) != len(set(source_pks)):
        return QualityCheck(
            check_id=f"SEARCH-{case_id}",
            category=str(case.get("category", "SEARCH")),
            status="FAIL",
            message="검색 결과에 source_pk 중복이 있습니다.",
            elapsed_seconds=round(
                time.perf_counter() - started,
                4,
            ),
            details=details,
        )

    for row in results:
        score = row.get("ranking_score")
        if isinstance(score, bool) or not isinstance(
            score,
            (int, float),
        ):
            return QualityCheck(
                check_id=f"SEARCH-{case_id}",
                category=str(case.get("category", "SEARCH")),
                status="FAIL",
                message="ranking_score 형식이 올바르지 않습니다.",
                elapsed_seconds=round(
                    time.perf_counter() - started,
                    4,
                ),
                details=details,
            )
        number = float(score)
        if number < 0.0 or number > 1.0:
            return QualityCheck(
                check_id=f"SEARCH-{case_id}",
                category=str(case.get("category", "SEARCH")),
                status="FAIL",
                message="ranking_score가 0~1 범위를 벗어났습니다.",
                elapsed_seconds=round(
                    time.perf_counter() - started,
                    4,
                ),
                details=details,
            )
        if row.get("source_table") != "admin_rule":
            return QualityCheck(
                check_id=f"SEARCH-{case_id}",
                category=str(case.get("category", "SEARCH")),
                status="FAIL",
                message="source_table이 admin_rule이 아닙니다.",
                elapsed_seconds=round(
                    time.perf_counter() - started,
                    4,
                ),
                details=details,
            )
        if row.get("document_category") != "ADMIN_RULE":
            return QualityCheck(
                check_id=f"SEARCH-{case_id}",
                category=str(case.get("category", "SEARCH")),
                status="FAIL",
                message="document_category가 ADMIN_RULE이 아닙니다.",
                elapsed_seconds=round(
                    time.perf_counter() - started,
                    4,
                ),
                details=details,
            )
        if row.get("chunk_type") != "ARTICLE":
            return QualityCheck(
                check_id=f"SEARCH-{case_id}",
                category=str(case.get("category", "SEARCH")),
                status="FAIL",
                message="chunk_type이 ARTICLE이 아닙니다.",
                elapsed_seconds=round(
                    time.perf_counter() - started,
                    4,
                ),
                details=details,
            )

    top = _top_rows(results, 5)
    details["top_ids"] = [row.get("id") for row in top]
    details["top_source_pks"] = [
        row.get("source_pk") for row in top
    ]
    details["top_law_names"] = [
        row.get("law_name") for row in top
    ]
    details["top_article_nos"] = [
        row.get("article_no") for row in top
    ]
    details["top_titles"] = [
        row.get("title") or row.get("header") for row in top
    ]
    details["top_scores"] = [
        round(float(row["ranking_score"]), 4)
        for row in top
    ]

    expectation_matches: dict[str, bool] = {}
    if not low_evidence:
        law_terms = case.get("expected_law_name_terms")
        if law_terms:
            matched = _match_law_name(top, law_terms)
            expectation_matches["law_name"] = matched
            if not matched:
                details["expectation_matches"] = (
                    expectation_matches
                )
                return QualityCheck(
                    check_id=f"SEARCH-{case_id}",
                    category=str(
                        case.get("category", "SEARCH")
                    ),
                    status="FAIL",
                    message=(
                        "상위 결과에 기대 law_name term이 "
                        "없습니다."
                    ),
                    elapsed_seconds=round(
                        time.perf_counter() - started,
                        4,
                    ),
                    details=details,
                )

        article_terms = case.get("expected_article_terms")
        if article_terms:
            matched = _match_article(top, article_terms)
            expectation_matches["article"] = matched
            if not matched:
                details["expectation_matches"] = (
                    expectation_matches
                )
                return QualityCheck(
                    check_id=f"SEARCH-{case_id}",
                    category=str(
                        case.get("category", "SEARCH")
                    ),
                    status="FAIL",
                    message=(
                        "상위 결과에 기대 article term이 "
                        "없습니다."
                    ),
                    elapsed_seconds=round(
                        time.perf_counter() - started,
                        4,
                    ),
                    details=details,
                )

        title_terms = case.get("expected_title_terms")
        if title_terms:
            matched = _match_title(top, title_terms)
            expectation_matches["title"] = matched
            if not matched:
                details["expectation_matches"] = (
                    expectation_matches
                )
                return QualityCheck(
                    check_id=f"SEARCH-{case_id}",
                    category=str(
                        case.get("category", "SEARCH")
                    ),
                    status="FAIL",
                    message=(
                        "상위 결과에 기대 title/header term이 "
                        "없습니다."
                    ),
                    elapsed_seconds=round(
                        time.perf_counter() - started,
                        4,
                    ),
                    details=details,
                )

    details["expectation_matches"] = expectation_matches
    return QualityCheck(
        check_id=f"SEARCH-{case_id}",
        category=str(case.get("category", "SEARCH")),
        status="PASS",
        message="검색 품질 검증을 통과했습니다.",
        elapsed_seconds=round(
            time.perf_counter() - started,
            4,
        ),
        details=details,
    )


def _check_metadata_consistency(
    sources: Sequence[Mapping[str, Any]],
) -> tuple[bool, str, dict[str, Any]]:
    for source in sources:
        citation_id = source.get("citation_id")
        if not isinstance(citation_id, str) or not citation_id.strip():
            return (
                False,
                "citation_id가 비어 있습니다.",
                {},
            )
        source_id = source.get("id")
        if (
            isinstance(source_id, bool)
            or not isinstance(source_id, int)
            or source_id < 1
        ):
            return False, "id가 양의 int가 아닙니다.", {}
        source_pk = source.get("source_pk")
        if (
            isinstance(source_pk, bool)
            or not isinstance(source_pk, int)
            or source_pk < 1
        ):
            return (
                False,
                "source_pk가 양의 int가 아닙니다.",
                {},
            )
        law_name = source.get("law_name")
        if not isinstance(law_name, str) or not law_name.strip():
            return False, "law_name이 비어 있습니다.", {}
        score = source.get("ranking_score")
        if isinstance(score, bool) or not isinstance(
            score,
            (int, float),
        ):
            return (
                False,
                "ranking_score 형식이 올바르지 않습니다.",
                {},
            )
        number = float(score)
        if number < 0.0 or number > 1.0:
            return (
                False,
                "ranking_score가 0~1 범위를 벗어났습니다.",
                {},
            )
        if source.get("cited") is not True:
            return False, "cited가 True가 아닙니다.", {}
        citation_count = source.get("citation_count")
        if (
            isinstance(citation_count, bool)
            or not isinstance(citation_count, int)
            or citation_count < 1
        ):
            return (
                False,
                "citation_count가 1 이상이 아닙니다.",
                {},
            )
        has_article = isinstance(
            source.get("article_no"),
            str,
        ) and bool(str(source.get("article_no")).strip())
        has_title = isinstance(
            source.get("title"),
            str,
        ) and bool(str(source.get("title")).strip())
        has_header = isinstance(
            source.get("header"),
            str,
        ) and bool(str(source.get("header")).strip())
        if not (has_article or has_title or has_header):
            return (
                False,
                "article_no/title/header가 모두 없습니다.",
                {},
            )
        for forbidden in (
            "body",
            "chunk_text",
            "embedding",
        ):
            if forbidden in source:
                return (
                    False,
                    f"결과에 {forbidden}가 포함되어 있습니다.",
                    {"forbidden_key": forbidden},
                )
    return True, "출처 Metadata가 정상입니다.", {}


def run_rag_quality_case(
    case: QualityCase,
    rag_service: RAGChatService,
) -> list[QualityCheck]:
    started = time.perf_counter()
    case_id = str(case["case_id"])
    query = str(case["query"])
    category = str(case.get("category", "RAG"))
    low_evidence = bool(case.get("low_evidence", False))
    require_valid = bool(
        case.get("require_valid_citation", False)
    )
    minimum_context = int(
        case.get("minimum_context_count", 1)
    )
    checks: list[QualityCheck] = []

    try:
        result = rag_service.chat(
            query,
            match_count=10,
            candidate_multiplier=3,
            max_results=5,
            temperature=0.2,
            max_output_tokens=2048,
            document_category="ADMIN_RULE",
            source_table="admin_rule",
        )
    except Exception as exc:
        checks.append(
            QualityCheck(
                check_id=f"RAG-{case_id}",
                category=category,
                status="FAIL",
                message="RAG 실행 중 예외가 발생했습니다.",
                elapsed_seconds=round(
                    time.perf_counter() - started,
                    4,
                ),
                details={
                    "exception_type": type(exc).__name__,
                },
            )
        )
        return checks

    elapsed = time.perf_counter() - started
    if not isinstance(result, Mapping):
        checks.append(
            QualityCheck(
                check_id=f"RAG-{case_id}",
                category=category,
                status="FAIL",
                message="RAG 결과가 Mapping이 아닙니다.",
                elapsed_seconds=round(elapsed, 4),
                details={},
            )
        )
        return checks

    public_result = {
        key: value
        for key, value in result.items()
        if key != "_ops_timings"
    }

    answer_text = public_result.get("answer_text")
    preview = (
        answer_text[:300]
        if isinstance(answer_text, str)
        else ""
    )
    citation = public_result.get("citation_validation")
    citation_status = (
        citation.get("status")
        if isinstance(citation, Mapping)
        else None
    )
    details: dict[str, Any] = {
        "elapsed_seconds": round(elapsed, 4),
        "answer_chars": public_result.get("answer_chars"),
        "answer_preview": preview,
        "context_count": public_result.get("context_count"),
        "citation_status": citation_status,
        "cited_source_count": public_result.get(
            "cited_source_count"
        ),
        "unused_source_count": public_result.get(
            "unused_source_count"
        ),
        "low_evidence": low_evidence,
    }

    if public_result.get("query") != query:
        checks.append(
            QualityCheck(
                check_id=f"RAG-{case_id}",
                category=category,
                status="FAIL",
                message="결과 query가 입력과 일치하지 않습니다.",
                elapsed_seconds=round(elapsed, 4),
                details=details,
            )
        )
        return checks

    if not isinstance(answer_text, str) or not answer_text.strip():
        checks.append(
            QualityCheck(
                check_id=f"RAG-{case_id}",
                category=category,
                status="FAIL",
                message="answer_text가 비어 있습니다.",
                elapsed_seconds=round(elapsed, 4),
                details=details,
            )
        )
        return checks

    if public_result.get("answer_chars") != len(answer_text):
        checks.append(
            QualityCheck(
                check_id=f"RAG-{case_id}",
                category=category,
                status="FAIL",
                message="answer_chars가 일치하지 않습니다.",
                elapsed_seconds=round(elapsed, 4),
                details=details,
            )
        )
        return checks

    context_count = public_result.get("context_count")
    if (
        not isinstance(context_count, int)
        or context_count < minimum_context
    ):
        checks.append(
            QualityCheck(
                check_id=f"RAG-{case_id}",
                category=category,
                status="FAIL",
                message=(
                    "context_count가 minimum_context_count "
                    "미만입니다."
                ),
                elapsed_seconds=round(elapsed, 4),
                details=details,
            )
        )
        return checks

    if not isinstance(citation, Mapping):
        checks.append(
            QualityCheck(
                check_id=f"RAG-{case_id}",
                category=category,
                status="FAIL",
                message="citation_validation이 없습니다.",
                elapsed_seconds=round(elapsed, 4),
                details=details,
            )
        )
        return checks

    if citation_status not in ALLOWED_CITATION_STATUSES:
        checks.append(
            QualityCheck(
                check_id=f"RAG-{case_id}",
                category=category,
                status="FAIL",
                message="citation status가 허용값이 아닙니다.",
                elapsed_seconds=round(elapsed, 4),
                details=details,
            )
        )
        return checks

    cited = public_result.get("cited_sources")
    unused = public_result.get("unused_sources")
    if not isinstance(cited, list) or not isinstance(
        unused,
        list,
    ):
        checks.append(
            QualityCheck(
                check_id=f"RAG-{case_id}",
                category=category,
                status="FAIL",
                message="cited/unused sources 형식이 올바르지 않습니다.",
                elapsed_seconds=round(elapsed, 4),
                details=details,
            )
        )
        return checks

    if len(cited) + len(unused) != context_count:
        checks.append(
            QualityCheck(
                check_id=f"RAG-{case_id}",
                category=category,
                status="FAIL",
                message=(
                    "cited+unused 수가 context_count와 "
                    "일치하지 않습니다."
                ),
                elapsed_seconds=round(elapsed, 4),
                details=details,
            )
        )
        return checks

    if require_valid and not low_evidence:
        valid_ids = citation.get("valid_citation_ids")
        invalid_ids = citation.get("invalid_citation_ids")
        if (
            citation_status != "VALID"
            or citation.get("is_valid") is not True
            or not isinstance(valid_ids, list)
            or len(valid_ids) < 1
            or (
                isinstance(invalid_ids, list)
                and len(invalid_ids) > 0
            )
            or len(cited) < 1
        ):
            checks.append(
                QualityCheck(
                    check_id=f"RAG-{case_id}",
                    category=category,
                    status="FAIL",
                    message="VALID Citation 조건을 충족하지 않습니다.",
                    elapsed_seconds=round(elapsed, 4),
                    details=details,
                )
            )
            return checks

    citation_ids = [
        source.get("citation_id") for source in cited
    ]
    if len(citation_ids) != len(set(citation_ids)):
        checks.append(
            QualityCheck(
                check_id=f"RAG-{case_id}",
                category=category,
                status="FAIL",
                message="cited_sources citation_id 중복이 있습니다.",
                elapsed_seconds=round(elapsed, 4),
                details=details,
            )
        )
        return checks

    for source in cited:
        if source.get("source_table") != "admin_rule":
            checks.append(
                QualityCheck(
                    check_id=f"RAG-{case_id}",
                    category=category,
                    status="FAIL",
                    message="cited source_table이 admin_rule이 아닙니다.",
                    elapsed_seconds=round(elapsed, 4),
                    details=details,
                )
            )
            return checks
        if source.get("document_category") != "ADMIN_RULE":
            checks.append(
                QualityCheck(
                    check_id=f"RAG-{case_id}",
                    category=category,
                    status="FAIL",
                    message=(
                        "cited document_category가 "
                        "ADMIN_RULE이 아닙니다."
                    ),
                    elapsed_seconds=round(elapsed, 4),
                    details=details,
                )
            )
            return checks

    all_sources = list(cited) + list(unused)
    if not low_evidence:
        law_terms = case.get("expected_law_name_terms")
        if law_terms and not _match_law_name(
            all_sources,
            law_terms,
        ):
            checks.append(
                QualityCheck(
                    check_id=f"RAG-{case_id}",
                    category=category,
                    status="FAIL",
                    message=(
                        "출처 Metadata에 기대 law_name term이 "
                        "없습니다."
                    ),
                    elapsed_seconds=round(elapsed, 4),
                    details=details,
                )
            )
            return checks

        article_terms = case.get("expected_article_terms")
        if article_terms and not _match_article(
            all_sources,
            article_terms,
        ):
            checks.append(
                QualityCheck(
                    check_id=f"RAG-{case_id}",
                    category=category,
                    status="FAIL",
                    message=(
                        "출처 Metadata에 기대 article term이 "
                        "없습니다."
                    ),
                    elapsed_seconds=round(elapsed, 4),
                    details=details,
                )
            )
            return checks

        title_terms = case.get("expected_title_terms")
        if title_terms and not _match_title(
            all_sources,
            title_terms,
        ):
            checks.append(
                QualityCheck(
                    check_id=f"RAG-{case_id}",
                    category=category,
                    status="FAIL",
                    message=(
                        "출처 Metadata에 기대 title/header "
                        "term이 없습니다."
                    ),
                    elapsed_seconds=round(elapsed, 4),
                    details=details,
                )
            )
            return checks

    if elapsed > MAX_QUERY_SECONDS:
        status = "FAIL"
        message = "RAG 응답이 120초를 초과했습니다."
    elif elapsed > TARGET_QUERY_SECONDS:
        status = "WARN"
        message = (
            "RAG 응답이 30초를 초과했으나 120초 이내입니다."
        )
    else:
        status = "PASS"
        message = (
            "근거 부족 질문 품질 검증을 통과했습니다."
            if low_evidence
            else "답변 품질 검증을 통과했습니다."
        )

    checks.append(
        QualityCheck(
            check_id=f"RAG-{case_id}",
            category=category,
            status=status,
            message=message,
            elapsed_seconds=round(elapsed, 4),
            details=details,
        )
    )

    # 검증 E: 보안 key
    found_keys: set[str] = set()
    _collect_keys_recursive(public_result, found=found_keys)
    lowered = {key.lower() for key in found_keys}
    forbidden_hits = sorted(
        key
        for key in FORBIDDEN_RESULT_KEYS
        if key in lowered
    )
    checks.append(
        QualityCheck(
            check_id=f"SEC-{case_id}",
            category="SECURITY",
            status="FAIL" if forbidden_hits else "PASS",
            message=(
                "금지 key가 최종 결과에 포함되어 있습니다."
                if forbidden_hits
                else "응답 보안 key 검사를 통과했습니다."
            ),
            elapsed_seconds=0.0,
            details={
                "forbidden_hits": forbidden_hits,
                "key_count": len(found_keys),
            },
        )
    )

    # 검증 F: Metadata consistency (cited only when cited exists)
    if cited:
        ok, meta_message, meta_details = (
            _check_metadata_consistency(cited)
        )
        checks.append(
            QualityCheck(
                check_id=f"META-{case_id}",
                category="METADATA",
                status="PASS" if ok else "FAIL",
                message=meta_message,
                elapsed_seconds=0.0,
                details=meta_details,
            )
        )
    elif require_valid and not low_evidence:
        checks.append(
            QualityCheck(
                check_id=f"META-{case_id}",
                category="METADATA",
                status="FAIL",
                message="cited_sources가 비어 있습니다.",
                elapsed_seconds=0.0,
                details={},
            )
        )
    else:
        checks.append(
            QualityCheck(
                check_id=f"META-{case_id}",
                category="METADATA",
                status="PASS",
                message=(
                    "cited_sources가 없어 Metadata 상세 검사를 "
                    "생략했습니다."
                ),
                elapsed_seconds=0.0,
                details={"cited_source_count": 0},
            )
        )

    return checks


def determine_overall_status(
    checks: Sequence[QualityCheck],
) -> str:
    has_fail = any(item.status == "FAIL" for item in checks)
    has_warn = any(item.status == "WARN" for item in checks)
    if has_fail:
        return "NOT_READY"
    if has_warn:
        return "READY_WITH_WARNINGS"
    return "READY"


def _count_status(
    checks: Sequence[QualityCheck],
    status: str,
) -> int:
    return sum(1 for item in checks if item.status == status)


def _build_summary(
    checks: Sequence[QualityCheck],
    *,
    selected_cases: Sequence[QualityCase],
) -> dict[str, Any]:
    search_checks = [
        item
        for item in checks
        if item.check_id.startswith("SEARCH-")
    ]
    rag_checks = [
        item
        for item in checks
        if item.check_id.startswith("RAG-")
    ]
    search_pass = sum(
        1 for item in search_checks if item.status == "PASS"
    )
    rag_pass = sum(
        1 for item in rag_checks if item.status == "PASS"
    )
    valid_citation_cases = 0
    rag_elapsed: list[float] = []
    context_counts: list[int] = []
    cited_counts: list[int] = []
    law_matches = 0
    law_total = 0
    title_matches = 0
    title_total = 0
    citation_valid = 0
    citation_total = 0

    for case in selected_cases:
        case_id = case["case_id"]
        search_item = next(
            (
                item
                for item in search_checks
                if item.check_id == f"SEARCH-{case_id}"
            ),
            None,
        )
        rag_item = next(
            (
                item
                for item in rag_checks
                if item.check_id == f"RAG-{case_id}"
            ),
            None,
        )
        if search_item is not None:
            matches = search_item.details.get(
                "expectation_matches",
                {},
            )
            if isinstance(matches, dict):
                if "law_name" in matches:
                    law_total += 1
                    if matches.get("law_name") is True:
                        law_matches += 1
                if "title" in matches or "article" in matches:
                    title_total += 1
                    if (
                        matches.get("title") is True
                        or matches.get("article") is True
                    ):
                        title_matches += 1

        if rag_item is not None:
            rag_elapsed.append(rag_item.elapsed_seconds)
            context_count = rag_item.details.get(
                "context_count"
            )
            if isinstance(context_count, int):
                context_counts.append(context_count)
            cited_count = rag_item.details.get(
                "cited_source_count"
            )
            if isinstance(cited_count, int):
                cited_counts.append(cited_count)
            citation_status = rag_item.details.get(
                "citation_status"
            )
            if citation_status is not None:
                citation_total += 1
                if citation_status == "VALID":
                    citation_valid += 1
                    valid_citation_cases += 1

    def _avg(values: Sequence[float | int]) -> float | None:
        if not values:
            return None
        return round(sum(values) / len(values), 4)

    return {
        "total_cases": len(selected_cases),
        "search_pass_cases": search_pass,
        "rag_pass_cases": rag_pass,
        "valid_citation_cases": valid_citation_cases,
        "warning_cases": _count_status(checks, "WARN"),
        "failure_cases": _count_status(checks, "FAIL"),
        "average_elapsed_seconds": _avg(rag_elapsed),
        "average_context_count": _avg(context_counts),
        "average_cited_source_count": _avg(cited_counts),
        "law_name_match_rate": (
            round(law_matches / law_total, 4)
            if law_total
            else None
        ),
        "article_or_title_match_rate": (
            round(title_matches / title_total, 4)
            if title_total
            else None
        ),
        "citation_valid_rate": (
            round(citation_valid / citation_total, 4)
            if citation_total
            else None
        ),
    }


def save_report(report: QualityReport) -> Path:
    QUALITY_REPORT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )
    QUALITY_REPORT_PATH.write_text(
        json.dumps(
            asdict(report),
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return QUALITY_REPORT_PATH


def print_console_summary(report: QualityReport) -> None:
    for item in report.checks:
        print(
            f"[{item.status}] {item.check_id} "
            f"{item.message}"
        )

    manual_db = any(
        item.check_id == "DB-QUALITY"
        and item.status == "SKIP"
        for item in report.checks
    )
    citation_rate = report.summary.get(
        "citation_valid_rate"
    )
    avg_elapsed = report.summary.get(
        "average_elapsed_seconds"
    )

    print()
    print(f"전체 상태: {report.overall_status}")
    print(f"PASS: {report.pass_count}")
    print(f"WARN: {report.warn_count}")
    print(f"FAIL: {report.fail_count}")
    print(f"SKIP: {report.skip_count}")
    print(
        "평균 응답시간: "
        f"{avg_elapsed if avg_elapsed is not None else 'N/A'}"
    )
    print(
        "Citation VALID 비율: "
        f"{citation_rate if citation_rate is not None else 'N/A'}"
    )
    print(
        "수동 DB 검증 필요 여부: "
        f"{'YES' if manual_db else 'NO'}"
    )


def _selected_rag_cases() -> tuple[QualityCase, ...]:
    if (
        os.getenv(FULL_QUALITY_ENV, "").strip().upper()
        == FULL_QUALITY_VALUE
    ):
        return QUALITY_CASES
    return tuple(
        case
        for case in QUALITY_CASES
        if case["case_id"] in DEFAULT_RAG_CASE_IDS
    )


def main() -> None:
    load_project_environment()
    wall_started = time.perf_counter()
    checks: list[QualityCheck] = []

    checks.append(check_database_invariants())
    checks.append(check_embedding_sample())

    ranking_service = _build_ranking_service()
    for case in QUALITY_CASES:
        checks.append(
            run_search_quality_case(
                case,
                ranking_service,
            )
        )

    selected_cases = _selected_rag_cases()
    rag_service = _build_rag_chat_service()
    for case in selected_cases:
        checks.extend(
            run_rag_quality_case(
                case,
                rag_service,
            )
        )

    overall = determine_overall_status(checks)
    summary = _build_summary(
        checks,
        selected_cases=selected_cases,
    )
    report = QualityReport(
        version=QUALITY_VERSION,
        overall_status=overall,
        pass_count=_count_status(checks, "PASS"),
        warn_count=_count_status(checks, "WARN"),
        fail_count=_count_status(checks, "FAIL"),
        skip_count=_count_status(checks, "SKIP"),
        total_elapsed_seconds=round(
            time.perf_counter() - wall_started,
            4,
        ),
        checks=checks,
        summary=summary,
    )
    save_report(report)
    print_console_summary(report)

    if overall in {"READY", "READY_WITH_WARNINGS"}:
        print(
            "OK: STEP 10-6 행정규칙 데이터 품질 검증 완료"
        )
        return

    raise RuntimeError(
        "STEP 10-6 행정규칙 데이터 품질 검증 NOT_READY"
    )


if __name__ == "__main__":
    main()
