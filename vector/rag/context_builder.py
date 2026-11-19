# context_builder.py
#
# 역할: Ranking 결과를 출처 기반 RAG Context와
#       출처 Metadata로 변환한다.

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

from vector.chunk_generator.embedding_service import (
    EmbeddingService,
)
from vector.chunk_generator.supabase_repository import (
    SupabaseRepository,
)
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

DEFAULT_CONTEXT_MAX_RESULTS = 8
MAX_CONTEXT_MAX_RESULTS = 50

DEFAULT_MAX_CHUNK_CHARS = 4_000
MAX_CHUNK_CHARS_LIMIT = 20_000

DEFAULT_MAX_CONTEXT_CHARS = 16_000
MAX_CONTEXT_CHARS_LIMIT = 100_000

CONTEXT_CITATION_PREFIX = "S"
CONTEXT_TRUNCATION_MARKER = "\n[본문 일부 생략]"

MAX_QUERY_LENGTH = 2000

_REQUIRED_RANKED_FIELDS = (
    "id",
    "source_table",
    "source_pk",
    "document_category",
    "law_name",
    "chunk_type",
    "ranking_score",
)


class ContextBuilder:
    """
    Ranking 결과를 출처 기반 RAG Context와
    출처 Metadata로 변환한다.
    """

    @staticmethod
    def _validate_parameters(
        *,
        max_results: int,
        max_chunk_chars: int,
        max_context_chars: int,
    ) -> None:
        if isinstance(max_results, bool) or not isinstance(
            max_results,
            int,
        ):
            raise TypeError("max_results는 정수여야 합니다.")
        if max_results < 1 or max_results > MAX_CONTEXT_MAX_RESULTS:
            raise ValueError(
                "max_results는 1 이상 50 이하여야 합니다."
            )

        if isinstance(max_chunk_chars, bool) or not isinstance(
            max_chunk_chars,
            int,
        ):
            raise TypeError(
                "max_chunk_chars는 정수여야 합니다."
            )
        if max_chunk_chars < 100 or max_chunk_chars > MAX_CHUNK_CHARS_LIMIT:
            raise ValueError(
                "max_chunk_chars는 100 이상 20000 이하여야 합니다."
            )

        if isinstance(max_context_chars, bool) or not isinstance(
            max_context_chars,
            int,
        ):
            raise TypeError(
                "max_context_chars는 정수여야 합니다."
            )
        if (
            max_context_chars < 500
            or max_context_chars > MAX_CONTEXT_CHARS_LIMIT
        ):
            raise ValueError(
                "max_context_chars는 500 이상 100000 이하여야 합니다."
            )

    @staticmethod
    def _validate_ranked_result(
        row: Mapping[str, Any],
    ) -> None:
        if not isinstance(row, Mapping):
            raise TypeError(
                "Ranking 결과의 각 항목은 Mapping이어야 합니다."
            )

        for field_name in _REQUIRED_RANKED_FIELDS:
            if field_name not in row:
                raise RuntimeError(
                    f"Context 입력 필수값이 없습니다: {field_name}"
                )

        chunk_id = row["id"]
        if isinstance(chunk_id, bool) or not isinstance(chunk_id, int):
            raise RuntimeError(
                "Context 입력 id가 올바르지 않습니다."
            )
        if chunk_id < 1:
            raise RuntimeError(
                "Context 입력 id가 올바르지 않습니다."
            )

        source_pk = row["source_pk"]
        if isinstance(source_pk, bool) or not isinstance(source_pk, int):
            raise RuntimeError(
                "Context 입력 source_pk가 올바르지 않습니다."
            )
        if source_pk < 1:
            raise RuntimeError(
                "Context 입력 source_pk가 올바르지 않습니다."
            )

        for field_name in (
            "source_table",
            "document_category",
            "law_name",
            "chunk_type",
        ):
            value = row[field_name]
            if not isinstance(value, str) or value.strip() == "":
                raise RuntimeError(
                    f"Context 입력 필수값이 없습니다: {field_name}"
                )

        ranking_score = row["ranking_score"]
        if isinstance(ranking_score, bool) or not isinstance(
            ranking_score,
            (int, float),
        ):
            raise RuntimeError(
                "Context 입력 ranking_score가 올바르지 않습니다."
            )
        cleaned_score = float(ranking_score)
        if not math.isfinite(cleaned_score):
            raise RuntimeError(
                "Context 입력 ranking_score가 올바르지 않습니다."
            )
        if cleaned_score < 0 or cleaned_score > 1:
            raise RuntimeError(
                "Context 입력 ranking_score가 올바르지 않습니다."
            )

    @staticmethod
    def _select_context_text(
        row: Mapping[str, Any],
    ) -> str | None:
        """
        Context에 사용할 본문을 선택한다.
        """
        for field_name in ("chunk_text", "body"):
            value = row.get(field_name)
            if not isinstance(value, str):
                continue
            cleaned = value.strip()
            if cleaned:
                return cleaned
        return None

    @staticmethod
    def _truncate_text(
        text: str,
        *,
        max_chars: int,
    ) -> tuple[str, bool]:
        """
        본문을 최대 문자 수에 맞춰 자른다.
        """
        if not isinstance(text, str):
            raise TypeError("text는 문자열이어야 합니다.")
        if isinstance(max_chars, bool) or not isinstance(max_chars, int):
            raise TypeError("max_chars는 정수여야 합니다.")
        if max_chars < 1:
            raise ValueError("max_chars는 1 이상이어야 합니다.")

        if len(text) <= max_chars:
            return text, False

        available_chars = (
            max_chars
            - len(CONTEXT_TRUNCATION_MARKER)
        )
        if available_chars < 1:
            raise ValueError(
                "max_chars가 truncation marker보다 짧습니다."
            )

        candidate = text[:available_chars]
        split_index = max(
            candidate.rfind("\n"),
            candidate.rfind(" "),
        )
        if split_index >= 1:
            candidate = candidate[:split_index]

        truncated = f"{candidate}{CONTEXT_TRUNCATION_MARKER}"
        if len(truncated) > max_chars:
            hard_limit = max_chars - len(CONTEXT_TRUNCATION_MARKER)
            truncated = (
                f"{text[:hard_limit]}{CONTEXT_TRUNCATION_MARKER}"
            )
        return truncated, True

    @staticmethod
    def _build_source_header(
        citation_id: str,
        row: Mapping[str, Any],
    ) -> str:
        if (
            not isinstance(citation_id, str)
            or citation_id.strip() == ""
            or " " in citation_id
        ):
            raise ValueError(
                "citation_id 형식이 올바르지 않습니다."
            )

        lines = [f"[{citation_id}]"]

        law_name = row.get("law_name")
        if isinstance(law_name, str) and law_name.strip():
            lines.append(f"문서명: {law_name}")

        document_type = row.get("document_type")
        if isinstance(document_type, str) and document_type.strip():
            lines.append(f"문서유형: {document_type}")

        document_category = row.get("document_category")
        if (
            isinstance(document_category, str)
            and document_category.strip()
        ):
            lines.append(f"자료구분: {document_category}")

        article_no = row.get("article_no")
        if isinstance(article_no, str) and article_no.strip():
            lines.append(f"조문: {article_no}")

        title = row.get("title")
        if isinstance(title, str) and title.strip():
            lines.append(f"제목: {title}")

        ranking_rank = row.get("ranking_rank")
        if (
            not isinstance(ranking_rank, bool)
            and isinstance(ranking_rank, int)
            and ranking_rank >= 1
        ):
            lines.append(f"검색순위: {ranking_rank}")

        ranking_score = float(row["ranking_score"])
        lines.append(f"검색점수: {ranking_score:.6f}")

        return "\n".join(lines)

    @classmethod
    def _build_context_block(
        cls,
        citation_id: str,
        row: Mapping[str, Any],
        *,
        max_chunk_chars: int,
    ) -> tuple[str, bool] | None:
        text = cls._select_context_text(row)
        if text is None:
            return None

        truncated_text, was_truncated = cls._truncate_text(
            text,
            max_chars=max_chunk_chars,
        )
        header = cls._build_source_header(
            citation_id,
            row,
        )
        block = (
            f"{header}\n\n"
            f"본문:\n"
            f"{truncated_text}"
        ).rstrip()
        return block, was_truncated

    @classmethod
    def _build_first_block_within_limit(
        cls,
        citation_id: str,
        row: Mapping[str, Any],
        *,
        max_context_chars: int,
    ) -> tuple[str, bool]:
        text = cls._select_context_text(row)
        if text is None:
            raise ValueError(
                "RAG Context에 포함할 수 있는 검색 결과가 없습니다."
            )

        header = cls._build_source_header(citation_id, row)
        prefix = f"{header}\n\n본문:\n"
        remaining = max_context_chars - len(prefix)
        if remaining < 1:
            raise RuntimeError(
                "max_context_chars가 Context 헤더를 담을 수 없습니다."
            )

        if len(text) <= remaining:
            block = f"{prefix}{text}".rstrip()
            if len(block) > max_context_chars:
                raise RuntimeError(
                    "max_context_chars가 Context 헤더를 담을 수 없습니다."
                )
            return block, False

        if remaining <= len(CONTEXT_TRUNCATION_MARKER):
            raise RuntimeError(
                "max_context_chars가 Context 헤더를 담을 수 없습니다."
            )

        truncated_text, _ = cls._truncate_text(
            text,
            max_chars=remaining,
        )
        block = f"{prefix}{truncated_text}".rstrip()
        if len(block) > max_context_chars:
            raise RuntimeError(
                "max_context_chars가 Context 헤더를 담을 수 없습니다."
            )
        return block, True

    @classmethod
    def build(
        cls,
        query: str,
        ranked_results: Sequence[Mapping[str, Any]],
        *,
        max_results: int = DEFAULT_CONTEXT_MAX_RESULTS,
        max_chunk_chars: int = DEFAULT_MAX_CHUNK_CHARS,
        max_context_chars: int = DEFAULT_MAX_CONTEXT_CHARS,
    ) -> dict[str, Any]:
        """
        Ranking 결과로부터 RAG Context와 출처 Metadata를 생성한다.
        """
        if not isinstance(query, str):
            raise TypeError("query는 문자열이어야 합니다.")

        cleaned_query = query.strip()
        if cleaned_query == "":
            raise ValueError("query는 필수입니다.")
        if len(cleaned_query) > MAX_QUERY_LENGTH:
            raise ValueError(
                "query는 2000자 이하여야 합니다."
            )

        if isinstance(ranked_results, (str, bytes)):
            raise TypeError(
                "ranked_results는 Mapping Sequence여야 합니다."
            )

        cls._validate_parameters(
            max_results=max_results,
            max_chunk_chars=max_chunk_chars,
            max_context_chars=max_context_chars,
        )

        rows = list(ranked_results)
        for row in rows:
            cls._validate_ranked_result(row)

        unique_rows: list[Mapping[str, Any]] = []
        seen_ids: set[int] = set()
        duplicate_chunk_ids: list[int] = []
        for row in rows:
            chunk_id = int(row["id"])
            if chunk_id in seen_ids:
                if chunk_id not in duplicate_chunk_ids:
                    duplicate_chunk_ids.append(chunk_id)
                continue
            seen_ids.add(chunk_id)
            unique_rows.append(row)

        separator = "\n\n---\n\n"
        context_parts: list[str] = []
        sources: list[dict[str, Any]] = []
        included_chunk_ids: list[int] = []
        excluded_chunk_ids: list[int] = []
        truncated_chunk_ids: list[int] = []

        for row in unique_rows:
            if len(sources) >= max_results:
                break

            chunk_id = int(row["id"])
            citation_index = len(sources) + 1
            citation_id = (
                f"{CONTEXT_CITATION_PREFIX}{citation_index}"
            )

            built = cls._build_context_block(
                citation_id,
                row,
                max_chunk_chars=max_chunk_chars,
            )
            if built is None:
                excluded_chunk_ids.append(chunk_id)
                continue

            block, was_truncated = built
            if not context_parts:
                candidate_text = block
            else:
                candidate_text = (
                    separator.join(context_parts)
                    + separator
                    + block
                )

            if len(candidate_text) > max_context_chars:
                if context_parts:
                    excluded_chunk_ids.append(chunk_id)
                    break

                block, was_truncated = (
                    cls._build_first_block_within_limit(
                        citation_id,
                        row,
                        max_context_chars=max_context_chars,
                    )
                )
                candidate_text = block

            context_parts.append(block)
            included_chunk_ids.append(chunk_id)
            if was_truncated:
                truncated_chunk_ids.append(chunk_id)

            sources.append(
                {
                    "citation_id": citation_id,
                    "id": row["id"],
                    "source_table": row["source_table"],
                    "source_pk": row["source_pk"],
                    "document_category": row[
                        "document_category"
                    ],
                    "document_type": row.get("document_type"),
                    "law_name": row["law_name"],
                    "chunk_type": row["chunk_type"],
                    "article_no": row.get("article_no"),
                    "title": row.get("title"),
                    "header": row.get("header"),
                    "ranking_rank": row.get("ranking_rank"),
                    "ranking_score": float(
                        row["ranking_score"]
                    ),
                    "text_truncated": was_truncated,
                }
            )

        if not sources:
            raise ValueError(
                "RAG Context에 포함할 수 있는 검색 결과가 없습니다."
            )

        context_text = separator.join(context_parts)
        if len(context_text) > max_context_chars:
            raise RuntimeError(
                "생성된 Context가 max_context_chars를 초과했습니다."
            )

        return {
            "query": cleaned_query,
            "context_text": context_text,
            "context_count": len(sources),
            "source_ids": [
                source["citation_id"] for source in sources
            ],
            "included_chunk_ids": included_chunk_ids,
            "excluded_chunk_ids": excluded_chunk_ids,
            "duplicate_chunk_ids": duplicate_chunk_ids,
            "truncated_chunk_ids": truncated_chunk_ids,
            "total_context_chars": len(context_text),
            "sources": sources,
        }

    @staticmethod
    def summarize(
        context_result: Mapping[str, Any],
    ) -> dict[str, Any]:
        return {
            "context_count": context_result["context_count"],
            "source_ids": list(context_result["source_ids"]),
            "included_chunk_ids": list(
                context_result["included_chunk_ids"]
            ),
            "excluded_chunk_ids": list(
                context_result["excluded_chunk_ids"]
            ),
            "duplicate_chunk_ids": list(
                context_result["duplicate_chunk_ids"]
            ),
            "truncated_chunk_ids": list(
                context_result["truncated_chunk_ids"]
            ),
            "total_context_chars": (
                context_result["total_context_chars"]
            ),
        }


if __name__ == "__main__":
    sample_results = [
        {
            "id": 10,
            "source_table": "admin_rule",
            "source_pk": 10,
            "document_category": "ADMIN_RULE",
            "document_type": "고시",
            "law_name": "사후관리에 관한 고시",
            "chunk_type": "ARTICLE",
            "article_no": "제29조",
            "title": "제29조(용도 외 사용 승인신청)",
            "header": "제29조(용도 외 사용 승인신청)",
            "body": "짧은 본문",
            "chunk_text": (
                "행정규칙\n\n사후관리에 관한 고시\n\n"
                "제29조\n\n" + "테스트 본문 " * 100
            ),
            "ranking_rank": 1,
            "ranking_score": 0.95,
        },
        {
            "id": 20,
            "source_table": "admin_rule",
            "source_pk": 20,
            "document_category": "ADMIN_RULE",
            "document_type": "고시",
            "law_name": "사후관리에 관한 고시",
            "chunk_type": "ARTICLE",
            "article_no": "제11조",
            "title": "제11조(용도 외 사용 승인)",
            "header": "제11조(용도 외 사용 승인)",
            "body": "두 번째 본문",
            "chunk_text": "두 번째 청크 본문",
            "ranking_rank": 2,
            "ranking_score": 0.90,
        },
    ]

    context_result = ContextBuilder.build(
        "용도 외 사용 승인",
        sample_results,
        max_results=2,
        max_chunk_chars=300,
        max_context_chars=1000,
    )

    assert context_result["context_count"] == 2
    assert context_result["source_ids"] == ["S1", "S2"]
    assert context_result["included_chunk_ids"] == [10, 20]
    assert context_result["total_context_chars"] <= 1000
    assert "[S1]" in context_result["context_text"]
    assert "[S2]" in context_result["context_text"]
    assert "문서명: 사후관리에 관한 고시" in (
        context_result["context_text"]
    )
    assert "본문:" in context_result["context_text"]
    assert 10 in context_result["truncated_chunk_ids"]
    assert "[본문 일부 생략]" in (
        context_result["context_text"]
    )

    duplicate_results = [
        sample_results[0],
        dict(sample_results[0]),
        sample_results[1],
    ]
    duplicate_context = ContextBuilder.build(
        "용도 외 사용 승인",
        duplicate_results,
    )
    assert duplicate_context["context_count"] == 2
    assert duplicate_context["duplicate_chunk_ids"] == [10]

    no_text_result = {
        **sample_results[0],
        "id": 30,
        "source_pk": 30,
        "chunk_text": None,
        "body": " ",
    }
    try:
        ContextBuilder.build(
            "용도 외 사용 승인",
            [no_text_result],
        )
    except ValueError as exc:
        assert "RAG Context에 포함할 수 있는 검색 결과가 없습니다" in (
            str(exc)
        )
    else:
        raise AssertionError(
            "본문 없는 결과 ValueError가 발생하지 않았습니다."
        )

    try:
        ContextBuilder.build("   ", sample_results)
    except ValueError as exc:
        assert str(exc) == "query는 필수입니다."
    else:
        raise AssertionError(
            "빈 query ValueError가 발생하지 않았습니다."
        )

    try:
        ContextBuilder.build(
            "용도 외 사용 승인",
            sample_results,
            max_results=0,
        )
    except ValueError:
        pass
    else:
        raise AssertionError(
            "max_results=0 ValueError가 발생하지 않았습니다."
        )

    try:
        ContextBuilder.build(
            "용도 외 사용 승인",
            sample_results,
            max_chunk_chars=99,
        )
    except ValueError:
        pass
    else:
        raise AssertionError(
            "max_chunk_chars=99 ValueError가 발생하지 않았습니다."
        )

    try:
        ContextBuilder.build(
            "용도 외 사용 승인",
            sample_results,
            max_context_chars=499,
        )
    except ValueError:
        pass
    else:
        raise AssertionError(
            "max_context_chars=499 ValueError가 발생하지 않았습니다."
        )

    print("OK: STEP 9-1 Context Builder 단위 테스트 완료")

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
    summary = ContextBuilder.summarize(context_result)

    print("query:", query)
    print(
        "Ranking 결과 수:",
        len(ranked_results),
    )
    print(
        "Context 포함 수:",
        summary["context_count"],
    )
    print(
        "출처번호:",
        summary["source_ids"],
    )
    print(
        "포함 chunk ids:",
        summary["included_chunk_ids"],
    )
    print(
        "제외 chunk ids:",
        summary["excluded_chunk_ids"],
    )
    print(
        "잘린 chunk ids:",
        summary["truncated_chunk_ids"],
    )
    print(
        "Context 문자 수:",
        summary["total_context_chars"],
    )

    for source in context_result["sources"]:
        print(
            {
                "citation_id": source["citation_id"],
                "id": source["id"],
                "source_pk": source["source_pk"],
                "law_name": source["law_name"],
                "article_no": source["article_no"],
                "title": source["title"],
                "ranking_score": source["ranking_score"],
                "text_truncated": source["text_truncated"],
            }
        )

    print(
        "Context preview:",
        context_result["context_text"][:500],
    )

    assert len(ranked_results) == 10
    assert 1 <= summary["context_count"] <= 5
    expected_source_ids = [
        f"S{index}"
        for index in range(1, summary["context_count"] + 1)
    ]
    assert summary["source_ids"] == expected_source_ids
    assert len(set(summary["included_chunk_ids"])) == len(
        summary["included_chunk_ids"]
    )
    assert summary["total_context_chars"] <= 12000
    assert "[S1]" in context_result["context_text"]
    assert "문서명:" in context_result["context_text"]
    assert "본문:" in context_result["context_text"]
    assert len(context_result["sources"]) == summary[
        "context_count"
    ]
    assert all(
        "citation_id" in source
        for source in context_result["sources"]
    )
    assert any(
        source["law_name"] == "사후관리에 관한 고시"
        for source in context_result["sources"]
    )
    title_tokens = (
        "용도 외 사용",
        "승인신청",
        "위탁사후관리물품",
    )
    assert any(
        any(
            token in str(source.get("title") or "")
            for token in title_tokens
        )
        for source in context_result["sources"]
    )

    print("OK: STEP 9-1 RAG Context Builder 연동 완료")
