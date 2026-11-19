# keyword_search_service.py
#
# 역할: 사용자 질의에서 키워드를 생성·확장하고
#       smartlaw_chunk Keyword Search RPC를 실행한다.

from __future__ import annotations

from typing import Any

from vector.chunk_generator.keyword_extractor import (
    expand_dictionary_keywords,
    extract_keywords,
)
from vector.chunk_generator.supabase_repository import (
    SupabaseRepository,
)

DEFAULT_KEYWORD_SEARCH_MATCH_COUNT = 10
DEFAULT_KEYWORD_SEARCH_MATCH_THRESHOLD = 0.0
MAX_QUERY_LENGTH = 2000


class KeywordSearchService:
    """
    사용자 질의에서 키워드를 생성·확장하고
    smartlaw_chunk Keyword Search를 수행한다.
    """

    def __init__(
        self,
        repository: SupabaseRepository,
    ) -> None:
        if repository is None:
            raise TypeError("repository는 필수입니다.")
        self.repository = repository

    def _prepare_keywords(
        self,
        query: str,
    ) -> tuple[str, list[str], list[str]]:
        if not isinstance(query, str):
            raise TypeError("query는 문자열이어야 합니다.")

        cleaned_query = query.strip()
        if cleaned_query == "":
            raise ValueError("query는 필수입니다.")
        if len(cleaned_query) > MAX_QUERY_LENGTH:
            raise ValueError(
                "query는 2000자 이하여야 합니다."
            )

        query_document = {
            "document_category": "",
            "law_name": "",
            "article_no": "",
            "article_title": "",
            "article_content": cleaned_query,
        }

        base_keywords = extract_keywords(
            query_document,
            cleaned_query,
            max_keywords=20,
        )

        dictionary_rows = (
            self.repository.get_dictionary_entries()
        )
        expanded_keywords = expand_dictionary_keywords(
            base_keywords,
            dictionary_rows,
            max_keywords=30,
        )

        if not expanded_keywords:
            raise ValueError(
                "검색 질의에서 유효한 키워드를 추출하지 못했습니다."
            )

        return (
            cleaned_query,
            list(base_keywords),
            list(expanded_keywords),
        )

    def search(
        self,
        query: str,
        *,
        match_count: int = DEFAULT_KEYWORD_SEARCH_MATCH_COUNT,
        match_threshold: float = (
            DEFAULT_KEYWORD_SEARCH_MATCH_THRESHOLD
        ),
        document_category: str | None = None,
        document_type: str | None = None,
        source_table: str | None = None,
        chunk_type: str | None = None,
    ) -> list[dict[str, Any]]:
        details = self.search_with_details(
            query,
            match_count=match_count,
            match_threshold=match_threshold,
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
        cleaned_query, base_keywords, expanded_keywords = (
            self._prepare_keywords(query)
        )

        rows = (
            self.repository
            .search_smartlaw_chunks_by_keywords(
                expanded_keywords,
                match_count=search_options.get(
                    "match_count",
                    DEFAULT_KEYWORD_SEARCH_MATCH_COUNT,
                ),
                match_threshold=search_options.get(
                    "match_threshold",
                    DEFAULT_KEYWORD_SEARCH_MATCH_THRESHOLD,
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
        )

        return {
            "query": cleaned_query,
            "base_keywords": list(base_keywords),
            "expanded_keywords": list(expanded_keywords),
            "results": [dict(row) for row in rows],
        }


if __name__ == "__main__":
    class FakeRepository:
        def __init__(self) -> None:
            self.last_query_terms: list[str] | None = None

        def get_dictionary_entries(self):
            return [
                {
                    "id": 1,
                    "category": "TEST",
                    "term": "사후관리",
                    "synonyms": ["사후 관리"],
                    "description": "",
                    "weight": 1.0,
                    "use_yn": "Y",
                }
            ]

        def search_smartlaw_chunks_by_keywords(
            self,
            query_terms,
            **kwargs,
        ):
            self.last_query_terms = list(query_terms)
            assert "사후관리" in query_terms
            return [
                {
                    "id": 30,
                    "source_table": "admin_rule",
                    "source_pk": 36,
                    "document_category": "ADMIN_RULE",
                    "document_type": "고시",
                    "law_name": "사후관리에 관한 고시",
                    "chunk_type": "ARTICLE",
                    "article_no": "제29조",
                    "title": "제29조(용도 외 사용)",
                    "header": "제29조(용도 외 사용)",
                    "body": "테스트",
                    "chunk_text": "테스트",
                    "keywords": ["사후관리", "승인"],
                    "metadata": {},
                    "matched_keywords": ["사후관리"],
                    "exact_match_count": 1,
                    "partial_match_count": 0,
                    "keyword_score": 0.80,
                },
                {
                    "id": 12,
                    "source_table": "admin_rule",
                    "source_pk": 15,
                    "document_category": "ADMIN_RULE",
                    "document_type": "고시",
                    "law_name": "사후관리에 관한 고시",
                    "chunk_type": "ARTICLE",
                    "article_no": "제11조",
                    "title": "제11조",
                    "header": "제11조",
                    "body": "테스트",
                    "chunk_text": "테스트",
                    "keywords": ["사후관리"],
                    "metadata": {},
                    "matched_keywords": ["사후관리"],
                    "exact_match_count": 1,
                    "partial_match_count": 0,
                    "keyword_score": 0.60,
                },
            ]

    try:
        KeywordSearchService(None)
    except TypeError:
        pass
    else:
        raise AssertionError(
            "repository None TypeError가 발생하지 않았습니다."
        )

    fake_repository = FakeRepository()
    fake_service = KeywordSearchService(fake_repository)

    try:
        fake_service.search("   ")
    except ValueError as exc:
        assert str(exc) == "query는 필수입니다."
    else:
        raise AssertionError(
            "빈 query ValueError가 발생하지 않았습니다."
        )

    fake_details = fake_service.search_with_details(
        "사후관리 승인",
        match_count=5,
        source_table="admin_rule",
    )

    assert fake_repository.last_query_terms is not None
    assert fake_details["expanded_keywords"] == (
        fake_repository.last_query_terms
    )
    assert [row["id"] for row in fake_details["results"]] == [
        30,
        12,
    ]
    assert fake_details["results"][0]["keyword_score"] == 0.80
    assert fake_details["results"][1]["keyword_score"] == 0.60

    print("OK: STEP 8-3 Keyword Search 단위 테스트 완료")

    repository = SupabaseRepository()
    service = KeywordSearchService(repository)

    query = (
        "사후관리 대상 물품의 용도 외 사용 승인은 "
        "어떻게 하나요?"
    )

    details = service.search_with_details(
        query,
        match_count=10,
        match_threshold=0.0,
        document_category="ADMIN_RULE",
        source_table="admin_rule",
        chunk_type="ARTICLE",
    )

    results = details["results"]

    print("query:", details["query"])
    print("base keyword 개수:", len(details["base_keywords"]))
    print(
        "expanded keyword 개수:",
        len(details["expanded_keywords"]),
    )
    print("검색 결과 수:", len(results))

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
                "matched_keywords": row.get("matched_keywords"),
                "exact_match_count": row.get("exact_match_count"),
                "partial_match_count": row.get(
                    "partial_match_count"
                ),
                "keyword_score": row["keyword_score"],
            }
        )

    assert len(results) >= 1
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
        results[index]["keyword_score"]
        >= results[index + 1]["keyword_score"]
        for index in range(len(results) - 1)
    )
    assert any(
        row["law_name"] == "사후관리에 관한 고시"
        for row in results
    )

    print("OK: STEP 8-3 Keyword Search RPC 연동 완료")
