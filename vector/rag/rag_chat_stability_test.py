# rag_chat_stability_test.py
#
# 역할: RAGChatService 계약·1회 실행·파라미터·예외·회귀·DB 불변을
#       검증하는 안정화 테스트.

from __future__ import annotations

import copy
import os
import time
from collections.abc import Mapping, Sequence
from typing import Any

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
from vector.search.ranking_service import (
    RankingService,
)

FULL_STABILITY_CONFIRM_ENV = (
    "SMARTLAW_RUN_FULL_RAG_STABILITY_TEST"
)
FULL_STABILITY_CONFIRM_VALUE = "YES"

EXPECTED_SOURCE_TABLE = "admin_rule"
EXPECTED_DOCUMENT_CATEGORY = "ADMIN_RULE"
EXPECTED_CHUNK_TYPE = "ARTICLE"

MAX_TEST_QUERY_CHARS = 2_000
MAX_ACCEPTABLE_SINGLE_QUERY_SECONDS = 120.0

ALLOWED_CITATION_STATUSES = frozenset(
    {
        "VALID",
        "NO_CITATIONS",
        "INVALID_CITATIONS",
        "MIXED_CITATIONS",
    }
)

NORMAL_QUERY_CASES = (
    {
        "case_id": "GENERAL_NATURAL_LANGUAGE",
        "query": (
            "사후관리 대상 물품의 용도 외 사용 승인은 "
            "어떻게 하나요?"
        ),
        "expected_law_name_contains": (
            "사후관리에 관한 고시"
        ),
        "expected_title_terms": (
            "용도 외 사용",
            "승인",
            "승인신청",
            "위탁사후관리물품",
        ),
    },
    {
        "case_id": "ARTICLE_NUMBER",
        "query": "제29조",
        "expected_article_no": "제29조",
    },
    {
        "case_id": "LAW_AND_ARTICLE",
        "query": (
            "사후관리에 관한 고시 제11조는 "
            "무엇을 규정하나요?"
        ),
        "expected_law_name_contains": (
            "사후관리에 관한 고시"
        ),
        "expected_article_no": "제11조",
    },
    {
        "case_id": "SPECIALIZED_TERM",
        "query": "위탁사후관리물품 승인신청 절차",
        "expected_title_terms": (
            "위탁사후관리물품",
            "승인신청",
        ),
    },
    {
        "case_id": "SHORT_QUERY",
        "query": "용도 외 사용",
        "expected_title_terms": (
            "용도 외 사용",
        ),
    },
)

LOW_EVIDENCE_QUERY_CASE = {
    "case_id": "LOW_EVIDENCE",
    "query": (
        "현재 적재된 자료에 없는 가상의 "
        "관세 자동승인제도 절차를 설명해 주세요."
    ),
}

_REQUIRED_FINAL_FIELDS = (
    "result_version",
    "query",
    "answer_text",
    "answer_chars",
    "provider",
    "model",
    "context_count",
    "available_source_ids",
    "citation_validation",
    "cited_sources",
    "unused_sources",
    "cited_source_count",
    "unused_source_count",
)

_FORBIDDEN_RESULT_FIELDS = (
    "system_prompt",
    "user_prompt",
    "combined_prompt",
    "context_text",
    "embedding",
    "api_key",
)

_REQUIRED_SOURCE_FIELDS = (
    "citation_id",
    "id",
    "source_table",
    "source_pk",
    "document_category",
    "law_name",
    "chunk_type",
    "ranking_score",
    "cited",
    "citation_count",
)


def _validate_final_result_structure(
    result: Mapping[str, Any],
    *,
    expected_query: str,
) -> None:
    if not isinstance(result, Mapping):
        raise AssertionError("result는 Mapping이어야 합니다.")

    for field_name in _REQUIRED_FINAL_FIELDS:
        if field_name not in result:
            raise AssertionError(
                f"최종 결과 필수 필드가 없습니다: {field_name}"
            )

    if result["query"] != expected_query:
        raise AssertionError(
            "query가 expected_query와 일치하지 않습니다."
        )

    answer_text = result["answer_text"]
    if not isinstance(answer_text, str) or answer_text.strip() == "":
        raise AssertionError(
            "answer_text는 공백이 아닌 문자열이어야 합니다."
        )

    answer_chars = result["answer_chars"]
    if not isinstance(answer_chars, int) or isinstance(
        answer_chars,
        bool,
    ):
        raise AssertionError(
            "answer_chars는 int여야 합니다."
        )
    if answer_chars != len(answer_text):
        raise AssertionError(
            "answer_chars가 실제 answer_text 길이와 일치하지 않습니다."
        )

    for field_name in ("provider", "model"):
        value = result[field_name]
        if not isinstance(value, str) or value.strip() == "":
            raise AssertionError(
                f"{field_name}는 공백이 아닌 문자열이어야 합니다."
            )

    context_count = result["context_count"]
    if isinstance(context_count, bool) or not isinstance(
        context_count,
        int,
    ):
        raise AssertionError(
            "context_count는 양의 int여야 합니다."
        )
    if context_count < 1:
        raise AssertionError(
            "context_count는 양의 int여야 합니다."
        )

    available_source_ids = result["available_source_ids"]
    if isinstance(available_source_ids, (str, bytes)) or not isinstance(
        available_source_ids,
        Sequence,
    ):
        raise AssertionError(
            "available_source_ids는 Sequence여야 합니다."
        )
    expected_ids = [
        f"S{index}" for index in range(1, context_count + 1)
    ]
    if list(available_source_ids) != expected_ids:
        raise AssertionError(
            "available_source_ids가 S1부터 연속되지 않습니다."
        )
    if len(available_source_ids) != context_count:
        raise AssertionError(
            "available_source_ids 길이가 context_count와 일치하지 않습니다."
        )

    citation_validation = result["citation_validation"]
    if not isinstance(citation_validation, Mapping):
        raise AssertionError(
            "citation_validation은 Mapping이어야 합니다."
        )
    status = citation_validation.get("status")
    if status not in ALLOWED_CITATION_STATUSES:
        raise AssertionError(
            "citation_validation status가 허용값이 아닙니다."
        )
    if not isinstance(citation_validation.get("is_valid"), bool):
        raise AssertionError(
            "citation_validation is_valid는 bool이어야 합니다."
        )

    cited_sources = result["cited_sources"]
    unused_sources = result["unused_sources"]
    if isinstance(cited_sources, (str, bytes)) or not isinstance(
        cited_sources,
        Sequence,
    ):
        raise AssertionError(
            "cited_sources는 Sequence여야 합니다."
        )
    if isinstance(unused_sources, (str, bytes)) or not isinstance(
        unused_sources,
        Sequence,
    ):
        raise AssertionError(
            "unused_sources는 Sequence여야 합니다."
        )

    if result["cited_source_count"] != len(cited_sources):
        raise AssertionError(
            "cited_source_count가 cited_sources 길이와 일치하지 않습니다."
        )
    if result["unused_source_count"] != len(unused_sources):
        raise AssertionError(
            "unused_source_count가 unused_sources 길이와 일치하지 않습니다."
        )
    if (
        result["cited_source_count"]
        + result["unused_source_count"]
        != context_count
    ):
        raise AssertionError(
            "cited/unused source 합이 context_count와 일치하지 않습니다."
        )

    cited_ids = [row["citation_id"] for row in cited_sources]
    unused_ids = [row["citation_id"] for row in unused_sources]
    if len(cited_ids) != len(set(cited_ids)):
        raise AssertionError(
            "cited_sources에 중복 citation_id가 있습니다."
        )
    if set(cited_ids) | set(unused_ids) != set(available_source_ids):
        raise AssertionError(
            "cited/unused citation_id 집합이 "
            "available_source_ids와 일치하지 않습니다."
        )

    for field_name in _FORBIDDEN_RESULT_FIELDS:
        if field_name in result:
            raise AssertionError(
                f"최종 결과에 금지 필드가 포함되어 있습니다: {field_name}"
            )


def _validate_source_metadata(
    sources: Sequence[Mapping[str, Any]],
) -> None:
    if isinstance(sources, (str, bytes)) or not isinstance(
        sources,
        Sequence,
    ):
        raise AssertionError("sources는 Sequence여야 합니다.")

    for source in sources:
        if not isinstance(source, Mapping):
            raise AssertionError(
                "source는 Mapping이어야 합니다."
            )
        for field_name in _REQUIRED_SOURCE_FIELDS:
            if field_name not in source:
                raise AssertionError(
                    f"source 필수 필드가 없습니다: {field_name}"
                )

        if source["source_table"] != EXPECTED_SOURCE_TABLE:
            raise AssertionError(
                "source_table이 admin_rule이 아닙니다."
            )
        if (
            source["document_category"]
            != EXPECTED_DOCUMENT_CATEGORY
        ):
            raise AssertionError(
                "document_category가 ADMIN_RULE이 아닙니다."
            )
        if source["chunk_type"] != EXPECTED_CHUNK_TYPE:
            raise AssertionError(
                "chunk_type이 ARTICLE이 아닙니다."
            )

        for field_name in ("id", "source_pk"):
            value = source[field_name]
            if isinstance(value, bool) or not isinstance(value, int):
                raise AssertionError(
                    f"{field_name}는 양의 int여야 합니다."
                )
            if value < 1:
                raise AssertionError(
                    f"{field_name}는 양의 int여야 합니다."
                )

        ranking_score = source["ranking_score"]
        if isinstance(ranking_score, bool) or not isinstance(
            ranking_score,
            (int, float),
        ):
            raise AssertionError(
                "ranking_score는 숫자여야 합니다."
            )
        score = float(ranking_score)
        if score != score or score in (float("inf"), float("-inf")):
            raise AssertionError(
                "ranking_score가 올바르지 않습니다."
            )
        if score < 0.0 or score > 1.0:
            raise AssertionError(
                "ranking_score는 0~1 범위여야 합니다."
            )

        cited = source["cited"]
        citation_count = source["citation_count"]
        if not isinstance(cited, bool):
            raise AssertionError("cited는 bool이어야 합니다.")
        if isinstance(citation_count, bool) or not isinstance(
            citation_count,
            int,
        ):
            raise AssertionError(
                "citation_count는 int여야 합니다."
            )
        if cited and citation_count < 1:
            raise AssertionError(
                "cited=True이면 citation_count >= 1이어야 합니다."
            )
        if (not cited) and citation_count != 0:
            raise AssertionError(
                "cited=False이면 citation_count == 0이어야 합니다."
            )

        for field_name in ("body", "chunk_text", "embedding"):
            if field_name in source:
                raise AssertionError(
                    f"source에 금지 필드가 포함되어 있습니다: {field_name}"
                )


def _validate_case_expectations(
    result: Mapping[str, Any],
    case: Mapping[str, Any],
) -> None:
    all_sources = [
        *result["cited_sources"],
        *result["unused_sources"],
    ]

    expected_law_name_contains = case.get(
        "expected_law_name_contains"
    )
    if expected_law_name_contains:
        if not any(
            expected_law_name_contains in str(source.get("law_name") or "")
            for source in all_sources
        ):
            raise AssertionError(
                "expected_law_name_contains를 만족하는 "
                "source가 없습니다."
            )

    expected_article_no = case.get("expected_article_no")
    if expected_article_no:
        if not any(
            source.get("article_no") == expected_article_no
            for source in all_sources
        ):
            raise AssertionError(
                "expected_article_no와 일치하는 source가 없습니다."
            )

    expected_title_terms = case.get("expected_title_terms")
    if expected_title_terms:
        matched = False
        for source in all_sources:
            title = str(source.get("title") or "")
            header = str(source.get("header") or "")
            combined = f"{title}\n{header}"
            if any(term in combined for term in expected_title_terms):
                matched = True
                break
        if not matched:
            raise AssertionError(
                "expected_title_terms 중 하나를 포함하는 "
                "source가 없습니다."
            )


def _sample_ranked_results() -> list[dict[str, Any]]:
    return [
        {
            "id": 10,
            "source_table": "admin_rule",
            "source_pk": 10,
            "document_category": "ADMIN_RULE",
            "law_name": "사후관리에 관한 고시",
            "chunk_type": "ARTICLE",
            "article_no": "제11조",
            "title": "용도 외 사용 승인",
            "ranking_score": 0.95,
        },
        {
            "id": 20,
            "source_table": "admin_rule",
            "source_pk": 20,
            "document_category": "ADMIN_RULE",
            "law_name": "사후관리에 관한 고시",
            "chunk_type": "ARTICLE",
            "article_no": "제29조",
            "title": "위탁사후관리물품 승인신청",
            "ranking_score": 0.90,
        },
        {
            "id": 30,
            "source_table": "admin_rule",
            "source_pk": 30,
            "document_category": "ADMIN_RULE",
            "law_name": "사후관리에 관한 고시",
            "chunk_type": "ARTICLE",
            "article_no": "제5조",
            "title": "사용금지기간",
            "ranking_score": 0.85,
        },
    ]


def _sample_context_result(query: str) -> dict[str, Any]:
    return {
        "query": query,
        "context_count": 3,
        "source_ids": ["S1", "S2", "S3"],
        "included_chunk_ids": [10, 20, 30],
        "context_text": "[S1]\n샘플 Context",
        "sources": [
            {
                "citation_id": "S1",
                "id": 10,
                "source_table": "admin_rule",
                "source_pk": 10,
                "document_category": "ADMIN_RULE",
                "document_type": "고시",
                "law_name": "사후관리에 관한 고시",
                "chunk_type": "ARTICLE",
                "article_no": "제11조",
                "title": "용도 외 사용 승인",
                "header": "용도 외 사용 승인",
                "ranking_rank": 1,
                "ranking_score": 0.95,
                "text_truncated": False,
            },
            {
                "citation_id": "S2",
                "id": 20,
                "source_table": "admin_rule",
                "source_pk": 20,
                "document_category": "ADMIN_RULE",
                "document_type": "고시",
                "law_name": "사후관리에 관한 고시",
                "chunk_type": "ARTICLE",
                "article_no": "제29조",
                "title": "위탁사후관리물품 승인신청",
                "header": "위탁사후관리물품 승인신청",
                "ranking_rank": 2,
                "ranking_score": 0.90,
                "text_truncated": False,
            },
            {
                "citation_id": "S3",
                "id": 30,
                "source_table": "admin_rule",
                "source_pk": 30,
                "document_category": "ADMIN_RULE",
                "document_type": "고시",
                "law_name": "사후관리에 관한 고시",
                "chunk_type": "ARTICLE",
                "article_no": "제5조",
                "title": "사용금지기간",
                "header": "사용금지기간",
                "ranking_rank": 3,
                "ranking_score": 0.85,
                "text_truncated": False,
            },
        ],
    }


def _sample_prompt_result(query: str) -> dict[str, Any]:
    return {
        "query": query,
        "system_prompt": "SYSTEM",
        "user_prompt": "USER",
        "combined_prompt": "COMBINED",
        "source_ids": ["S1", "S2", "S3"],
        "context_count": 3,
        "system_prompt_chars": 6,
        "user_prompt_chars": 4,
        "combined_prompt_chars": 8,
    }


def _sample_answer_result(query: str) -> dict[str, Any]:
    answer_text = (
        "승인신청이 필요합니다. [S2] "
        "추가 절차도 확인해야 합니다. [S1]"
    )
    return {
        "query": query,
        "provider": "gemini",
        "model": "fake-model",
        "answer_text": answer_text,
        "source_ids": ["S1", "S2", "S3"],
        "context_count": 3,
        "finish_reason": "STOP",
        "prompt_token_count": 10,
        "candidate_token_count": 20,
        "total_token_count": 30,
        "answer_chars": len(answer_text),
    }


def _sample_validation_result(query: str) -> dict[str, Any]:
    answer = _sample_answer_result(query)
    return {
        "query": query,
        "answer_text": answer["answer_text"],
        "validation_status": "VALID",
        "is_valid": True,
        "available_source_ids": ["S1", "S2", "S3"],
        "citation_occurrences": ["S2", "S1"],
        "parsed_citation_ids": ["S2", "S1"],
        "valid_citation_ids": ["S2", "S1"],
        "invalid_citation_ids": [],
        "unused_source_ids": ["S3"],
        "citation_counts": {"S2": 1, "S1": 1},
        "citation_occurrence_count": 2,
        "unique_citation_count": 2,
        "valid_citation_count": 2,
        "invalid_citation_count": 0,
        "unused_source_count": 1,
        "has_citations": True,
        "has_invalid_citations": False,
        "has_malformed_citation_candidates": False,
        "malformed_citation_candidates": [],
        "validation_messages": [
            "답변의 출처번호가 모두 유효합니다."
        ],
    }


def _sample_final_result(query: str) -> dict[str, Any]:
    answer = _sample_answer_result(query)
    return {
        "result_version": "1.0",
        "query": query,
        "answer_text": answer["answer_text"],
        "answer_chars": answer["answer_chars"],
        "provider": answer["provider"],
        "model": answer["model"],
        "finish_reason": "STOP",
        "prompt_token_count": 10,
        "candidate_token_count": 20,
        "total_token_count": 30,
        "context_count": 3,
        "available_source_ids": ["S1", "S2", "S3"],
        "citation_validation": {
            "status": "VALID",
            "is_valid": True,
            "parsed_citation_ids": ["S2", "S1"],
            "valid_citation_ids": ["S2", "S1"],
            "invalid_citation_ids": [],
            "unused_source_ids": ["S3"],
            "citation_occurrence_count": 2,
            "unique_citation_count": 2,
            "has_malformed_citation_candidates": False,
            "malformed_citation_candidates": [],
            "messages": [
                "답변의 출처번호가 모두 유효합니다."
            ],
        },
        "cited_sources": [
            {
                "citation_id": "S2",
                "id": 20,
                "source_table": "admin_rule",
                "source_pk": 20,
                "document_category": "ADMIN_RULE",
                "document_type": "고시",
                "law_name": "사후관리에 관한 고시",
                "chunk_type": "ARTICLE",
                "article_no": "제29조",
                "title": "위탁사후관리물품 승인신청",
                "header": "위탁사후관리물품 승인신청",
                "ranking_rank": 2,
                "ranking_score": 0.90,
                "text_truncated": False,
                "cited": True,
                "citation_count": 1,
                "first_occurrence_order": 1,
            },
            {
                "citation_id": "S1",
                "id": 10,
                "source_table": "admin_rule",
                "source_pk": 10,
                "document_category": "ADMIN_RULE",
                "document_type": "고시",
                "law_name": "사후관리에 관한 고시",
                "chunk_type": "ARTICLE",
                "article_no": "제11조",
                "title": "용도 외 사용 승인",
                "header": "용도 외 사용 승인",
                "ranking_rank": 1,
                "ranking_score": 0.95,
                "text_truncated": False,
                "cited": True,
                "citation_count": 1,
                "first_occurrence_order": 2,
            },
        ],
        "unused_sources": [
            {
                "citation_id": "S3",
                "id": 30,
                "source_table": "admin_rule",
                "source_pk": 30,
                "document_category": "ADMIN_RULE",
                "document_type": "고시",
                "law_name": "사후관리에 관한 고시",
                "chunk_type": "ARTICLE",
                "article_no": "제5조",
                "title": "사용금지기간",
                "header": "사용금지기간",
                "ranking_rank": 3,
                "ranking_score": 0.85,
                "text_truncated": False,
                "cited": False,
                "citation_count": 0,
                "first_occurrence_order": None,
            },
        ],
        "cited_source_count": 2,
        "unused_source_count": 1,
    }


class FakeRankingService:
    def __init__(
        self,
        ranked_results: Sequence[Mapping[str, Any]] | None = None,
        *,
        fail: bool = False,
    ) -> None:
        self.call_count = 0
        self.last_query: str | None = None
        self.last_kwargs: dict[str, Any] | None = None
        self.ranked_results = list(
            ranked_results
            if ranked_results is not None
            else _sample_ranked_results()
        )
        self.fail = fail

    def search(
        self,
        query: str,
        *,
        match_count: int = 10,
        candidate_multiplier: int = 3,
        **hybrid_options: Any,
    ) -> list[dict[str, Any]]:
        self.call_count += 1
        self.last_query = query
        self.last_kwargs = {
            "match_count": match_count,
            "candidate_multiplier": candidate_multiplier,
            **hybrid_options,
        }
        if self.fail:
            raise RuntimeError("Ranking 실패")
        return copy.deepcopy(self.ranked_results)


class FakeAnswerService:
    def __init__(
        self,
        answer_result: Mapping[str, Any] | None = None,
        *,
        fail: bool = False,
    ) -> None:
        self.call_count = 0
        self.last_prompt_result: Mapping[str, Any] | None = None
        self.last_kwargs: dict[str, Any] | None = None
        self.answer_result = (
            dict(answer_result)
            if answer_result is not None
            else _sample_answer_result("테스트 질문")
        )
        self.fail = fail

    def generate_answer(
        self,
        prompt_result: Mapping[str, Any],
        *,
        temperature: float | None = None,
        max_output_tokens: int | None = None,
    ) -> dict[str, Any]:
        self.call_count += 1
        self.last_prompt_result = prompt_result
        self.last_kwargs = {
            "temperature": temperature,
            "max_output_tokens": max_output_tokens,
        }
        if self.fail:
            raise RuntimeError("Gemini Answer 실패")
        result = copy.deepcopy(self.answer_result)
        result["query"] = prompt_result["query"]
        return result


class FakeContextBuilder:
    def __init__(
        self,
        context_result: Mapping[str, Any] | None = None,
        *,
        fail: bool = False,
    ) -> None:
        self.call_count = 0
        self.last_query: str | None = None
        self.last_ranked_results: Sequence[Mapping[str, Any]] | None = (
            None
        )
        self.last_kwargs: dict[str, Any] | None = None
        self.context_result = (
            dict(context_result)
            if context_result is not None
            else _sample_context_result("테스트 질문")
        )
        self.fail = fail

    def build(
        self,
        query: str,
        ranked_results: Sequence[Mapping[str, Any]],
        *,
        max_results: int = 5,
        max_chunk_chars: int = 3000,
        max_context_chars: int = 12000,
    ) -> dict[str, Any]:
        self.call_count += 1
        self.last_query = query
        self.last_ranked_results = ranked_results
        self.last_kwargs = {
            "max_results": max_results,
            "max_chunk_chars": max_chunk_chars,
            "max_context_chars": max_context_chars,
        }
        if self.fail:
            raise RuntimeError("Context 실패")
        result = copy.deepcopy(self.context_result)
        result["query"] = query
        return result


class FakePromptBuilder:
    def __init__(
        self,
        prompt_result: Mapping[str, Any] | None = None,
        *,
        fail: bool = False,
    ) -> None:
        self.call_count = 0
        self.last_context_result: Mapping[str, Any] | None = None
        self.last_kwargs: dict[str, Any] | None = None
        self.prompt_result = (
            dict(prompt_result)
            if prompt_result is not None
            else _sample_prompt_result("테스트 질문")
        )
        self.fail = fail

    def build(
        self,
        context_result: Mapping[str, Any],
        *,
        max_system_prompt_chars: int = 6000,
        max_user_prompt_chars: int = 30000,
        max_combined_prompt_chars: int = 36000,
    ) -> dict[str, Any]:
        self.call_count += 1
        self.last_context_result = context_result
        self.last_kwargs = {
            "max_system_prompt_chars": max_system_prompt_chars,
            "max_user_prompt_chars": max_user_prompt_chars,
            "max_combined_prompt_chars": (
                max_combined_prompt_chars
            ),
        }
        if self.fail:
            raise RuntimeError("Prompt 실패")
        result = copy.deepcopy(self.prompt_result)
        result["query"] = context_result["query"]
        result["source_ids"] = list(
            context_result["source_ids"]
        )
        result["context_count"] = context_result[
            "context_count"
        ]
        return result


class FakeCitationValidator:
    def __init__(
        self,
        validation_result: Mapping[str, Any] | None = None,
        *,
        fail: bool = False,
    ) -> None:
        self.call_count = 0
        self.last_answer_result: Mapping[str, Any] | None = None
        self.validation_result = (
            dict(validation_result)
            if validation_result is not None
            else _sample_validation_result("테스트 질문")
        )
        self.fail = fail

    def validate(
        self,
        answer_result: Mapping[str, Any],
    ) -> dict[str, Any]:
        self.call_count += 1
        self.last_answer_result = answer_result
        if self.fail:
            raise RuntimeError("Citation Validator 실패")
        result = copy.deepcopy(self.validation_result)
        result["query"] = answer_result["query"]
        result["answer_text"] = answer_result["answer_text"]
        result["available_source_ids"] = list(
            answer_result["source_ids"]
        )
        return result


class FakeCitationResultBuilder:
    def __init__(
        self,
        final_result: Mapping[str, Any] | None = None,
        *,
        fail: bool = False,
    ) -> None:
        self.call_count = 0
        self.last_answer_result: Mapping[str, Any] | None = None
        self.last_context_result: Mapping[str, Any] | None = None
        self.last_validation_result: Mapping[str, Any] | None = None
        self.final_result = (
            dict(final_result)
            if final_result is not None
            else _sample_final_result("테스트 질문")
        )
        self.fail = fail

    def build(
        self,
        answer_result: Mapping[str, Any],
        context_result: Mapping[str, Any],
        validation_result: Mapping[str, Any],
    ) -> dict[str, Any]:
        self.call_count += 1
        self.last_answer_result = answer_result
        self.last_context_result = context_result
        self.last_validation_result = validation_result
        if self.fail:
            raise RuntimeError("Citation Result Builder 실패")
        result = copy.deepcopy(self.final_result)
        result["query"] = answer_result["query"]
        result["answer_text"] = answer_result["answer_text"]
        result["answer_chars"] = answer_result["answer_chars"]
        return result


class _StubLLM:
    def generate(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("Stub LLM은 호출되면 안 됩니다.")


class _SilentHybridSearchService:
    def search(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        raise AssertionError(
            "HybridSearch는 이 테스트에서 호출되면 안 됩니다."
        )


def _build_fake_rag_chat_service(
    *,
    ranking_service: Any | None = None,
    answer_service: Any | None = None,
    context_builder: Any | None = None,
    prompt_builder: Any | None = None,
    citation_validator: Any | None = None,
    citation_result_builder: Any | None = None,
) -> tuple[RAGChatService, dict[str, Any]]:
    ranking = ranking_service or FakeRankingService()
    answer = answer_service or FakeAnswerService()
    context = context_builder or FakeContextBuilder()
    prompt = prompt_builder or FakePromptBuilder()
    validator = citation_validator or FakeCitationValidator()
    result_builder = (
        citation_result_builder or FakeCitationResultBuilder()
    )
    llm = _StubLLM()

    service = RAGChatService(
        object(),  # type: ignore[arg-type]
        object(),  # type: ignore[arg-type]
        object(),  # type: ignore[arg-type]
        object(),  # type: ignore[arg-type]
        object(),  # type: ignore[arg-type]
        ranking,
        answer,
        llm,  # type: ignore[arg-type]
        context,
        prompt,
        validator,
        result_builder,
    )
    return service, {
        "ranking": ranking,
        "answer": answer,
        "context": context,
        "prompt": prompt,
        "validator": validator,
        "result_builder": result_builder,
    }


def test_pipeline_calls_once() -> None:
    query = "사후관리 대상 물품의 용도 외 사용 승인은 어떻게 하나요?"
    final = _sample_final_result(query)
    service, fakes = _build_fake_rag_chat_service(
        ranking_service=FakeRankingService(),
        answer_service=FakeAnswerService(
            _sample_answer_result(query)
        ),
        context_builder=FakeContextBuilder(
            _sample_context_result(query)
        ),
        prompt_builder=FakePromptBuilder(
            _sample_prompt_result(query)
        ),
        citation_validator=FakeCitationValidator(
            _sample_validation_result(query)
        ),
        citation_result_builder=FakeCitationResultBuilder(
            final
        ),
    )

    result = service.chat(query)

    assert fakes["ranking"].call_count == 1
    assert fakes["context"].call_count == 1
    assert fakes["prompt"].call_count == 1
    assert fakes["answer"].call_count == 1
    assert fakes["validator"].call_count == 1
    assert fakes["result_builder"].call_count == 1
    assert result["query"] == query
    assert result["answer_text"] == final["answer_text"]
    assert result["result_version"] == final["result_version"]


def test_parameter_forwarding() -> None:
    query = "테스트 질문"
    service, fakes = _build_fake_rag_chat_service(
        ranking_service=FakeRankingService(),
        answer_service=FakeAnswerService(
            _sample_answer_result(query)
        ),
        context_builder=FakeContextBuilder(
            _sample_context_result(query)
        ),
        prompt_builder=FakePromptBuilder(
            _sample_prompt_result(query)
        ),
        citation_validator=FakeCitationValidator(
            _sample_validation_result(query)
        ),
        citation_result_builder=FakeCitationResultBuilder(
            _sample_final_result(query)
        ),
    )

    service.chat(
        query,
        match_count=7,
        candidate_multiplier=4,
        max_results=3,
        temperature=0.1,
        max_output_tokens=1024,
        document_category="ADMIN_RULE",
        source_table="admin_rule",
    )

    ranking_kwargs = fakes["ranking"].last_kwargs
    assert ranking_kwargs is not None
    assert ranking_kwargs["match_count"] == 7
    assert ranking_kwargs["candidate_multiplier"] == 4
    assert ranking_kwargs["document_category"] == "ADMIN_RULE"
    assert ranking_kwargs["source_table"] == "admin_rule"
    assert ranking_kwargs["chunk_type"] == "ARTICLE"
    assert ranking_kwargs["hybrid_candidate_multiplier"] == 4
    assert fakes["ranking"].last_query == query

    context_kwargs = fakes["context"].last_kwargs
    assert context_kwargs is not None
    assert context_kwargs["max_results"] == 3
    assert fakes["context"].last_query == query

    answer_kwargs = fakes["answer"].last_kwargs
    assert answer_kwargs is not None
    assert answer_kwargs["temperature"] == 0.1
    assert answer_kwargs["max_output_tokens"] == 1024


def test_input_is_not_mutated() -> None:
    query = "테스트 질문"
    options = {
        "match_count": 7,
        "candidate_multiplier": 4,
        "max_results": 3,
        "temperature": 0.1,
        "max_output_tokens": 1024,
        "document_category": "ADMIN_RULE",
        "source_table": "admin_rule",
    }
    original_query = copy.deepcopy(query)
    original_options = copy.deepcopy(options)

    service, _ = _build_fake_rag_chat_service(
        answer_service=FakeAnswerService(
            _sample_answer_result(query)
        ),
        context_builder=FakeContextBuilder(
            _sample_context_result(query)
        ),
        prompt_builder=FakePromptBuilder(
            _sample_prompt_result(query)
        ),
        citation_validator=FakeCitationValidator(
            _sample_validation_result(query)
        ),
        citation_result_builder=FakeCitationResultBuilder(
            _sample_final_result(query)
        ),
    )
    service.chat(query, **options)

    assert query == original_query
    assert options == original_options


def test_exception_propagation() -> None:
    query = "테스트 질문"

    cases = (
        ("Ranking 실패", {"ranking_service": FakeRankingService(fail=True)}),
        (
            "Context 실패",
            {"context_builder": FakeContextBuilder(fail=True)},
        ),
        (
            "Prompt 실패",
            {"prompt_builder": FakePromptBuilder(fail=True)},
        ),
        (
            "Gemini Answer 실패",
            {"answer_service": FakeAnswerService(fail=True)},
        ),
        (
            "Citation Validator 실패",
            {
                "citation_validator": FakeCitationValidator(
                    fail=True
                )
            },
        ),
        (
            "Citation Result Builder 실패",
            {
                "citation_result_builder": (
                    FakeCitationResultBuilder(fail=True)
                )
            },
        ),
    )

    for expected_message, kwargs in cases:
        service, _ = _build_fake_rag_chat_service(**kwargs)
        try:
            service.chat(query)
        except RuntimeError as exc:
            assert expected_message in str(exc)
        else:
            raise AssertionError(
                f"{expected_message} 예외가 전파되지 않았습니다."
            )


def test_invalid_queries() -> None:
    service, _ = _build_fake_rag_chat_service()

    for invalid in (None, 123):
        try:
            service.chat(invalid)  # type: ignore[arg-type]
        except TypeError:
            pass
        else:
            raise AssertionError(
                "잘못된 query 타입 TypeError가 발생하지 않았습니다."
            )

    for invalid in ("", "   "):
        try:
            service.chat(invalid)
        except ValueError:
            pass
        else:
            raise AssertionError(
                "빈 query ValueError가 발생하지 않았습니다."
            )

    long_query = "가" * (MAX_TEST_QUERY_CHARS + 1)
    ranking = RankingService(_SilentHybridSearchService())  # type: ignore[arg-type]
    long_service, _ = _build_fake_rag_chat_service(
        ranking_service=ranking,
    )
    try:
        long_service.chat(long_query)
    except ValueError as exc:
        assert "2000" in str(exc)
    else:
        raise AssertionError(
            "2001자 query ValueError가 발생하지 않았습니다."
        )


def test_final_result_structure() -> None:
    query = "테스트 질문"
    good = _sample_final_result(query)
    _validate_final_result_structure(
        good,
        expected_query=query,
    )

    bad_answer_chars = copy.deepcopy(good)
    bad_answer_chars["answer_chars"] = 1
    try:
        _validate_final_result_structure(
            bad_answer_chars,
            expected_query=query,
        )
    except AssertionError:
        pass
    else:
        raise AssertionError(
            "answer_chars 불일치를 검출하지 못했습니다."
        )

    bad_source_ids = copy.deepcopy(good)
    bad_source_ids["available_source_ids"] = ["S1", "S3", "S2"]
    try:
        _validate_final_result_structure(
            bad_source_ids,
            expected_query=query,
        )
    except AssertionError:
        pass
    else:
        raise AssertionError(
            "source ID 불연속을 검출하지 못했습니다."
        )

    bad_cited_count = copy.deepcopy(good)
    bad_cited_count["cited_source_count"] = 99
    try:
        _validate_final_result_structure(
            bad_cited_count,
            expected_query=query,
        )
    except AssertionError:
        pass
    else:
        raise AssertionError(
            "cited_source_count 불일치를 검출하지 못했습니다."
        )

    bad_status = copy.deepcopy(good)
    bad_status["citation_validation"] = dict(
        good["citation_validation"]
    )
    bad_status["citation_validation"]["status"] = "UNKNOWN"
    try:
        _validate_final_result_structure(
            bad_status,
            expected_query=query,
        )
    except AssertionError:
        pass
    else:
        raise AssertionError(
            "미등록 Citation 상태를 검출하지 못했습니다."
        )

    bad_context_sum = copy.deepcopy(good)
    bad_context_sum["unused_source_count"] = 0
    bad_context_sum["unused_sources"] = []
    try:
        _validate_final_result_structure(
            bad_context_sum,
            expected_query=query,
        )
    except AssertionError:
        pass
    else:
        raise AssertionError(
            "Context 수와 Source 수 불일치를 검출하지 못했습니다."
        )


def _create_real_rag_chat_service() -> RAGChatService:
    repository = SupabaseRepository()
    embedding_service = EmbeddingService()
    query_search_service = QuerySearchService(
        repository,
        embedding_service,
    )
    keyword_search_service = KeywordSearchService(
        repository,
    )
    hybrid_search_service = HybridSearchService(
        query_search_service,
        keyword_search_service,
    )
    ranking_service = RankingService(
        hybrid_search_service,
    )
    llm = create_llm()
    answer_service = AnswerService(llm)

    return RAGChatService(
        repository,
        embedding_service,
        query_search_service,
        keyword_search_service,
        hybrid_search_service,
        ranking_service,
        answer_service,
        llm,
        ContextBuilder,
        PromptBuilder,
        CitationValidator,
        CitationResultBuilder,
    )


def _count_admin_rule_article_chunks(
    repository: SupabaseRepository,
    *,
    embedded_only: bool = False,
) -> int:
    query = (
        repository.client.table("smartlaw_chunk")
        .select("id", count="exact")
        .eq("source_table", EXPECTED_SOURCE_TABLE)
        .eq("chunk_type", EXPECTED_CHUNK_TYPE)
    )
    if embedded_only:
        query = query.not_.is_("embedding", "null")
    response = query.limit(0).execute()
    return int(response.count or 0)


def run_real_query_case(
    service: RAGChatService,
    case: Mapping[str, Any],
) -> dict[str, Any]:
    case_id = case.get("case_id")
    query = case.get("query")
    if not isinstance(case_id, str) or case_id.strip() == "":
        raise ValueError("case_id는 필수입니다.")
    if not isinstance(query, str) or query.strip() == "":
        raise ValueError("query는 필수입니다.")
    if len(query) > MAX_TEST_QUERY_CHARS:
        raise ValueError(
            "테스트 query가 최대 길이를 초과했습니다."
        )

    started_at = time.perf_counter()
    result = service.chat(
        query,
        match_count=10,
        candidate_multiplier=3,
        max_results=5,
        temperature=0.2,
        max_output_tokens=2048,
        document_category=EXPECTED_DOCUMENT_CATEGORY,
        source_table=EXPECTED_SOURCE_TABLE,
    )
    elapsed = time.perf_counter() - started_at

    _validate_final_result_structure(
        result,
        expected_query=query,
    )
    _validate_source_metadata(
        [
            *result["cited_sources"],
            *result["unused_sources"],
        ]
    )

    if case_id != LOW_EVIDENCE_QUERY_CASE["case_id"]:
        _validate_case_expectations(result, case)
    else:
        status = result["citation_validation"]["status"]
        if status not in ALLOWED_CITATION_STATUSES:
            raise AssertionError(
                "LOW_EVIDENCE Citation 상태가 허용값이 아닙니다."
            )
        if not isinstance(result["answer_text"], str) or (
            result["answer_text"].strip() == ""
        ):
            raise AssertionError(
                "LOW_EVIDENCE answer_text가 비어 있습니다."
            )
        available = set(result["available_source_ids"])
        invalid_ids = list(
            result["citation_validation"][
                "invalid_citation_ids"
            ]
        )
        for citation_id in invalid_ids:
            if citation_id in available:
                raise AssertionError(
                    "invalid Citation이 available_source_ids에 "
                    "존재합니다."
                )
        for source in result["cited_sources"]:
            if source["citation_id"] not in available:
                raise AssertionError(
                    "존재하지 않는 Citation에 Metadata가 "
                    "연결되었습니다."
                )
            if source["citation_id"] in set(invalid_ids):
                raise AssertionError(
                    "invalid Citation에 Metadata가 연결되었습니다."
                )

    return {
        "case_id": case_id,
        "query": query,
        "elapsed_seconds": elapsed,
        "slow": elapsed > MAX_ACCEPTABLE_SINGLE_QUERY_SECONDS,
        "validation_status": (
            result["citation_validation"]["status"]
        ),
        "citation_valid": (
            result["citation_validation"]["is_valid"]
        ),
        "context_count": result["context_count"],
        "cited_source_count": (
            result["cited_source_count"]
        ),
        "unused_source_count": (
            result["unused_source_count"]
        ),
        "answer_chars": result["answer_chars"],
        "result": result,
    }


def _summarize_case_result(
    case_result: Mapping[str, Any],
) -> dict[str, Any]:
    summary = {
        "case_id": case_result["case_id"],
        "query": case_result["query"],
        "elapsed_seconds": case_result["elapsed_seconds"],
        "slow": case_result["slow"],
        "validation_status": case_result["validation_status"],
        "citation_valid": case_result["citation_valid"],
        "context_count": case_result["context_count"],
        "cited_source_count": case_result[
            "cited_source_count"
        ],
        "unused_source_count": case_result[
            "unused_source_count"
        ],
        "answer_chars": case_result["answer_chars"],
    }
    if "exception_type" in case_result:
        summary["exception_type"] = case_result[
            "exception_type"
        ]
    return summary


def _print_case_summary(
    case_result: Mapping[str, Any],
) -> None:
    print("case_id:", case_result["case_id"])
    print(
        "elapsed_seconds:",
        round(float(case_result["elapsed_seconds"]), 3),
    )
    print(
        "validation_status:",
        case_result["validation_status"],
    )
    print(
        "citation_valid:",
        case_result["citation_valid"],
    )
    print(
        "context_count:",
        case_result["context_count"],
    )
    print(
        "cited_source_count:",
        case_result["cited_source_count"],
    )
    print(
        "unused_source_count:",
        case_result["unused_source_count"],
    )
    print(
        "answer_chars:",
        case_result["answer_chars"],
    )
    answer_text = case_result["result"]["answer_text"]
    print("answer_text preview:", answer_text[:500])


if __name__ == "__main__":
    test_pipeline_calls_once()
    test_parameter_forwarding()
    test_input_is_not_mutated()
    test_exception_propagation()
    test_invalid_queries()
    test_final_result_structure()

    print(
        "OK: STEP 9-5A RAG Chat Service "
        "안정화 단위 테스트 완료"
    )

    service = _create_real_rag_chat_service()
    repository = service.repository

    before_article_count = _count_admin_rule_article_chunks(
        repository
    )
    before_embedded_count = _count_admin_rule_article_chunks(
        repository,
        embedded_only=True,
    )

    case_results: list[dict[str, Any]] = []
    failure_cases = 0
    success_cases = 0
    slow_cases = 0
    citation_valid_cases = 0
    citation_invalid_cases = 0

    first_case = NORMAL_QUERY_CASES[0]
    try:
        first_result = run_real_query_case(service, first_case)
        case_results.append(first_result)
        success_cases += 1
        if first_result["slow"]:
            slow_cases += 1
            print("경고: 질의 처리가 120초를 초과했습니다.")
        if first_result["citation_valid"]:
            citation_valid_cases += 1
        else:
            citation_invalid_cases += 1
        _print_case_summary(first_result)
    except Exception as exc:
        failure_cases += 1
        case_results.append(
            {
                "case_id": first_case["case_id"],
                "query": first_case["query"],
                "elapsed_seconds": 0.0,
                "slow": False,
                "validation_status": None,
                "citation_valid": False,
                "context_count": 0,
                "cited_source_count": 0,
                "unused_source_count": 0,
                "answer_chars": 0,
                "exception_type": type(exc).__name__,
            }
        )
        print(
            "기본 통합 테스트 실패:",
            first_case["case_id"],
            type(exc).__name__,
        )
        raise

    run_full = (
        os.getenv(FULL_STABILITY_CONFIRM_ENV)
        == FULL_STABILITY_CONFIRM_VALUE
    )

    if run_full:
        remaining_cases = list(NORMAL_QUERY_CASES[1:])
        remaining_cases.append(LOW_EVIDENCE_QUERY_CASE)

        for case in remaining_cases:
            try:
                case_result = run_real_query_case(
                    service,
                    case,
                )
                case_results.append(case_result)
                success_cases += 1
                if case_result["slow"]:
                    slow_cases += 1
                    print(
                        "경고: 질의 처리가 120초를 초과했습니다.",
                        case["case_id"],
                    )
                if case_result["citation_valid"]:
                    citation_valid_cases += 1
                else:
                    citation_invalid_cases += 1
                _print_case_summary(case_result)
            except Exception as exc:
                failure_cases += 1
                case_results.append(
                    {
                        "case_id": case["case_id"],
                        "query": case["query"],
                        "elapsed_seconds": 0.0,
                        "slow": False,
                        "validation_status": None,
                        "citation_valid": False,
                        "context_count": 0,
                        "cited_source_count": 0,
                        "unused_source_count": 0,
                        "answer_chars": 0,
                        "exception_type": type(exc).__name__,
                    }
                )
                print(
                    "회귀 케이스 실패:",
                    case["case_id"],
                    type(exc).__name__,
                )
    else:
        print(
            "전체 RAG 회귀 테스트를 실행하려면 "
            "SMARTLAW_RUN_FULL_RAG_STABILITY_TEST=YES를 "
            "설정하세요."
        )

    after_article_count = _count_admin_rule_article_chunks(
        repository
    )
    after_embedded_count = _count_admin_rule_article_chunks(
        repository,
        embedded_only=True,
    )

    print(
        "DB ARTICLE chunk 수:",
        before_article_count,
        "->",
        after_article_count,
    )
    print(
        "DB ARTICLE embedding 수:",
        before_embedded_count,
        "->",
        after_embedded_count,
    )
    if before_article_count != after_article_count:
        raise RuntimeError(
            "통합 테스트 전후 ARTICLE chunk 수가 변경되었습니다."
        )
    if before_embedded_count != after_embedded_count:
        raise RuntimeError(
            "통합 테스트 전후 ARTICLE embedding 수가 변경되었습니다."
        )

    summary = {
        "total_cases": len(case_results),
        "success_cases": success_cases,
        "failure_cases": failure_cases,
        "slow_cases": slow_cases,
        "citation_valid_cases": citation_valid_cases,
        "citation_invalid_cases": citation_invalid_cases,
        "case_results": [
            _summarize_case_result(item)
            for item in case_results
        ],
    }
    print("회귀 결과 요약:", summary)

    if run_full and failure_cases > 0:
        raise RuntimeError(
            "전체 RAG 회귀 테스트에 실패한 케이스가 있습니다."
        )

    if failure_cases > 0:
        raise RuntimeError(
            "기본 RAG 통합 테스트에 실패한 케이스가 있습니다."
        )

    print(
        "OK: STEP 9-5A RAG Chat Service "
        "안정화·회귀 테스트 완료"
    )
