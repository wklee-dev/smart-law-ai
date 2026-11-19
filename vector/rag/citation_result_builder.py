# citation_result_builder.py
#
# 역할: Answer·Context·Citation Validation 결과를 결합해
#       출처 Metadata가 연결된 최종 RAG 결과를 생성한다.

from __future__ import annotations

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
from vector.rag.citation_validator import (
    CitationValidator,
)
from vector.rag.context_builder import ContextBuilder
from vector.rag.prompt_builder import PromptBuilder
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

MAX_FINAL_ANSWER_CHARS = 50_000
MAX_FINAL_CONTEXT_SOURCES = 50

FINAL_RESULT_VERSION = "1.0"

_REQUIRED_ANSWER_FIELDS = (
    "query",
    "provider",
    "model",
    "answer_text",
    "source_ids",
    "context_count",
    "answer_chars",
)

_REQUIRED_CONTEXT_FIELDS = (
    "query",
    "context_count",
    "source_ids",
    "sources",
    "included_chunk_ids",
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
)

_REQUIRED_VALIDATION_FIELDS = (
    "query",
    "answer_text",
    "validation_status",
    "is_valid",
    "available_source_ids",
    "citation_occurrences",
    "parsed_citation_ids",
    "valid_citation_ids",
    "invalid_citation_ids",
    "unused_source_ids",
    "citation_counts",
    "malformed_citation_candidates",
    "validation_messages",
)

_ALLOWED_VALIDATION_STATUSES = frozenset(
    {
        "VALID",
        "NO_CITATIONS",
        "INVALID_CITATIONS",
        "MIXED_CITATIONS",
    }
)

_VALIDATION_SEQUENCE_FIELDS = (
    "available_source_ids",
    "citation_occurrences",
    "parsed_citation_ids",
    "valid_citation_ids",
    "invalid_citation_ids",
    "unused_source_ids",
    "malformed_citation_candidates",
    "validation_messages",
)


class CitationResultBuilder:
    """
    Answer, Context, Citation Validation 결과를 결합해
    출처 Metadata가 연결된 최종 RAG 결과를 생성한다.
    """

    @staticmethod
    def _require_non_string_sequence(
        value: Any,
        field_name: str,
    ) -> None:
        if isinstance(value, (str, bytes)) or not isinstance(
            value,
            Sequence,
        ):
            raise TypeError(
                f"{field_name}는 Sequence여야 합니다."
            )

    @staticmethod
    def _require_positive_int(
        value: Any,
        field_name: str,
    ) -> None:
        if isinstance(value, bool) or not isinstance(
            value,
            int,
        ):
            raise ValueError(
                f"최종 응답 입력 필수값이 없습니다: {field_name}"
            )
        if value < 1:
            raise ValueError(
                f"최종 응답 입력 필수값이 없습니다: {field_name}"
            )

    @staticmethod
    def _require_non_empty_str(
        value: Any,
        field_name: str,
    ) -> None:
        if not isinstance(value, str) or value.strip() == "":
            raise ValueError(
                f"최종 응답 입력 필수값이 없습니다: {field_name}"
            )

    @staticmethod
    def _expected_source_ids(context_count: int) -> list[str]:
        return [
            f"S{index}"
            for index in range(1, context_count + 1)
        ]

    @staticmethod
    def _is_finite_number(value: float) -> bool:
        return value == value and value not in (
            float("inf"),
            float("-inf"),
        )

    @classmethod
    def _validate_answer_result(
        cls,
        answer_result: Mapping[str, Any],
    ) -> None:
        if not isinstance(answer_result, Mapping):
            raise TypeError(
                "answer_result는 Mapping이어야 합니다."
            )

        for field_name in _REQUIRED_ANSWER_FIELDS:
            if field_name not in answer_result:
                raise ValueError(
                    f"최종 응답 입력 필수값이 없습니다: {field_name}"
                )

        for field_name in (
            "query",
            "provider",
            "model",
            "answer_text",
        ):
            cls._require_non_empty_str(
                answer_result[field_name],
                field_name,
            )

        answer_text = answer_result["answer_text"]
        if len(answer_text) > MAX_FINAL_ANSWER_CHARS:
            raise ValueError(
                "answer_text가 최종 응답 최대 길이를 초과했습니다."
            )

        source_ids = answer_result["source_ids"]
        cls._require_non_string_sequence(
            source_ids,
            "source_ids",
        )

        context_count = answer_result["context_count"]
        cls._require_positive_int(
            context_count,
            "context_count",
        )

        if len(source_ids) != context_count:
            raise RuntimeError(
                "source_ids 개수와 context_count가 일치하지 않습니다."
            )

        expected_source_ids = cls._expected_source_ids(
            context_count
        )
        if list(source_ids) != expected_source_ids:
            raise RuntimeError(
                "사용 가능한 출처번호가 S1부터 연속되지 않습니다."
            )

        for source_id in source_ids:
            if (
                not isinstance(source_id, str)
                or source_id.strip() == ""
                or " " in source_id
            ):
                raise RuntimeError(
                    "사용 가능한 출처번호가 S1부터 연속되지 않습니다."
                )

        answer_chars = answer_result["answer_chars"]
        if isinstance(answer_chars, bool) or not isinstance(
            answer_chars,
            int,
        ):
            raise ValueError(
                "최종 응답 입력 필수값이 없습니다: answer_chars"
            )
        if answer_chars < 0:
            raise ValueError(
                "최종 응답 입력 필수값이 없습니다: answer_chars"
            )
        if answer_chars != len(answer_text):
            raise RuntimeError(
                "answer_chars가 실제 answer_text 길이와 일치하지 않습니다."
            )

    @classmethod
    def _validate_context_result(
        cls,
        context_result: Mapping[str, Any],
    ) -> None:
        if not isinstance(context_result, Mapping):
            raise TypeError(
                "context_result는 Mapping이어야 합니다."
            )

        for field_name in _REQUIRED_CONTEXT_FIELDS:
            if field_name not in context_result:
                raise ValueError(
                    f"최종 응답 입력 필수값이 없습니다: {field_name}"
                )

        cls._require_non_empty_str(
            context_result["query"],
            "query",
        )

        context_count = context_result["context_count"]
        cls._require_positive_int(
            context_count,
            "context_count",
        )
        if context_count > MAX_FINAL_CONTEXT_SOURCES:
            raise ValueError(
                "context_count가 최종 응답 최대 출처 수를 초과했습니다."
            )

        source_ids = context_result["source_ids"]
        sources = context_result["sources"]
        cls._require_non_string_sequence(
            source_ids,
            "source_ids",
        )
        cls._require_non_string_sequence(
            sources,
            "sources",
        )

        if len(source_ids) != context_count:
            raise RuntimeError(
                "source_ids 개수와 context_count가 일치하지 않습니다."
            )
        if len(sources) != context_count:
            raise RuntimeError(
                "sources 개수와 context_count가 일치하지 않습니다."
            )

        seen_citation_ids: set[str] = set()
        for index, source in enumerate(sources):
            if not isinstance(source, Mapping):
                raise TypeError(
                    "sources의 각 항목은 Mapping이어야 합니다."
                )

            for field_name in _REQUIRED_SOURCE_FIELDS:
                if field_name not in source:
                    raise ValueError(
                        f"최종 응답 입력 필수값이 없습니다: {field_name}"
                    )

            citation_id = source["citation_id"]
            expected_citation_id = source_ids[index]
            if citation_id != expected_citation_id:
                raise RuntimeError(
                    "Context source citation_id가 "
                    "source_ids와 일치하지 않습니다."
                )
            if citation_id in seen_citation_ids:
                raise RuntimeError(
                    f"Context source에 중복 citation_id가 있습니다: "
                    f"{citation_id}"
                )
            seen_citation_ids.add(citation_id)

            source_id = source["id"]
            if isinstance(source_id, bool) or not isinstance(
                source_id,
                int,
            ):
                raise ValueError(
                    "최종 응답 입력 필수값이 없습니다: id"
                )
            if source_id < 1:
                raise ValueError(
                    "최종 응답 입력 필수값이 없습니다: id"
                )

            source_pk = source["source_pk"]
            if isinstance(source_pk, bool) or not isinstance(
                source_pk,
                int,
            ):
                raise ValueError(
                    "최종 응답 입력 필수값이 없습니다: source_pk"
                )
            if source_pk < 1:
                raise ValueError(
                    "최종 응답 입력 필수값이 없습니다: source_pk"
                )

            ranking_score = source["ranking_score"]
            if isinstance(ranking_score, bool) or not isinstance(
                ranking_score,
                (int, float),
            ):
                raise ValueError(
                    "최종 응답 입력 필수값이 없습니다: ranking_score"
                )
            score = float(ranking_score)
            if not cls._is_finite_number(score):
                raise ValueError(
                    "ranking_score가 올바르지 않습니다."
                )
            if score < 0.0 or score > 1.0:
                raise ValueError(
                    "ranking_score가 올바르지 않습니다."
                )

    @classmethod
    def _validate_validation_result(
        cls,
        validation_result: Mapping[str, Any],
    ) -> None:
        if not isinstance(validation_result, Mapping):
            raise TypeError(
                "validation_result는 Mapping이어야 합니다."
            )

        for field_name in _REQUIRED_VALIDATION_FIELDS:
            if field_name not in validation_result:
                raise ValueError(
                    f"최종 응답 입력 필수값이 없습니다: {field_name}"
                )

        cls._require_non_empty_str(
            validation_result["query"],
            "query",
        )
        cls._require_non_empty_str(
            validation_result["answer_text"],
            "answer_text",
        )

        validation_status = validation_result[
            "validation_status"
        ]
        if validation_status not in _ALLOWED_VALIDATION_STATUSES:
            raise ValueError(
                "최종 응답 입력 필수값이 없습니다: validation_status"
            )

        if not isinstance(validation_result["is_valid"], bool):
            raise ValueError(
                "최종 응답 입력 필수값이 없습니다: is_valid"
            )

        for field_name in _VALIDATION_SEQUENCE_FIELDS:
            cls._require_non_string_sequence(
                validation_result[field_name],
                field_name,
            )

        citation_counts = validation_result["citation_counts"]
        if not isinstance(citation_counts, Mapping):
            raise TypeError(
                "citation_counts는 Mapping이어야 합니다."
            )
        for key, value in citation_counts.items():
            if not isinstance(key, str):
                raise ValueError(
                    "citation_counts의 key는 문자열이어야 합니다."
                )
            if isinstance(value, bool) or not isinstance(
                value,
                int,
            ):
                raise ValueError(
                    "citation_counts의 value는 양의 int여야 합니다."
                )
            if value < 1:
                raise ValueError(
                    "citation_counts의 value는 양의 int여야 합니다."
                )

    @staticmethod
    def _validate_cross_result_consistency(
        answer_result: Mapping[str, Any],
        context_result: Mapping[str, Any],
        validation_result: Mapping[str, Any],
    ) -> None:
        if not (
            answer_result["query"]
            == context_result["query"]
            == validation_result["query"]
        ):
            raise RuntimeError(
                "Answer, Context, Citation Validation의 "
                "query가 일치하지 않습니다."
            )

        if (
            answer_result["answer_text"]
            != validation_result["answer_text"]
        ):
            raise RuntimeError(
                "Answer Result와 Citation Validation의 "
                "answer_text가 일치하지 않습니다."
            )

        answer_source_ids = list(answer_result["source_ids"])
        context_source_ids = list(context_result["source_ids"])
        available_source_ids = list(
            validation_result["available_source_ids"]
        )
        if not (
            answer_source_ids
            == context_source_ids
            == available_source_ids
        ):
            raise RuntimeError(
                "Answer, Context, Citation Validation의 "
                "사용 가능 출처번호가 일치하지 않습니다."
            )

        if (
            answer_result["context_count"]
            != context_result["context_count"]
        ):
            raise RuntimeError(
                "Answer와 Context의 context_count가 일치하지 않습니다."
            )

        source_id_set = set(answer_source_ids)
        valid_citation_ids = list(
            validation_result["valid_citation_ids"]
        )
        invalid_citation_ids = list(
            validation_result["invalid_citation_ids"]
        )
        unused_source_ids = list(
            validation_result["unused_source_ids"]
        )

        for citation_id in valid_citation_ids:
            if citation_id not in source_id_set:
                raise RuntimeError(
                    "valid_citation_ids가 source_ids 안에 없습니다."
                )

        for citation_id in invalid_citation_ids:
            if citation_id in source_id_set:
                raise RuntimeError(
                    "invalid_citation_ids가 source_ids 안에 존재합니다."
                )

        for source_id in unused_source_ids:
            if source_id not in source_id_set:
                raise RuntimeError(
                    "unused_source_ids가 source_ids 안에 없습니다."
                )

        if (
            set(valid_citation_ids) | set(unused_source_ids)
            != source_id_set
        ):
            raise RuntimeError(
                "valid_citation_ids와 unused_source_ids의 합집합이 "
                "source_ids와 일치하지 않습니다."
            )

    @staticmethod
    def _build_source_lookup(
        sources: Sequence[Mapping[str, Any]],
    ) -> dict[str, Mapping[str, Any]]:
        lookup: dict[str, Mapping[str, Any]] = {}
        for source in sources:
            citation_id = source["citation_id"]
            if citation_id in lookup:
                raise RuntimeError(
                    f"Context source에 중복 citation_id가 있습니다: "
                    f"{citation_id}"
                )
            lookup[citation_id] = source
        return lookup

    @staticmethod
    def _build_source_metadata(
        source: Mapping[str, Any],
        *,
        citation_count: int,
        first_occurrence_order: int | None,
        cited: bool,
    ) -> dict[str, Any]:
        return {
            "citation_id": source["citation_id"],
            "id": source["id"],
            "source_table": source["source_table"],
            "source_pk": source["source_pk"],
            "document_category": (
                source["document_category"]
            ),
            "document_type": (
                source.get("document_type")
            ),
            "law_name": source["law_name"],
            "chunk_type": source["chunk_type"],
            "article_no": source.get("article_no"),
            "title": source.get("title"),
            "header": source.get("header"),
            "ranking_rank": (
                source.get("ranking_rank")
            ),
            "ranking_score": float(
                source["ranking_score"]
            ),
            "text_truncated": bool(
                source.get("text_truncated", False)
            ),
            "cited": cited,
            "citation_count": citation_count,
            "first_occurrence_order": (
                first_occurrence_order
            ),
        }

    @classmethod
    def _build_cited_sources(
        cls,
        *,
        valid_citation_ids: Sequence[str],
        citation_occurrences: Sequence[str],
        citation_counts: Mapping[str, int],
        source_lookup: Mapping[str, Mapping[str, Any]],
    ) -> list[dict[str, Any]]:
        first_occurrence_order: dict[str, int] = {}
        for index, citation_id in enumerate(
            citation_occurrences,
            start=1,
        ):
            if citation_id not in first_occurrence_order:
                first_occurrence_order[citation_id] = index

        cited_sources: list[dict[str, Any]] = []
        for citation_id in valid_citation_ids:
            source = source_lookup.get(citation_id)
            if source is None:
                raise RuntimeError(
                    f"유효 Citation의 Context Metadata가 없습니다: "
                    f"{citation_id}"
                )
            cited_sources.append(
                cls._build_source_metadata(
                    source,
                    citation_count=int(
                        citation_counts[citation_id]
                    ),
                    first_occurrence_order=(
                        first_occurrence_order[citation_id]
                    ),
                    cited=True,
                )
            )
        return cited_sources

    @classmethod
    def _build_unused_sources(
        cls,
        *,
        unused_source_ids: Sequence[str],
        source_lookup: Mapping[str, Mapping[str, Any]],
    ) -> list[dict[str, Any]]:
        unused_sources: list[dict[str, Any]] = []
        for citation_id in unused_source_ids:
            source = source_lookup.get(citation_id)
            if source is None:
                raise RuntimeError(
                    f"미사용 출처의 Context Metadata가 없습니다: "
                    f"{citation_id}"
                )
            unused_sources.append(
                cls._build_source_metadata(
                    source,
                    citation_count=0,
                    first_occurrence_order=None,
                    cited=False,
                )
            )
        return unused_sources

    @classmethod
    def build(
        cls,
        answer_result: Mapping[str, Any],
        context_result: Mapping[str, Any],
        validation_result: Mapping[str, Any],
    ) -> dict[str, Any]:
        """
        Answer·Context·Citation Validation을 연결해
        최종 RAG 응답 구조를 생성한다.
        """
        cls._validate_answer_result(answer_result)
        cls._validate_context_result(context_result)
        cls._validate_validation_result(validation_result)
        cls._validate_cross_result_consistency(
            answer_result,
            context_result,
            validation_result,
        )

        source_lookup = cls._build_source_lookup(
            context_result["sources"]
        )
        cited_sources = cls._build_cited_sources(
            valid_citation_ids=validation_result[
                "valid_citation_ids"
            ],
            citation_occurrences=validation_result[
                "citation_occurrences"
            ],
            citation_counts=validation_result[
                "citation_counts"
            ],
            source_lookup=source_lookup,
        )
        unused_sources = cls._build_unused_sources(
            unused_source_ids=validation_result[
                "unused_source_ids"
            ],
            source_lookup=source_lookup,
        )

        return {
            "result_version": FINAL_RESULT_VERSION,
            "query": answer_result["query"],
            "answer_text": answer_result["answer_text"],
            "answer_chars": answer_result["answer_chars"],
            "provider": answer_result["provider"],
            "model": answer_result["model"],
            "finish_reason": (
                answer_result.get("finish_reason")
            ),
            "prompt_token_count": (
                answer_result.get("prompt_token_count")
            ),
            "candidate_token_count": (
                answer_result.get(
                    "candidate_token_count"
                )
            ),
            "total_token_count": (
                answer_result.get("total_token_count")
            ),
            "context_count": (
                answer_result["context_count"]
            ),
            "available_source_ids": list(
                answer_result["source_ids"]
            ),
            "citation_validation": {
                "status": (
                    validation_result[
                        "validation_status"
                    ]
                ),
                "is_valid": (
                    validation_result["is_valid"]
                ),
                "parsed_citation_ids": list(
                    validation_result[
                        "parsed_citation_ids"
                    ]
                ),
                "valid_citation_ids": list(
                    validation_result[
                        "valid_citation_ids"
                    ]
                ),
                "invalid_citation_ids": list(
                    validation_result[
                        "invalid_citation_ids"
                    ]
                ),
                "unused_source_ids": list(
                    validation_result[
                        "unused_source_ids"
                    ]
                ),
                "citation_occurrence_count": (
                    validation_result[
                        "citation_occurrence_count"
                    ]
                ),
                "unique_citation_count": (
                    validation_result[
                        "unique_citation_count"
                    ]
                ),
                "has_malformed_citation_candidates": (
                    validation_result[
                        "has_malformed_citation_candidates"
                    ]
                ),
                "malformed_citation_candidates": list(
                    validation_result[
                        "malformed_citation_candidates"
                    ]
                ),
                "messages": list(
                    validation_result[
                        "validation_messages"
                    ]
                ),
            },
            "cited_sources": cited_sources,
            "unused_sources": unused_sources,
            "cited_source_count": len(
                cited_sources
            ),
            "unused_source_count": len(
                unused_sources
            ),
        }

    @staticmethod
    def summarize(
        final_result: Mapping[str, Any],
    ) -> dict[str, Any]:
        return {
            "result_version": (
                final_result["result_version"]
            ),
            "provider": final_result["provider"],
            "model": final_result["model"],
            "context_count": (
                final_result["context_count"]
            ),
            "validation_status": (
                final_result[
                    "citation_validation"
                ]["status"]
            ),
            "citation_valid": (
                final_result[
                    "citation_validation"
                ]["is_valid"]
            ),
            "valid_citation_ids": list(
                final_result[
                    "citation_validation"
                ]["valid_citation_ids"]
            ),
            "invalid_citation_ids": list(
                final_result[
                    "citation_validation"
                ]["invalid_citation_ids"]
            ),
            "cited_source_count": (
                final_result["cited_source_count"]
            ),
            "unused_source_count": (
                final_result["unused_source_count"]
            ),
            "answer_chars": (
                final_result["answer_chars"]
            ),
            "total_token_count": (
                final_result["total_token_count"]
            ),
        }


def _copy_context(
    context_result: dict[str, Any],
) -> dict[str, Any]:
    return {
        **context_result,
        "source_ids": list(context_result["source_ids"]),
        "included_chunk_ids": list(
            context_result["included_chunk_ids"]
        ),
        "sources": [
            dict(source)
            for source in context_result["sources"]
        ],
    }


def _copy_validation(
    validation_result: dict[str, Any],
) -> dict[str, Any]:
    return {
        **validation_result,
        "available_source_ids": list(
            validation_result["available_source_ids"]
        ),
        "citation_occurrences": list(
            validation_result["citation_occurrences"]
        ),
        "parsed_citation_ids": list(
            validation_result["parsed_citation_ids"]
        ),
        "valid_citation_ids": list(
            validation_result["valid_citation_ids"]
        ),
        "invalid_citation_ids": list(
            validation_result["invalid_citation_ids"]
        ),
        "unused_source_ids": list(
            validation_result["unused_source_ids"]
        ),
        "citation_counts": dict(
            validation_result["citation_counts"]
        ),
        "malformed_citation_candidates": list(
            validation_result[
                "malformed_citation_candidates"
            ]
        ),
        "validation_messages": list(
            validation_result["validation_messages"]
        ),
    }


if __name__ == "__main__":
    sample_answer_result = {
        "query": "용도 외 사용 승인은 어떻게 하나요?",
        "provider": "gemini",
        "model": "test-model",
        "answer_text": (
            "승인신청이 필요합니다. [S2] "
            "추가 절차도 확인해야 합니다. [S1][S2]"
        ),
        "source_ids": ["S1", "S2", "S3"],
        "context_count": 3,
        "finish_reason": "STOP",
        "prompt_token_count": 100,
        "candidate_token_count": 50,
        "total_token_count": 150,
        "answer_chars": 0,
    }
    sample_answer_result["answer_chars"] = len(
        sample_answer_result["answer_text"]
    )

    sample_context_result = {
        "query": sample_answer_result["query"],
        "context_count": 3,
        "source_ids": ["S1", "S2", "S3"],
        "included_chunk_ids": [10, 20, 30],
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
                "title": "위탁사후관리물품 승인",
                "header": "위탁사후관리물품 승인",
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

    sample_validation_result = {
        "query": sample_answer_result["query"],
        "answer_text": (
            sample_answer_result["answer_text"]
        ),
        "validation_status": "VALID",
        "is_valid": True,
        "available_source_ids": [
            "S1",
            "S2",
            "S3",
        ],
        "citation_occurrences": [
            "S2",
            "S1",
            "S2",
        ],
        "parsed_citation_ids": [
            "S2",
            "S1",
        ],
        "valid_citation_ids": [
            "S2",
            "S1",
        ],
        "invalid_citation_ids": [],
        "unused_source_ids": ["S3"],
        "citation_counts": {
            "S2": 2,
            "S1": 1,
        },
        "citation_occurrence_count": 3,
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

    final_result = CitationResultBuilder.build(
        sample_answer_result,
        sample_context_result,
        sample_validation_result,
    )

    assert final_result["result_version"] == "1.0"
    assert final_result["answer_text"] == (
        sample_answer_result["answer_text"]
    )
    assert final_result["cited_source_count"] == 2
    assert final_result["unused_source_count"] == 1
    assert [
        row["citation_id"]
        for row in final_result["cited_sources"]
    ] == ["S2", "S1"]
    assert final_result["cited_sources"][0][
        "citation_count"
    ] == 2
    assert final_result["cited_sources"][0][
        "first_occurrence_order"
    ] == 1
    assert final_result["cited_sources"][1][
        "citation_count"
    ] == 1
    assert final_result["cited_sources"][1][
        "first_occurrence_order"
    ] == 2
    assert final_result["unused_sources"][0][
        "citation_id"
    ] == "S3"
    assert final_result["unused_sources"][0][
        "cited"
    ] is False
    assert final_result["unused_sources"][0][
        "citation_count"
    ] == 0

    mixed_answer = dict(sample_answer_result)
    mixed_answer["answer_text"] = (
        "정상 근거 [S1], 잘못된 근거 [S9]"
    )
    mixed_answer["answer_chars"] = len(
        mixed_answer["answer_text"]
    )
    mixed_validation = _copy_validation(
        sample_validation_result
    )
    mixed_validation["answer_text"] = mixed_answer[
        "answer_text"
    ]
    mixed_validation["validation_status"] = (
        "MIXED_CITATIONS"
    )
    mixed_validation["is_valid"] = False
    mixed_validation["citation_occurrences"] = [
        "S1",
        "S9",
    ]
    mixed_validation["parsed_citation_ids"] = [
        "S1",
        "S9",
    ]
    mixed_validation["valid_citation_ids"] = ["S1"]
    mixed_validation["invalid_citation_ids"] = ["S9"]
    mixed_validation["unused_source_ids"] = [
        "S2",
        "S3",
    ]
    mixed_validation["citation_counts"] = {
        "S1": 1,
        "S9": 1,
    }
    mixed_validation["citation_occurrence_count"] = 2
    mixed_validation["unique_citation_count"] = 2
    mixed_validation["valid_citation_count"] = 1
    mixed_validation["invalid_citation_count"] = 1
    mixed_validation["unused_source_count"] = 2
    mixed_validation["has_invalid_citations"] = True
    mixed_validation["validation_messages"] = [
        "답변에 유효한 출처번호와 사용할 수 없는 "
        "출처번호가 함께 포함되어 있습니다."
    ]

    mixed_final = CitationResultBuilder.build(
        mixed_answer,
        sample_context_result,
        mixed_validation,
    )
    assert mixed_final["citation_validation"][
        "status"
    ] == "MIXED_CITATIONS"
    assert mixed_final["citation_validation"][
        "is_valid"
    ] is False
    assert [
        row["citation_id"]
        for row in mixed_final["cited_sources"]
    ] == ["S1"]
    assert mixed_final["citation_validation"][
        "invalid_citation_ids"
    ] == ["S9"]
    assert all(
        row["citation_id"] != "S9"
        for row in mixed_final["cited_sources"]
    )
    assert all(
        row["citation_id"] != "S9"
        for row in mixed_final["unused_sources"]
    )

    no_citation_answer = dict(sample_answer_result)
    no_citation_answer["answer_text"] = (
        "제공된 자료에 따라 승인이 필요합니다."
    )
    no_citation_answer["answer_chars"] = len(
        no_citation_answer["answer_text"]
    )
    no_citation_validation = _copy_validation(
        sample_validation_result
    )
    no_citation_validation["answer_text"] = (
        no_citation_answer["answer_text"]
    )
    no_citation_validation["validation_status"] = (
        "NO_CITATIONS"
    )
    no_citation_validation["is_valid"] = False
    no_citation_validation["citation_occurrences"] = []
    no_citation_validation["parsed_citation_ids"] = []
    no_citation_validation["valid_citation_ids"] = []
    no_citation_validation["invalid_citation_ids"] = []
    no_citation_validation["unused_source_ids"] = [
        "S1",
        "S2",
        "S3",
    ]
    no_citation_validation["citation_counts"] = {}
    no_citation_validation[
        "citation_occurrence_count"
    ] = 0
    no_citation_validation["unique_citation_count"] = 0
    no_citation_validation["valid_citation_count"] = 0
    no_citation_validation["invalid_citation_count"] = 0
    no_citation_validation["unused_source_count"] = 3
    no_citation_validation["has_citations"] = False
    no_citation_validation["validation_messages"] = [
        "답변에 정식 출처번호가 없습니다."
    ]

    no_citation_final = CitationResultBuilder.build(
        no_citation_answer,
        sample_context_result,
        no_citation_validation,
    )
    assert no_citation_final["cited_sources"] == []
    assert no_citation_final["cited_source_count"] == 0
    assert no_citation_final["unused_source_count"] == 3
    assert [
        row["citation_id"]
        for row in no_citation_final["unused_sources"]
    ] == ["S1", "S2", "S3"]

    # Exception tests
    try:
        bad_answer = dict(sample_answer_result)
        bad_answer["query"] = "다른 질의"
        CitationResultBuilder.build(
            bad_answer,
            sample_context_result,
            sample_validation_result,
        )
    except RuntimeError as exc:
        assert "query" in str(exc)
    else:
        raise AssertionError("query 불일치 RuntimeError 미발생")

    try:
        bad_validation = _copy_validation(
            sample_validation_result
        )
        bad_validation["answer_text"] = "다른 답변 [S1]"
        CitationResultBuilder.build(
            sample_answer_result,
            sample_context_result,
            bad_validation,
        )
    except RuntimeError as exc:
        assert "answer_text" in str(exc)
    else:
        raise AssertionError(
            "answer_text 불일치 RuntimeError 미발생"
        )

    try:
        bad_context = _copy_context(sample_context_result)
        bad_context["source_ids"] = ["S1", "S2"]
        bad_context["context_count"] = 2
        bad_context["sources"] = bad_context["sources"][:2]
        CitationResultBuilder.build(
            sample_answer_result,
            bad_context,
            sample_validation_result,
        )
    except RuntimeError as exc:
        assert "출처번호" in str(exc) or "context_count" in str(
            exc
        )
    else:
        raise AssertionError(
            "source_ids 불일치 RuntimeError 미발생"
        )

    try:
        bad_context = _copy_context(sample_context_result)
        bad_context["context_count"] = 4
        CitationResultBuilder.build(
            sample_answer_result,
            bad_context,
            sample_validation_result,
        )
    except RuntimeError:
        pass
    else:
        raise AssertionError(
            "context_count 불일치 RuntimeError 미발생"
        )

    try:
        bad_context = _copy_context(sample_context_result)
        bad_context["sources"][1] = dict(
            bad_context["sources"][1]
        )
        bad_context["sources"][1]["citation_id"] = "S1"
        CitationResultBuilder.build(
            sample_answer_result,
            bad_context,
            sample_validation_result,
        )
    except RuntimeError as exc:
        assert "citation_id" in str(exc)
    else:
        raise AssertionError(
            "중복 citation_id RuntimeError 미발생"
        )

    try:
        bad_context = _copy_context(sample_context_result)
        bad_context["sources"] = bad_context["sources"][:2]
        bad_context["sources"].append(
            {
                "citation_id": "S3",
                "id": 99,
                "source_table": "admin_rule",
                "source_pk": 99,
                "document_category": "ADMIN_RULE",
                "document_type": "고시",
                "law_name": "다른 고시",
                "chunk_type": "ARTICLE",
                "article_no": "제1조",
                "title": "다른 조문",
                "header": "다른 조문",
                "ranking_rank": 3,
                "ranking_score": 0.70,
                "text_truncated": False,
            }
        )
        # Remove S2 metadata path: replace S2 with different id but keep citation S2
        # Actually test missing metadata for valid citation by emptying lookup via
        # removing S2 from sources while keeping source_ids inconsistent would fail earlier.
        # Instead: valid cites S2 but source_lookup built from sources missing S2
        # by making sources have S1,S3,S2 order mismatch - already validated.
        # Use direct call to _build_cited_sources.
        CitationResultBuilder._build_cited_sources(
            valid_citation_ids=["S2"],
            citation_occurrences=["S2"],
            citation_counts={"S2": 1},
            source_lookup={"S1": sample_context_result["sources"][0]},
        )
    except RuntimeError as exc:
        assert "Metadata" in str(exc) or "S2" in str(exc)
    else:
        raise AssertionError(
            "유효 Citation Metadata 누락 RuntimeError 미발생"
        )

    try:
        bad_answer = dict(sample_answer_result)
        bad_answer["answer_chars"] = 1
        CitationResultBuilder.build(
            bad_answer,
            sample_context_result,
            sample_validation_result,
        )
    except RuntimeError as exc:
        assert "answer_chars" in str(exc)
    else:
        raise AssertionError(
            "answer_chars 불일치 RuntimeError 미발생"
        )

    try:
        bad_context = _copy_context(sample_context_result)
        bad_context["sources"][0] = dict(
            bad_context["sources"][0]
        )
        bad_context["sources"][0]["ranking_score"] = 1.5
        CitationResultBuilder.build(
            sample_answer_result,
            bad_context,
            sample_validation_result,
        )
    except ValueError as exc:
        assert "ranking_score" in str(exc)
    else:
        raise AssertionError(
            "Ranking Score 범위 ValueError 미발생"
        )

    try:
        bad_validation = _copy_validation(
            sample_validation_result
        )
        bad_validation["valid_citation_ids"] = ["S9"]
        bad_validation["unused_source_ids"] = [
            "S1",
            "S2",
            "S3",
        ]
        CitationResultBuilder.build(
            sample_answer_result,
            sample_context_result,
            bad_validation,
        )
    except RuntimeError as exc:
        assert "valid_citation_ids" in str(exc)
    else:
        raise AssertionError(
            "valid Citation 부재 RuntimeError 미발생"
        )

    try:
        bad_validation = _copy_validation(
            sample_validation_result
        )
        bad_validation["invalid_citation_ids"] = ["S2"]
        bad_validation["valid_citation_ids"] = ["S1"]
        bad_validation["unused_source_ids"] = ["S3"]
        CitationResultBuilder.build(
            sample_answer_result,
            sample_context_result,
            bad_validation,
        )
    except RuntimeError as exc:
        assert "invalid_citation_ids" in str(exc)
    else:
        raise AssertionError(
            "invalid Citation 존재 RuntimeError 미발생"
        )

    print(
        "OK: STEP 9-4B Citation Metadata 연결 단위 테스트 완료"
    )

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

    query = (
        "사후관리 대상 물품의 용도 외 사용 승인은 "
        "어떻게 하나요?"
    )

    ranked_results = ranking_service.search(
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

    context_result = ContextBuilder.build(
        query,
        ranked_results,
        max_results=5,
        max_chunk_chars=3000,
        max_context_chars=12000,
    )

    prompt_result = PromptBuilder.build(
        context_result,
        max_system_prompt_chars=6000,
        max_user_prompt_chars=30000,
        max_combined_prompt_chars=36000,
    )

    llm = create_llm()
    answer_service = AnswerService(llm)
    answer_result = answer_service.generate_answer(
        prompt_result,
        temperature=0.2,
        max_output_tokens=2048,
    )

    original_answer_text = answer_result["answer_text"]
    validation_result = CitationValidator.validate(
        answer_result
    )

    final_result = CitationResultBuilder.build(
        answer_result,
        context_result,
        validation_result,
    )
    summary = CitationResultBuilder.summarize(
        final_result
    )

    print("query:", final_result["query"])
    print("provider:", summary["provider"])
    print("model:", summary["model"])
    print(
        "Citation 검증 상태:",
        summary["validation_status"],
    )
    print(
        "Citation 검증 성공:",
        summary["citation_valid"],
    )
    print(
        "유효 Citation:",
        summary["valid_citation_ids"],
    )
    print(
        "잘못된 Citation:",
        summary["invalid_citation_ids"],
    )
    print(
        "연결된 출처 수:",
        summary["cited_source_count"],
    )
    print(
        "미사용 출처 수:",
        summary["unused_source_count"],
    )
    print(
        "답변 문자 수:",
        summary["answer_chars"],
    )
    print(
        "전체 Token 수:",
        summary["total_token_count"],
    )

    for source in final_result["cited_sources"]:
        print(
            {
                "citation_id": source["citation_id"],
                "id": source["id"],
                "source_pk": source["source_pk"],
                "law_name": source["law_name"],
                "document_type": (
                    source["document_type"]
                ),
                "article_no": source["article_no"],
                "title": source["title"],
                "ranking_score": (
                    source["ranking_score"]
                ),
                "citation_count": (
                    source["citation_count"]
                ),
                "first_occurrence_order": (
                    source[
                        "first_occurrence_order"
                    ]
                ),
            }
        )

    print(
        "답변 preview:",
        final_result["answer_text"][:1000],
    )

    assert final_result["result_version"] == "1.0"
    assert (
        final_result["answer_text"]
        == original_answer_text
    )
    assert (
        final_result["answer_text"]
        == answer_result["answer_text"]
    )
    assert final_result["citation_validation"][
        "status"
    ] == validation_result["validation_status"]
    assert final_result["citation_validation"][
        "is_valid"
    ] is validation_result["is_valid"]
    assert [
        row["citation_id"]
        for row in final_result["cited_sources"]
    ] == list(validation_result["valid_citation_ids"])
    assert all(
        "id" in source and "source_pk" in source
        for source in final_result["cited_sources"]
    )
    invalid_ids = set(
        validation_result["invalid_citation_ids"]
    )
    assert all(
        source["citation_id"] not in invalid_ids
        for source in final_result["cited_sources"]
    )
    assert all(
        source["citation_id"] not in invalid_ids
        for source in final_result["unused_sources"]
    )
    assert [
        row["citation_id"]
        for row in final_result["unused_sources"]
    ] == list(validation_result["unused_source_ids"])
    assert final_result["cited_source_count"] == len(
        final_result["cited_sources"]
    )
    assert final_result["unused_source_count"] == len(
        final_result["unused_sources"]
    )

    print(
        "OK: STEP 9-4B Citation Metadata 연결 및 응답 표준화 완료"
    )
