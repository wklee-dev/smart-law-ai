# ranking_service.py
#
# 역할: Hybrid Search 결과에 조문·제목·법령명·채널 보너스를
#       적용해 최종 Ranking을 반환한다.

from __future__ import annotations

import math
import re
import time
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

DEFAULT_RANKING_MATCH_COUNT = 10
MAX_RANKING_MATCH_COUNT = 100

DEFAULT_RANKING_CANDIDATE_MULTIPLIER = 3
MAX_RANKING_CANDIDATE_MULTIPLIER = 10

ARTICLE_EXACT_MATCH_BONUS = 0.10
TITLE_MATCH_MAX_BONUS = 0.06
LAW_NAME_MATCH_MAX_BONUS = 0.03
BOTH_CHANNEL_BONUS = 0.02

MAX_TOTAL_RANKING_BONUS = 0.20

RANKING_CHANNEL_VECTOR = "VECTOR"
RANKING_CHANNEL_KEYWORD = "KEYWORD"

ARTICLE_REFERENCE_PATTERN = re.compile(
    r"제\s*(\d+)\s*조"
    r"(?:\s*의\s*(\d+))?"
)

MAX_QUERY_LENGTH = 2000

_REQUIRED_HYBRID_FIELDS = (
    "id",
    "source_pk",
    "source_table",
    "document_category",
    "law_name",
    "chunk_type",
    "hybrid_score",
    "normalized_vector_score",
    "keyword_score",
    "matched_channels",
    "matched_keywords",
)


class RankingService:
    """
    Hybrid Search 결과에 설명 가능한 Ranking 보너스를
    적용해 최종 검색 순위를 반환한다.
    """

    def __init__(
        self,
        hybrid_search_service: HybridSearchService,
    ) -> None:
        if hybrid_search_service is None:
            raise TypeError(
                "hybrid_search_service는 필수입니다."
            )
        self.hybrid_search_service = hybrid_search_service

    @staticmethod
    def _normalize_search_text(
        value: str | None,
    ) -> str:
        """
        제목·법령명·키워드 포함 비교용 문자열을 정규화한다.
        """
        if value is None:
            return ""
        if not isinstance(value, str):
            raise TypeError(
                "검색 비교 대상은 문자열 또는 None이어야 합니다."
            )
        cleaned = value.strip()
        cleaned = re.sub(r"\s+", "", cleaned)
        return cleaned.lower()

    @classmethod
    def _format_article_reference(
        cls,
        article_number: str,
        sub_number: str | None,
    ) -> str:
        if sub_number:
            return f"제{article_number}조의{sub_number}"
        return f"제{article_number}조"

    @classmethod
    def _extract_article_references(
        cls,
        query: str,
    ) -> list[str]:
        """
        질의에 포함된 조문번호를 정규화하여 추출한다.
        """
        if not isinstance(query, str):
            raise TypeError("query는 문자열이어야 합니다.")

        results: list[str] = []
        seen: set[str] = set()
        for match in ARTICLE_REFERENCE_PATTERN.finditer(query):
            article_number = match.group(1)
            sub_number = match.group(2)
            normalized = cls._format_article_reference(
                article_number,
                sub_number,
            )
            if normalized in seen:
                continue
            seen.add(normalized)
            results.append(normalized)
        return results

    @classmethod
    def _normalize_article_no(
        cls,
        article_no: str | None,
    ) -> str | None:
        if article_no is None:
            return None
        if not isinstance(article_no, str):
            raise TypeError(
                "article_no는 문자열 또는 None이어야 합니다."
            )
        match = ARTICLE_REFERENCE_PATTERN.search(article_no)
        if match is None:
            return None
        return cls._format_article_reference(
            match.group(1),
            match.group(2),
        )

    @classmethod
    def _calculate_keyword_field_ratio(
        cls,
        matched_keywords: Sequence[str],
        field_values: Sequence[str | None],
    ) -> tuple[float, list[str]]:
        """
        matched_keywords 중 대상 필드에 포함된 고유 키워드 비율과
        실제 일치 키워드를 반환한다.
        """
        if isinstance(matched_keywords, (str, bytes)):
            raise TypeError(
                "matched_keywords는 문자열 Sequence여야 합니다."
            )
        if isinstance(field_values, (str, bytes)):
            raise TypeError(
                "field_values는 Sequence여야 합니다."
            )

        cleaned_keywords: list[str] = []
        seen_keywords: set[str] = set()
        for keyword in matched_keywords:
            if not isinstance(keyword, str):
                raise TypeError(
                    "matched_keywords의 모든 항목은 문자열이어야 합니다."
                )
            cleaned = keyword.strip()
            if cleaned == "":
                continue
            if cleaned in seen_keywords:
                continue
            seen_keywords.add(cleaned)
            cleaned_keywords.append(cleaned)

        if not cleaned_keywords:
            return 0.0, []

        normalized_field_text = "".join(
            cls._normalize_search_text(value)
            for value in field_values
        )

        matched_terms: list[str] = []
        for keyword in cleaned_keywords:
            normalized_keyword = cls._normalize_search_text(
                keyword
            )
            if not normalized_keyword:
                continue
            if normalized_keyword in normalized_field_text:
                matched_terms.append(keyword)

        ratio = len(matched_terms) / len(cleaned_keywords)
        ratio = min(1.0, max(0.0, float(ratio)))
        return ratio, matched_terms

    @staticmethod
    def _validate_hybrid_result(
        row: Mapping[str, Any],
    ) -> None:
        if not isinstance(row, Mapping):
            raise TypeError(
                "Ranking 입력 결과는 Mapping이어야 합니다."
            )

        for field_name in _REQUIRED_HYBRID_FIELDS:
            if field_name not in row:
                raise RuntimeError(
                    f"Ranking 입력 필수값이 없습니다: {field_name}"
                )

        chunk_id = row["id"]
        if isinstance(chunk_id, bool) or not isinstance(chunk_id, int):
            raise TypeError(
                "Ranking 입력 id는 양의 정수여야 합니다."
            )
        if chunk_id < 1:
            raise ValueError(
                "Ranking 입력 id는 양의 정수여야 합니다."
            )

        for score_field in (
            "hybrid_score",
            "normalized_vector_score",
            "keyword_score",
        ):
            score_value = row[score_field]
            if isinstance(score_value, bool) or not isinstance(
                score_value,
                (int, float),
            ):
                raise TypeError(
                    f"{score_field}는 숫자여야 합니다."
                )
            cleaned_score = float(score_value)
            if not math.isfinite(cleaned_score):
                raise ValueError(
                    f"{score_field}는 유효한 숫자여야 합니다."
                )
            if cleaned_score < 0 or cleaned_score > 1:
                raise ValueError(
                    f"{score_field}는 0 이상 1 이하여야 합니다."
                )

        matched_channels = row["matched_channels"]
        if isinstance(matched_channels, (str, bytes)):
            raise TypeError(
                "matched_channels는 Sequence여야 합니다."
            )
        if not isinstance(matched_channels, Sequence):
            raise TypeError(
                "matched_channels는 Sequence여야 합니다."
            )

        seen_channels: set[str] = set()
        for channel in matched_channels:
            if channel not in (
                RANKING_CHANNEL_VECTOR,
                RANKING_CHANNEL_KEYWORD,
            ):
                raise RuntimeError(
                    f"알 수 없는 검색 채널입니다: {channel}"
                )
            if channel in seen_channels:
                raise RuntimeError(
                    f"검색 채널이 중복되었습니다: {channel}"
                )
            seen_channels.add(channel)

        matched_keywords = row["matched_keywords"]
        if isinstance(matched_keywords, (str, bytes)):
            raise TypeError(
                "matched_keywords는 Sequence여야 합니다."
            )
        if not isinstance(matched_keywords, Sequence):
            raise TypeError(
                "matched_keywords는 Sequence여야 합니다."
            )

    @classmethod
    def _rank_results(
        cls,
        query: str,
        hybrid_results: Sequence[Mapping[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Hybrid 결과에 Ranking 근거와 보너스를 적용한다.
        """
        if not isinstance(query, str):
            raise TypeError("query는 문자열이어야 합니다.")

        cleaned_query = query.strip()
        if cleaned_query == "":
            raise ValueError("query는 필수입니다.")

        if isinstance(hybrid_results, (str, bytes)):
            raise TypeError(
                "hybrid_results는 Mapping Sequence여야 합니다."
            )

        query_article_refs = cls._extract_article_references(
            cleaned_query
        )

        ranked_rows: list[dict[str, Any]] = []
        seen_ids: set[int] = set()

        for row in hybrid_results:
            cls._validate_hybrid_result(row)

            chunk_id = row["id"]
            if chunk_id in seen_ids:
                raise RuntimeError(
                    f"Ranking 후보에 중복 id가 있습니다: {chunk_id}"
                )
            seen_ids.add(chunk_id)

            result = dict(row)

            result_article_no = cls._normalize_article_no(
                row.get("article_no")
            )
            if (
                result_article_no is not None
                and result_article_no in query_article_refs
            ):
                article_bonus = ARTICLE_EXACT_MATCH_BONUS
                article_match = True
            else:
                article_bonus = 0.0
                article_match = False

            title_ratio, title_matched_terms = (
                cls._calculate_keyword_field_ratio(
                    row["matched_keywords"],
                    [
                        row.get("title"),
                        row.get("header"),
                    ],
                )
            )
            title_bonus = title_ratio * TITLE_MATCH_MAX_BONUS

            law_name_ratio, law_name_matched_terms = (
                cls._calculate_keyword_field_ratio(
                    row["matched_keywords"],
                    [
                        row.get("law_name"),
                    ],
                )
            )
            law_name_bonus = (
                law_name_ratio * LAW_NAME_MATCH_MAX_BONUS
            )

            channel_set = set(row["matched_channels"])
            both_channel_match = (
                RANKING_CHANNEL_VECTOR in channel_set
                and RANKING_CHANNEL_KEYWORD in channel_set
            )
            channel_bonus = (
                BOTH_CHANNEL_BONUS if both_channel_match else 0.0
            )

            raw_bonus_score = math.fsum(
                [
                    article_bonus,
                    title_bonus,
                    law_name_bonus,
                    channel_bonus,
                ]
            )
            bonus_score = min(
                MAX_TOTAL_RANKING_BONUS,
                max(0.0, raw_bonus_score),
            )
            ranking_score = min(
                1.0,
                max(
                    0.0,
                    float(row["hybrid_score"]) + bonus_score,
                ),
            )

            ranking_reasons: list[str] = []
            if article_match:
                ranking_reasons.append("ARTICLE_EXACT_MATCH")
            if title_matched_terms:
                ranking_reasons.append("TITLE_KEYWORD_MATCH")
            if law_name_matched_terms:
                ranking_reasons.append("LAW_NAME_KEYWORD_MATCH")
            if both_channel_match:
                ranking_reasons.append("BOTH_SEARCH_CHANNELS")

            result.update(
                {
                    "base_hybrid_score": float(
                        row["hybrid_score"]
                    ),
                    "article_match": article_match,
                    "article_bonus": float(article_bonus),
                    "title_match_ratio": float(title_ratio),
                    "title_matched_terms": list(
                        title_matched_terms
                    ),
                    "title_bonus": float(title_bonus),
                    "law_name_match_ratio": float(
                        law_name_ratio
                    ),
                    "law_name_matched_terms": list(
                        law_name_matched_terms
                    ),
                    "law_name_bonus": float(law_name_bonus),
                    "both_channel_match": both_channel_match,
                    "channel_bonus": float(channel_bonus),
                    "raw_bonus_score": float(raw_bonus_score),
                    "bonus_score": float(bonus_score),
                    "ranking_score": float(ranking_score),
                    "ranking_reasons": ranking_reasons,
                }
            )
            ranked_rows.append(result)

        ranked_rows.sort(
            key=lambda row: (
                -float(row["ranking_score"]),
                -float(row["article_bonus"]),
                -float(row["title_bonus"]),
                -float(row["base_hybrid_score"]),
                -float(row["normalized_vector_score"]),
                -float(row["keyword_score"]),
                int(row["id"]),
            )
        )

        for index, row in enumerate(ranked_rows, start=1):
            row["ranking_rank"] = index

        return ranked_rows

    def _validate_count_parameters(
        self,
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
        if (
            match_count < 1
            or match_count > MAX_RANKING_MATCH_COUNT
        ):
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
            or candidate_multiplier
            > MAX_RANKING_CANDIDATE_MULTIPLIER
        ):
            raise ValueError(
                "candidate_multiplier는 1 이상 10 이하여야 합니다."
            )

        candidate_count = min(
            MAX_RANKING_MATCH_COUNT,
            match_count * candidate_multiplier,
        )
        return match_count, candidate_count

    def _prepare_hybrid_options(
        self,
        hybrid_options: Mapping[str, Any],
    ) -> dict[str, Any]:
        options = dict(hybrid_options)
        if "match_count" in options:
            raise TypeError(
                "match_count는 별도 인자로 전달해야 합니다."
            )

        hybrid_candidate_multiplier = options.pop(
            "hybrid_candidate_multiplier",
            None,
        )
        if hybrid_candidate_multiplier is not None:
            options["candidate_multiplier"] = (
                hybrid_candidate_multiplier
            )
        return options

    def _execute_search(
        self,
        query: str,
        *,
        match_count: int = DEFAULT_RANKING_MATCH_COUNT,
        candidate_multiplier: int = (
            DEFAULT_RANKING_CANDIDATE_MULTIPLIER
        ),
        **hybrid_options: Any,
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
            self._validate_count_parameters(
                match_count=match_count,
                candidate_multiplier=candidate_multiplier,
            )
        )
        prepared_options = self._prepare_hybrid_options(
            hybrid_options
        )

        search_started = time.perf_counter()
        hybrid_results = (
            self.hybrid_search_service.search(
                cleaned_query,
                match_count=candidate_count,
                **prepared_options,
            )
        )
        search_elapsed_ms = (
            time.perf_counter() - search_started
        ) * 1000.0

        ranking_started = time.perf_counter()
        ranked_results = self._rank_results(
            cleaned_query,
            hybrid_results,
        )
        ranking_elapsed_ms = (
            time.perf_counter() - ranking_started
        ) * 1000.0
        final_results = [
            dict(row)
            for row in ranked_results[:cleaned_match_count]
        ]

        return {
            "query": cleaned_query,
            "match_count": cleaned_match_count,
            "candidate_count": candidate_count,
            "hybrid_candidate_count": len(hybrid_results),
            "ranked_candidate_count": len(ranked_results),
            "results": final_results,
            "_ops_timings": {
                "search_time_ms": round(
                    search_elapsed_ms,
                    2,
                ),
                "ranking_time_ms": round(
                    ranking_elapsed_ms,
                    2,
                ),
            },
        }

    def search(
        self,
        query: str,
        *,
        match_count: int = DEFAULT_RANKING_MATCH_COUNT,
        candidate_multiplier: int = (
            DEFAULT_RANKING_CANDIDATE_MULTIPLIER
        ),
        **hybrid_options: Any,
    ) -> list[dict[str, Any]]:
        """
        Hybrid 후보를 조회하고 최종 Ranking을 적용한다.
        """
        details = self._execute_search(
            query,
            match_count=match_count,
            candidate_multiplier=candidate_multiplier,
            **hybrid_options,
        )
        return list(details["results"])

    def search_with_details(
        self,
        query: str,
        *,
        match_count: int = DEFAULT_RANKING_MATCH_COUNT,
        candidate_multiplier: int = (
            DEFAULT_RANKING_CANDIDATE_MULTIPLIER
        ),
        **hybrid_options: Any,
    ) -> dict[str, Any]:
        return self._execute_search(
            query,
            match_count=match_count,
            candidate_multiplier=candidate_multiplier,
            **hybrid_options,
        )

    @staticmethod
    def summarize_results(
        results: Sequence[Mapping[str, Any]],
    ) -> dict[str, Any]:
        article_match_count = 0
        title_match_count = 0
        law_name_match_count = 0
        both_channel_count = 0

        for row in results:
            if row.get("article_match") is True:
                article_match_count += 1
            if row.get("title_matched_terms"):
                title_match_count += 1
            if row.get("law_name_matched_terms"):
                law_name_match_count += 1
            if row.get("both_channel_match") is True:
                both_channel_count += 1

        return {
            "count": len(results),
            "ids": [row["id"] for row in results],
            "source_pks": [row["source_pk"] for row in results],
            "law_names": [row["law_name"] for row in results],
            "ranking_scores": [
                float(row["ranking_score"]) for row in results
            ],
            "article_match_count": article_match_count,
            "title_match_count": title_match_count,
            "law_name_match_count": law_name_match_count,
            "both_channel_count": both_channel_count,
        }


if __name__ == "__main__":
    class FakeHybridSearchService:
        def search(self, query: str, **kwargs):
            assert query == "제29조 용도 외 사용 승인"
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
                    "article_no": "제29조",
                    "title": (
                        "제29조(용도 외 사용 승인신청)"
                    ),
                    "header": (
                        "제29조(용도 외 사용 승인신청)"
                    ),
                    "body": "본문",
                    "chunk_text": "청크",
                    "keywords": [],
                    "metadata": {},
                    "vector_similarity": 0.8,
                    "normalized_vector_score": 0.9,
                    "keyword_score": 0.7,
                    "vector_rank": 2,
                    "keyword_rank": 1,
                    "matched_keywords": [
                        "용도 외 사용",
                        "승인",
                    ],
                    "exact_match_count": 2,
                    "partial_match_count": 0,
                    "matched_channels": [
                        "VECTOR",
                        "KEYWORD",
                    ],
                    "hybrid_score": 0.83,
                },
                {
                    "id": 20,
                    "source_table": "admin_rule",
                    "source_pk": 20,
                    "document_category": "ADMIN_RULE",
                    "document_type": "고시",
                    "law_name": "다른 고시",
                    "chunk_type": "ARTICLE",
                    "article_no": "제5조",
                    "title": "용도 외 사용",
                    "header": "용도 외 사용",
                    "body": "본문",
                    "chunk_text": "청크",
                    "keywords": [],
                    "metadata": {},
                    "vector_similarity": 0.85,
                    "normalized_vector_score": 0.925,
                    "keyword_score": 0.5,
                    "vector_rank": 1,
                    "keyword_rank": 3,
                    "matched_keywords": [
                        "용도 외 사용",
                    ],
                    "exact_match_count": 1,
                    "partial_match_count": 0,
                    "matched_channels": [
                        "VECTOR",
                        "KEYWORD",
                    ],
                    "hybrid_score": 0.84,
                },
            ]

    service = RankingService(
        FakeHybridSearchService()
    )

    results = service.search(
        "제29조 용도 외 사용 승인",
        match_count=2,
        candidate_multiplier=3,
    )

    assert len(results) == 2
    assert results[0]["id"] == 10
    assert results[0]["article_match"] is True
    assert results[0]["article_bonus"] == 0.10
    assert (
        "ARTICLE_EXACT_MATCH"
        in results[0]["ranking_reasons"]
    )
    assert results[0]["ranking_rank"] == 1
    assert results[1]["ranking_rank"] == 2
    assert 0.0 <= results[0]["ranking_score"] <= 1.0

    assert (
        RankingService._extract_article_references(
            "제29 조와 제10조의 2"
        )
        == ["제29조", "제10조의2"]
    )

    ratio, terms = (
        RankingService
        ._calculate_keyword_field_ratio(
            ["용도 외 사용", "승인"],
            ["용도 외 사용 승인신청"],
        )
    )
    assert math.isclose(
        ratio,
        1.0,
        rel_tol=1e-9,
        abs_tol=1e-9,
    )
    assert terms == [
        "용도 외 사용",
        "승인",
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
        RankingService._rank_results(
            "제29조",
            [
                {
                    "id": 10,
                    "source_table": "admin_rule",
                    "source_pk": 10,
                    "document_category": "ADMIN_RULE",
                    "law_name": "테스트",
                    "chunk_type": "ARTICLE",
                    "article_no": "제29조",
                    "title": "테스트",
                    "header": "테스트",
                    "hybrid_score": 0.5,
                    "normalized_vector_score": 0.5,
                    "keyword_score": 0.5,
                    "matched_channels": ["VECTOR"],
                    "matched_keywords": [],
                },
                {
                    "id": 10,
                    "source_table": "admin_rule",
                    "source_pk": 10,
                    "document_category": "ADMIN_RULE",
                    "law_name": "테스트",
                    "chunk_type": "ARTICLE",
                    "article_no": "제29조",
                    "title": "테스트",
                    "header": "테스트",
                    "hybrid_score": 0.4,
                    "normalized_vector_score": 0.4,
                    "keyword_score": 0.4,
                    "matched_channels": ["KEYWORD"],
                    "matched_keywords": [],
                },
            ],
        )
    except RuntimeError as exc:
        assert "중복 id" in str(exc)
    else:
        raise AssertionError(
            "중복 id RuntimeError가 발생하지 않았습니다."
        )

    try:
        RankingService._validate_hybrid_result(
            {
                "id": 1,
                "source_pk": 1,
                "source_table": "admin_rule",
                "document_category": "ADMIN_RULE",
                "law_name": "테스트",
                "chunk_type": "ARTICLE",
                "hybrid_score": 1.5,
                "normalized_vector_score": 0.5,
                "keyword_score": 0.5,
                "matched_channels": ["VECTOR"],
                "matched_keywords": [],
            }
        )
    except ValueError as exc:
        assert "0 이상 1 이하" in str(exc)
    else:
        raise AssertionError(
            "hybrid_score 범위 ValueError가 발생하지 않았습니다."
        )

    print("OK: STEP 8-5 Ranking 단위 테스트 완료")

    repository = SupabaseRepository()
    embedding_service = EmbeddingService()

    query_service = QuerySearchService(
        repository,
        embedding_service,
    )
    keyword_service = KeywordSearchService(
        repository,
    )
    hybrid_service = HybridSearchService(
        query_service,
        keyword_service,
    )
    ranking_service = RankingService(
        hybrid_service,
    )

    queries = [
        (
            "사후관리 대상 물품의 용도 외 사용 승인은 "
            "어떻게 하나요?"
        ),
        "제29조",
    ]

    query1_details = None
    query2_details = None

    for query in queries:
        details = ranking_service.search_with_details(
            query,
            match_count=10,
            candidate_multiplier=3,
            hybrid_candidate_multiplier=3,
            match_threshold=0.0,
            vector_weight=0.65,
            keyword_weight=0.35,
            document_category="ADMIN_RULE",
            source_table="admin_rule",
            chunk_type="ARTICLE",
        )
        if query1_details is None:
            query1_details = details
        else:
            query2_details = details

        results = details["results"]
        print("query:", details["query"])
        print(
            "Hybrid 후보 수:",
            details["hybrid_candidate_count"],
        )
        print("최종 결과 수:", len(results))

        for row in results:
            print(
                {
                    "ranking_rank": row["ranking_rank"],
                    "id": row["id"],
                    "source_pk": row["source_pk"],
                    "law_name": row["law_name"],
                    "document_type": row.get("document_type"),
                    "article_no": row.get("article_no"),
                    "title": row.get("title"),
                    "base_hybrid_score": row[
                        "base_hybrid_score"
                    ],
                    "article_bonus": row["article_bonus"],
                    "title_bonus": row["title_bonus"],
                    "law_name_bonus": row["law_name_bonus"],
                    "channel_bonus": row["channel_bonus"],
                    "bonus_score": row["bonus_score"],
                    "ranking_score": row["ranking_score"],
                    "ranking_reasons": row["ranking_reasons"],
                }
            )

    assert query1_details is not None
    query1_results = query1_details["results"]
    assert len(query1_results) == 10
    assert any(
        row["law_name"] == "사후관리에 관한 고시"
        for row in query1_results
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
        for row in query1_results
    )
    assert all(
        query1_results[index]["ranking_score"]
        >= query1_results[index + 1]["ranking_score"]
        for index in range(len(query1_results) - 1)
    )
    assert len({row["id"] for row in query1_results}) == len(
        query1_results
    )

    assert query2_details is not None
    query2_results = query2_details["results"]
    assert len(query2_results) <= 10
    assert any(
        row.get("article_no") == "제29조"
        for row in query2_results
    )
    article_29_rows = [
        row
        for row in query2_results
        if row.get("article_no") == "제29조"
    ]
    assert any(
        row.get("article_match") is True
        for row in article_29_rows
    )
    assert any(
        row.get("article_bonus") == 0.10
        for row in article_29_rows
    )

    best_article_exact = next(
        row
        for row in query2_results
        if row.get("article_match") is True
        and row.get("article_no") == "제29조"
    )
    keyword_only_refs = [
        row
        for row in query2_results
        if row.get("article_match") is not True
        and "제29조" in str(row.get("title") or "")
    ]
    if keyword_only_refs:
        assert best_article_exact["ranking_score"] >= max(
            row["ranking_score"] for row in keyword_only_refs
        )

    print("OK: STEP 8-5 최종 Ranking 연동 완료")
