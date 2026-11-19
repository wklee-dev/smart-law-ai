# hybrid_search_service.py
#
# 역할: Vector Search와 Keyword Search 결과를 병합하여
#       기본 Hybrid Score 순으로 반환한다.

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
from vector.search.keyword_search_service import (
    KeywordSearchService,
)
from vector.search.query_search_service import (
    QuerySearchService,
)

DEFAULT_HYBRID_MATCH_COUNT = 10
MAX_HYBRID_MATCH_COUNT = 100

DEFAULT_VECTOR_WEIGHT = 0.65
DEFAULT_KEYWORD_WEIGHT = 0.35

DEFAULT_CANDIDATE_MULTIPLIER = 3
MAX_CANDIDATE_MULTIPLIER = 10

HYBRID_CHANNEL_VECTOR = "VECTOR"
HYBRID_CHANNEL_KEYWORD = "KEYWORD"

MAX_QUERY_LENGTH = 2000

_COMMON_DOCUMENT_FIELDS = (
    "id",
    "source_table",
    "source_pk",
    "document_category",
    "document_type",
    "law_name",
    "chunk_type",
    "article_no",
    "title",
    "header",
    "body",
    "chunk_text",
    "keywords",
    "metadata",
)


class HybridSearchService:
    """
    Vector Search와 Keyword Search 결과를 병합하여
    기본 Hybrid Score 순으로 반환한다.
    """

    def __init__(
        self,
        query_search_service: QuerySearchService,
        keyword_search_service: KeywordSearchService,
    ) -> None:
        if query_search_service is None:
            raise TypeError(
                "query_search_service는 필수입니다."
            )
        if keyword_search_service is None:
            raise TypeError(
                "keyword_search_service는 필수입니다."
            )
        self.query_search_service = query_search_service
        self.keyword_search_service = keyword_search_service

    @staticmethod
    def _normalize_vector_similarity(
        similarity: float,
    ) -> float:
        """
        cosine similarity -1~1 값을 0~1 범위로 변환한다.
        """
        if isinstance(similarity, bool) or not isinstance(
            similarity,
            (int, float),
        ):
            raise TypeError(
                "vector similarity는 숫자여야 합니다."
            )

        cleaned_similarity = float(similarity)
        if not math.isfinite(cleaned_similarity):
            raise ValueError(
                "vector similarity는 유효한 숫자여야 합니다."
            )
        if cleaned_similarity < -1 or cleaned_similarity > 1:
            raise ValueError(
                "vector similarity는 -1 이상 1 이하여야 합니다."
            )

        normalized = (
            cleaned_similarity + 1.0
        ) / 2.0
        return min(
            1.0,
            max(0.0, normalized),
        )

    @staticmethod
    def _validate_weights(
        vector_weight: float,
        keyword_weight: float,
    ) -> tuple[float, float]:
        if isinstance(vector_weight, bool) or not isinstance(
            vector_weight,
            (int, float),
        ):
            raise TypeError(
                "vector_weight는 숫자여야 합니다."
            )
        if isinstance(keyword_weight, bool) or not isinstance(
            keyword_weight,
            (int, float),
        ):
            raise TypeError(
                "keyword_weight는 숫자여야 합니다."
            )

        cleaned_vector_weight = float(vector_weight)
        cleaned_keyword_weight = float(keyword_weight)

        if not math.isfinite(cleaned_vector_weight):
            raise ValueError(
                "vector_weight는 유효한 숫자여야 합니다."
            )
        if not math.isfinite(cleaned_keyword_weight):
            raise ValueError(
                "keyword_weight는 유효한 숫자여야 합니다."
            )
        if cleaned_vector_weight < 0 or cleaned_vector_weight > 1:
            raise ValueError(
                "vector_weight는 0 이상 1 이하여야 합니다."
            )
        if (
            cleaned_keyword_weight < 0
            or cleaned_keyword_weight > 1
        ):
            raise ValueError(
                "keyword_weight는 0 이상 1 이하여야 합니다."
            )

        if not math.isclose(
            cleaned_vector_weight + cleaned_keyword_weight,
            1.0,
            rel_tol=1e-9,
            abs_tol=1e-9,
        ):
            raise ValueError(
                "vector_weight와 keyword_weight의 합은 "
                "1.0이어야 합니다."
            )

        return cleaned_vector_weight, cleaned_keyword_weight

    @staticmethod
    def _validate_search_parameters(
        *,
        match_count: int,
        candidate_multiplier: int,
    ) -> tuple[int, int]:
        if isinstance(match_count, bool) or not isinstance(
            match_count,
            int,
        ):
            raise TypeError(
                "match_count는 정수여야 합니다."
            )
        if match_count < 1 or match_count > MAX_HYBRID_MATCH_COUNT:
            raise ValueError(
                "match_count는 1 이상 100 이하여야 합니다."
            )

        if isinstance(candidate_multiplier, bool) or not isinstance(
            candidate_multiplier,
            int,
        ):
            raise TypeError(
                "candidate_multiplier는 정수여야 합니다."
            )
        if (
            candidate_multiplier < 1
            or candidate_multiplier > MAX_CANDIDATE_MULTIPLIER
        ):
            raise ValueError(
                "candidate_multiplier는 1 이상 10 이하여야 합니다."
            )

        candidate_count = min(
            MAX_HYBRID_MATCH_COUNT,
            match_count * candidate_multiplier,
        )
        return match_count, candidate_count

    @staticmethod
    def _validate_positive_id(chunk_id: Any) -> int:
        if isinstance(chunk_id, bool) or not isinstance(chunk_id, int):
            raise TypeError(
                "검색 결과 id는 양의 정수여야 합니다."
            )
        if chunk_id < 1:
            raise ValueError(
                "검색 결과 id는 양의 정수여야 합니다."
            )
        return chunk_id

    @staticmethod
    def _copy_common_fields(
        row: Mapping[str, Any],
    ) -> dict[str, Any]:
        return {
            field_name: row.get(field_name)
            for field_name in _COMMON_DOCUMENT_FIELDS
        }

    @staticmethod
    def _merge_results(
        vector_results: Sequence[Mapping[str, Any]],
        keyword_results: Sequence[Mapping[str, Any]],
        *,
        vector_weight: float,
        keyword_weight: float,
    ) -> list[dict[str, Any]]:
        """
        Vector와 Keyword 결과를 id 기준으로 병합한다.
        """
        if isinstance(vector_results, (str, bytes)):
            raise TypeError(
                "vector_results는 Mapping Sequence여야 합니다."
            )
        if isinstance(keyword_results, (str, bytes)):
            raise TypeError(
                "keyword_results는 Mapping Sequence여야 합니다."
            )

        merged: dict[int, dict[str, Any]] = {}
        seen_vector_ids: set[int] = set()
        seen_keyword_ids: set[int] = set()

        for vector_rank, row in enumerate(vector_results, start=1):
            if not isinstance(row, Mapping):
                raise TypeError(
                    "vector_results의 모든 항목은 Mapping이어야 합니다."
                )
            if "id" not in row:
                raise RuntimeError(
                    "Vector Search 결과 필수값이 없습니다: id"
                )
            if "similarity" not in row:
                raise RuntimeError(
                    "Vector Search 결과 필수값이 없습니다: similarity"
                )

            chunk_id = HybridSearchService._validate_positive_id(
                row["id"]
            )
            if chunk_id in seen_vector_ids:
                raise RuntimeError(
                    f"검색 채널 내부에 중복 id가 있습니다: {chunk_id}"
                )
            seen_vector_ids.add(chunk_id)

            normalized_vector_score = (
                HybridSearchService._normalize_vector_similarity(
                    row["similarity"]
                )
            )
            entry = HybridSearchService._copy_common_fields(row)
            entry.update(
                {
                    "vector_similarity": float(row["similarity"]),
                    "normalized_vector_score": (
                        normalized_vector_score
                    ),
                    "vector_rank": vector_rank,
                    "keyword_score": 0.0,
                    "keyword_rank": None,
                    "matched_keywords": [],
                    "exact_match_count": 0,
                    "partial_match_count": 0,
                    "matched_channels": [HYBRID_CHANNEL_VECTOR],
                }
            )
            merged[chunk_id] = entry

        for keyword_rank, row in enumerate(keyword_results, start=1):
            if not isinstance(row, Mapping):
                raise TypeError(
                    "keyword_results의 모든 항목은 Mapping이어야 합니다."
                )
            if "id" not in row:
                raise RuntimeError(
                    "Keyword Search 결과 필수값이 없습니다: id"
                )
            if "keyword_score" not in row:
                raise RuntimeError(
                    "Keyword Search 결과 필수값이 없습니다: "
                    "keyword_score"
                )

            chunk_id = HybridSearchService._validate_positive_id(
                row["id"]
            )
            if chunk_id in seen_keyword_ids:
                raise RuntimeError(
                    f"검색 채널 내부에 중복 id가 있습니다: {chunk_id}"
                )
            seen_keyword_ids.add(chunk_id)

            keyword_score = row["keyword_score"]
            if isinstance(keyword_score, bool) or not isinstance(
                keyword_score,
                (int, float),
            ):
                raise TypeError(
                    "keyword_score는 숫자여야 합니다."
                )
            cleaned_keyword_score = float(keyword_score)
            if not math.isfinite(cleaned_keyword_score):
                raise ValueError(
                    "keyword_score는 유효한 숫자여야 합니다."
                )
            if (
                cleaned_keyword_score < 0
                or cleaned_keyword_score > 1
            ):
                raise ValueError(
                    "keyword_score는 0 이상 1 이하여야 합니다."
                )

            matched_keywords = row.get("matched_keywords", [])
            if matched_keywords is None:
                matched_keywords = []
            if not isinstance(matched_keywords, list):
                matched_keywords = list(matched_keywords)

            if chunk_id in merged:
                entry = merged[chunk_id]
                entry["keyword_score"] = cleaned_keyword_score
                entry["keyword_rank"] = keyword_rank
                entry["matched_keywords"] = list(matched_keywords)
                entry["exact_match_count"] = int(
                    row.get("exact_match_count", 0) or 0
                )
                entry["partial_match_count"] = int(
                    row.get("partial_match_count", 0) or 0
                )
                if HYBRID_CHANNEL_KEYWORD not in entry[
                    "matched_channels"
                ]:
                    entry["matched_channels"] = [
                        HYBRID_CHANNEL_VECTOR,
                        HYBRID_CHANNEL_KEYWORD,
                    ]
            else:
                entry = HybridSearchService._copy_common_fields(row)
                entry.update(
                    {
                        "vector_similarity": None,
                        "normalized_vector_score": 0.0,
                        "vector_rank": None,
                        "keyword_score": cleaned_keyword_score,
                        "keyword_rank": keyword_rank,
                        "matched_keywords": list(matched_keywords),
                        "exact_match_count": int(
                            row.get("exact_match_count", 0) or 0
                        ),
                        "partial_match_count": int(
                            row.get("partial_match_count", 0) or 0
                        ),
                        "matched_channels": [
                            HYBRID_CHANNEL_KEYWORD
                        ],
                    }
                )
                merged[chunk_id] = entry

        results: list[dict[str, Any]] = []
        for entry in merged.values():
            hybrid_score = math.fsum(
                (
                    entry["normalized_vector_score"] * vector_weight,
                    entry["keyword_score"] * keyword_weight,
                )
            )
            hybrid_score = min(1.0, max(0.0, float(hybrid_score)))
            result = dict(entry)
            result["hybrid_score"] = hybrid_score
            results.append(result)

        results.sort(
            key=lambda row: (
                -float(row["hybrid_score"]),
                -float(row["normalized_vector_score"]),
                -float(row["keyword_score"]),
                int(row["id"]),
            )
        )
        return results

    def _execute_search(
        self,
        query: str,
        *,
        match_count: int = DEFAULT_HYBRID_MATCH_COUNT,
        match_threshold: float = 0.0,
        vector_weight: float = DEFAULT_VECTOR_WEIGHT,
        keyword_weight: float = DEFAULT_KEYWORD_WEIGHT,
        candidate_multiplier: int = (
            DEFAULT_CANDIDATE_MULTIPLIER
        ),
        document_category: str | None = None,
        document_type: str | None = None,
        source_table: str | None = None,
        chunk_type: str | None = None,
    ) -> dict[str, Any]:
        if not isinstance(query, str):
            raise TypeError("query는 문자열이어야 합니다.")

        cleaned_query = query.strip()
        if cleaned_query == "":
            raise ValueError("query는 필수입니다.")
        if len(cleaned_query) > MAX_QUERY_LENGTH:
            raise ValueError(
                "query는 2000자 이하여야 합니다."
            )

        cleaned_match_count, candidate_count = (
            self._validate_search_parameters(
                match_count=match_count,
                candidate_multiplier=candidate_multiplier,
            )
        )
        cleaned_vector_weight, cleaned_keyword_weight = (
            self._validate_weights(
                vector_weight,
                keyword_weight,
            )
        )

        vector_results = (
            self.query_search_service.search(
                cleaned_query,
                match_count=candidate_count,
                match_threshold=match_threshold,
                document_category=document_category,
                document_type=document_type,
                source_table=source_table,
                chunk_type=chunk_type,
            )
        )
        keyword_results = (
            self.keyword_search_service.search(
                cleaned_query,
                match_count=candidate_count,
                match_threshold=match_threshold,
                document_category=document_category,
                document_type=document_type,
                source_table=source_table,
                chunk_type=chunk_type,
            )
        )

        merged_results = self._merge_results(
            vector_results,
            keyword_results,
            vector_weight=cleaned_vector_weight,
            keyword_weight=cleaned_keyword_weight,
        )
        final_results = [
            dict(row)
            for row in merged_results[:cleaned_match_count]
        ]

        return {
            "query": cleaned_query,
            "vector_weight": cleaned_vector_weight,
            "keyword_weight": cleaned_keyword_weight,
            "match_count": cleaned_match_count,
            "candidate_count": candidate_count,
            "vector_result_count": len(vector_results),
            "keyword_result_count": len(keyword_results),
            "merged_result_count": len(merged_results),
            "results": final_results,
        }

    def search(
        self,
        query: str,
        *,
        match_count: int = DEFAULT_HYBRID_MATCH_COUNT,
        match_threshold: float = 0.0,
        vector_weight: float = DEFAULT_VECTOR_WEIGHT,
        keyword_weight: float = DEFAULT_KEYWORD_WEIGHT,
        candidate_multiplier: int = (
            DEFAULT_CANDIDATE_MULTIPLIER
        ),
        document_category: str | None = None,
        document_type: str | None = None,
        source_table: str | None = None,
        chunk_type: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Vector와 Keyword Search를 실행하고
        Hybrid Score 상위 결과를 반환한다.
        """
        details = self._execute_search(
            query,
            match_count=match_count,
            match_threshold=match_threshold,
            vector_weight=vector_weight,
            keyword_weight=keyword_weight,
            candidate_multiplier=candidate_multiplier,
            document_category=document_category,
            document_type=document_type,
            source_table=source_table,
            chunk_type=chunk_type,
        )
        return list(details["results"])

    def search_with_details(
        self,
        query: str,
        **search_options: Any,
    ) -> dict[str, Any]:
        """
        테스트 및 분석용 Hybrid Search 상세 결과를 반환한다.
        """
        return self._execute_search(
            query,
            match_count=search_options.get(
                "match_count",
                DEFAULT_HYBRID_MATCH_COUNT,
            ),
            match_threshold=search_options.get(
                "match_threshold",
                0.0,
            ),
            vector_weight=search_options.get(
                "vector_weight",
                DEFAULT_VECTOR_WEIGHT,
            ),
            keyword_weight=search_options.get(
                "keyword_weight",
                DEFAULT_KEYWORD_WEIGHT,
            ),
            candidate_multiplier=search_options.get(
                "candidate_multiplier",
                DEFAULT_CANDIDATE_MULTIPLIER,
            ),
            document_category=search_options.get(
                "document_category"
            ),
            document_type=search_options.get(
                "document_type"
            ),
            source_table=search_options.get(
                "source_table"
            ),
            chunk_type=search_options.get(
                "chunk_type"
            ),
        )

    @staticmethod
    def summarize_results(
        results: Sequence[Mapping[str, Any]],
    ) -> dict[str, Any]:
        vector_only_count = 0
        keyword_only_count = 0
        both_channel_count = 0

        for row in results:
            channels = list(row.get("matched_channels") or [])
            if channels == [HYBRID_CHANNEL_VECTOR]:
                vector_only_count += 1
            elif channels == [HYBRID_CHANNEL_KEYWORD]:
                keyword_only_count += 1
            elif channels == [
                HYBRID_CHANNEL_VECTOR,
                HYBRID_CHANNEL_KEYWORD,
            ]:
                both_channel_count += 1

        return {
            "count": len(results),
            "ids": [row["id"] for row in results],
            "source_pks": [row["source_pk"] for row in results],
            "law_names": [row["law_name"] for row in results],
            "hybrid_scores": [
                float(row["hybrid_score"]) for row in results
            ],
            "vector_only_count": vector_only_count,
            "keyword_only_count": keyword_only_count,
            "both_channel_count": both_channel_count,
        }


if __name__ == "__main__":
    class FakeQuerySearchService:
        def search(self, query: str, **kwargs):
            assert query == "사후관리 승인"
            assert kwargs["match_count"] == 6

            return [
                {
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
                    "body": "본문",
                    "chunk_text": "청크",
                    "keywords": ["사후관리", "승인"],
                    "metadata": {},
                    "similarity": 0.8,
                },
                {
                    "id": 20,
                    "source_table": "admin_rule",
                    "source_pk": 20,
                    "document_category": "ADMIN_RULE",
                    "document_type": "고시",
                    "law_name": "다른 고시",
                    "chunk_type": "ARTICLE",
                    "article_no": "제2조",
                    "title": "테스트",
                    "header": "테스트",
                    "body": "본문",
                    "chunk_text": "청크",
                    "keywords": ["테스트"],
                    "metadata": {},
                    "similarity": 0.7,
                },
            ]

    class FakeKeywordSearchService:
        def search(self, query: str, **kwargs):
            assert query == "사후관리 승인"
            assert kwargs["match_count"] == 6

            return [
                {
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
                    "body": "본문",
                    "chunk_text": "청크",
                    "keywords": ["사후관리", "승인"],
                    "metadata": {},
                    "matched_keywords": [
                        "사후관리",
                        "승인",
                    ],
                    "exact_match_count": 2,
                    "partial_match_count": 0,
                    "keyword_score": 0.9,
                },
                {
                    "id": 30,
                    "source_table": "admin_rule",
                    "source_pk": 30,
                    "document_category": "ADMIN_RULE",
                    "document_type": "고시",
                    "law_name": "키워드 고시",
                    "chunk_type": "ARTICLE",
                    "article_no": "제3조",
                    "title": "승인",
                    "header": "승인",
                    "body": "본문",
                    "chunk_text": "청크",
                    "keywords": ["승인"],
                    "metadata": {},
                    "matched_keywords": ["승인"],
                    "exact_match_count": 1,
                    "partial_match_count": 0,
                    "keyword_score": 0.8,
                },
            ]

    service = HybridSearchService(
        FakeQuerySearchService(),
        FakeKeywordSearchService(),
    )

    results = service.search(
        "사후관리 승인",
        match_count=2,
        candidate_multiplier=3,
    )

    assert len(results) == 2
    assert results[0]["id"] == 10
    assert results[0]["matched_channels"] == [
        "VECTOR",
        "KEYWORD",
    ]
    assert results[0]["vector_rank"] == 1
    assert results[0]["keyword_rank"] == 1
    assert (
        results[0]["normalized_vector_score"]
        == 0.9
    )
    assert math.isclose(
        results[0]["hybrid_score"],
        0.9,
        rel_tol=1e-9,
        abs_tol=1e-9,
    )

    merged_all = HybridSearchService._merge_results(
        FakeQuerySearchService().search(
            "사후관리 승인",
            match_count=6,
        ),
        FakeKeywordSearchService().search(
            "사후관리 승인",
            match_count=6,
        ),
        vector_weight=DEFAULT_VECTOR_WEIGHT,
        keyword_weight=DEFAULT_KEYWORD_WEIGHT,
    )
    assert len(merged_all) == 3

    by_id = {row["id"]: row for row in merged_all}
    assert by_id[20]["matched_channels"] == ["VECTOR"]
    assert by_id[30]["matched_channels"] == ["KEYWORD"]
    assert by_id[10]["matched_channels"] == [
        "VECTOR",
        "KEYWORD",
    ]

    try:
        service.search("   ")
    except ValueError as exc:
        assert str(exc) == "query는 필수입니다."
    else:
        raise AssertionError(
            "빈 query ValueError가 발생하지 않았습니다."
        )

    try:
        service.search(
            "사후관리 승인",
            vector_weight=0.7,
            keyword_weight=0.4,
        )
    except ValueError as exc:
        assert "1.0이어야 합니다" in str(exc)
    else:
        raise AssertionError(
            "가중치 합계 ValueError가 발생하지 않았습니다."
        )

    try:
        HybridSearchService._merge_results(
            [
                {
                    "id": 10,
                    "similarity": 0.8,
                    "source_table": "admin_rule",
                    "source_pk": 10,
                    "document_category": "ADMIN_RULE",
                    "document_type": "고시",
                    "law_name": "테스트",
                    "chunk_type": "ARTICLE",
                },
                {
                    "id": 10,
                    "similarity": 0.7,
                    "source_table": "admin_rule",
                    "source_pk": 10,
                    "document_category": "ADMIN_RULE",
                    "document_type": "고시",
                    "law_name": "테스트",
                    "chunk_type": "ARTICLE",
                },
            ],
            [],
            vector_weight=DEFAULT_VECTOR_WEIGHT,
            keyword_weight=DEFAULT_KEYWORD_WEIGHT,
        )
    except RuntimeError as exc:
        assert "중복 id" in str(exc)
    else:
        raise AssertionError(
            "중복 id RuntimeError가 발생하지 않았습니다."
        )

    print("OK: STEP 8-4 Hybrid Search 단위 테스트 완료")

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

    query = (
        "사후관리 대상 물품의 용도 외 사용 승인은 "
        "어떻게 하나요?"
    )

    details = hybrid_search_service.search_with_details(
        query,
        match_count=10,
        match_threshold=0.0,
        vector_weight=0.65,
        keyword_weight=0.35,
        candidate_multiplier=3,
        document_category="ADMIN_RULE",
        source_table="admin_rule",
        chunk_type="ARTICLE",
    )

    results = details["results"]

    print("query:", details["query"])
    print(
        "Vector 후보 결과 수:",
        details["vector_result_count"],
    )
    print(
        "Keyword 후보 결과 수:",
        details["keyword_result_count"],
    )
    print(
        "병합 고유 결과 수:",
        details["merged_result_count"],
    )
    print("최종 결과 수:", len(results))
    print("Vector 가중치:", details["vector_weight"])
    print("Keyword 가중치:", details["keyword_weight"])

    for index, row in enumerate(results, start=1):
        print(
            {
                "rank": index,
                "id": row["id"],
                "source_pk": row["source_pk"],
                "law_name": row["law_name"],
                "document_type": row["document_type"],
                "article_no": row.get("article_no"),
                "title": row.get("title"),
                "vector_similarity": row.get(
                    "vector_similarity"
                ),
                "normalized_vector_score": row.get(
                    "normalized_vector_score"
                ),
                "keyword_score": row.get("keyword_score"),
                "vector_rank": row.get("vector_rank"),
                "keyword_rank": row.get("keyword_rank"),
                "matched_channels": row.get(
                    "matched_channels"
                ),
                "hybrid_score": row["hybrid_score"],
            }
        )

    assert len(results) == 10
    assert all(
        row["source_table"] == "admin_rule"
        for row in results
    )
    assert all(
        row["document_category"] == "ADMIN_RULE"
        for row in results
    )
    assert all(
        row["chunk_type"] == "ARTICLE"
        for row in results
    )
    assert all(
        0.0 <= float(row["hybrid_score"]) <= 1.0
        for row in results
    )
    assert all(
        results[index]["hybrid_score"]
        >= results[index + 1]["hybrid_score"]
        for index in range(len(results) - 1)
    )
    assert len({row["id"] for row in results}) == len(results)
    assert any(
        row["law_name"] == "사후관리에 관한 고시"
        for row in results
    )

    title_tokens = (
        "용도 외 사용",
        "승인신청",
        "위탁사후관리물품",
    )
    assert any(
        any(
            token in str(row.get("title") or "")
            for token in title_tokens
        )
        for row in results
    )
    assert any(
        row.get("matched_channels")
        == ["VECTOR", "KEYWORD"]
        for row in results
    )

    print("OK: STEP 8-4 Hybrid Search 연동 완료")
