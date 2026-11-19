# query_search_service.py
#
# 역할: 자연어 질의를 Query Embedding으로 변환하고
#       match_smartlaw_chunk RPC Vector Search를 실행한다.

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from vector.chunk_generator.embedding_service import (
    EmbeddingService,
)
from vector.chunk_generator.supabase_repository import (
    SupabaseRepository,
)

DEFAULT_QUERY_MATCH_COUNT = 10
DEFAULT_QUERY_MATCH_THRESHOLD = 0.0
QUERY_EMBEDDING_DIMENSION = 768
MAX_QUERY_LENGTH = 2000


class QuerySearchService:
    """
    사용자 질의를 Query Embedding으로 변환하고
    smartlaw_chunk Vector Search를 실행한다.
    """

    def __init__(
        self,
        repository: SupabaseRepository,
        embedding_service: EmbeddingService,
    ) -> None:
        if repository is None:
            raise TypeError("repository는 필수입니다.")
        if embedding_service is None:
            raise TypeError("embedding_service는 필수입니다.")
        self.repository = repository
        self.embedding_service = embedding_service

    def search(
        self,
        query: str,
        *,
        match_count: int = DEFAULT_QUERY_MATCH_COUNT,
        match_threshold: float = (
            DEFAULT_QUERY_MATCH_THRESHOLD
        ),
        document_category: str | None = None,
        document_type: str | None = None,
        source_table: str | None = None,
        chunk_type: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        자연어 질의를 Embedding하고 Vector Search를 수행한다.
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

        query_embedding = (
            self.embedding_service
            .generate_query_embedding(cleaned_query)
        )
        if len(query_embedding) != QUERY_EMBEDDING_DIMENSION:
            raise RuntimeError(
                "Query Embedding 차원이 768이 아닙니다."
            )

        rows = self.repository.match_smartlaw_chunks(
            query_embedding,
            match_count=match_count,
            match_threshold=match_threshold,
            document_category=document_category,
            document_type=document_type,
            source_table=source_table,
            chunk_type=chunk_type,
        )
        return [dict(row) for row in rows]

    @staticmethod
    def summarize_results(
        results: list[Mapping[str, Any]],
    ) -> dict[str, Any]:
        """
        콘솔 및 테스트용 검색 결과 요약을 생성한다.
        """
        return {
            "count": len(results),
            "ids": [row["id"] for row in results],
            "source_pks": [row["source_pk"] for row in results],
            "law_names": [row["law_name"] for row in results],
            "similarities": [
                float(row["similarity"])
                for row in results
            ],
        }


if __name__ == "__main__":
    class FakeEmbeddingService:
        def generate_query_embedding(
            self,
            query: str,
        ) -> list[float]:
            assert query == "사후관리 승인"
            return [0.0] * 768

    class FakeRepository:
        def match_smartlaw_chunks(
            self,
            query_embedding,
            **kwargs,
        ):
            assert len(query_embedding) == 768
            assert kwargs["match_count"] == 5
            assert (
                kwargs["source_table"]
                == "admin_rule"
            )

            return [
                {
                    "id": 2,
                    "source_table": "admin_rule",
                    "source_pk": 2,
                    "document_category": "ADMIN_RULE",
                    "document_type": "고시",
                    "law_name": "사후관리에 관한 고시",
                    "chunk_type": "ARTICLE",
                    "article_no": "제1조",
                    "title": "제1조(목적)",
                    "header": "제1조(목적)",
                    "body": "테스트",
                    "chunk_text": "테스트",
                    "keywords": ["사후관리"],
                    "metadata": {},
                    "similarity": 0.95,
                }
            ]

    fake_service = QuerySearchService(
        FakeRepository(),
        FakeEmbeddingService(),
    )

    fake_results = fake_service.search(
        "사후관리 승인",
        match_count=5,
        source_table="admin_rule",
    )

    assert len(fake_results) == 1
    assert fake_results[0]["id"] == 2
    assert fake_results[0]["similarity"] == 0.95

    fake_summary = (
        QuerySearchService.summarize_results(
            fake_results
        )
    )

    assert fake_summary["count"] == 1
    assert fake_summary["ids"] == [2]
    assert fake_summary["source_pks"] == [2]

    try:
        fake_service.search("   ")
    except ValueError as exc:
        assert str(exc) == "query는 필수입니다."
    else:
        raise AssertionError(
            "빈 query ValueError가 발생하지 않았습니다."
        )

    print("OK: STEP 8-2 Query Search 단위 테스트 완료")

    repository = SupabaseRepository()
    embedding_service = EmbeddingService()

    service = QuerySearchService(
        repository,
        embedding_service,
    )

    query = (
        "사후관리 대상 물품의 용도 외 사용 승인은 "
        "어떻게 하나요?"
    )

    results = service.search(
        query,
        match_count=5,
        match_threshold=0.0,
        document_category="ADMIN_RULE",
        source_table="admin_rule",
        chunk_type="ARTICLE",
    )

    summary = service.summarize_results(results)

    print("query:", query)
    print("검색 결과 수:", summary["count"])

    for index, row in enumerate(
        results,
        start=1,
    ):
        print(
            {
                "rank": index,
                "id": row["id"],
                "source_pk": row["source_pk"],
                "law_name": row["law_name"],
                "document_type": row["document_type"],
                "article_no": row.get("article_no"),
                "title": row.get("title"),
                "similarity": row["similarity"],
            }
        )

    assert len(results) == 5

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
        isinstance(row["similarity"], float)
        for row in results
    )

    assert all(
        results[index]["similarity"]
        >= results[index + 1]["similarity"]
        for index in range(len(results) - 1)
    )

    assert any(
        row["law_name"] == "사후관리에 관한 고시"
        for row in results
    )

    print("OK: STEP 8-2 Gemini Query Search RPC 연동 완료")
