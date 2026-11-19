# rag_chat_service.py
#
# 역할: Embedding → Search → Ranking → Context → Prompt →
#       Answer → Citation Validation → Final Result를
#       하나의 RAG Chat API 서비스로 연결한다.

from __future__ import annotations

import time
from typing import Any

from vector.api.ops_settings import get_ops_settings
from vector.chunk_generator.embedding_service import (
    EmbeddingService,
)
from vector.chunk_generator.supabase_repository import (
    SupabaseRepository,
)
from vector.llm.base_llm import BaseLLM
from vector.llm.llm_factory import create_llm
from vector.rag.answer_service import AnswerService
from vector.rag.citation_policy import CitationPolicy
from vector.rag.citation_result_builder import (
    CitationResultBuilder,
)
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

class RAGChatService:
    """
    기존 RAG 파이프라인 구성요소를 연결해
    단일 Chat API 응답을 생성한다.
    """

    def __init__(
        self,
        repository: SupabaseRepository,
        embedding_service: EmbeddingService,
        query_search_service: QuerySearchService,
        keyword_search_service: KeywordSearchService,
        hybrid_search_service: HybridSearchService,
        ranking_service: RankingService,
        answer_service: AnswerService,
        llm: BaseLLM,
        context_builder: type[ContextBuilder] | ContextBuilder,
        prompt_builder: type[PromptBuilder] | PromptBuilder,
        citation_validator: (
            type[CitationValidator] | CitationValidator
        ),
        citation_result_builder: (
            type[CitationResultBuilder]
            | CitationResultBuilder
        ),
    ) -> None:
        if repository is None:
            raise TypeError("repository는 필수입니다.")
        if embedding_service is None:
            raise TypeError("embedding_service는 필수입니다.")
        if query_search_service is None:
            raise TypeError(
                "query_search_service는 필수입니다."
            )
        if keyword_search_service is None:
            raise TypeError(
                "keyword_search_service는 필수입니다."
            )
        if hybrid_search_service is None:
            raise TypeError(
                "hybrid_search_service는 필수입니다."
            )
        if ranking_service is None:
            raise TypeError("ranking_service는 필수입니다.")
        if answer_service is None:
            raise TypeError("answer_service는 필수입니다.")
        if llm is None:
            raise TypeError("llm은 필수입니다.")
        if context_builder is None:
            raise TypeError("context_builder는 필수입니다.")
        if prompt_builder is None:
            raise TypeError("prompt_builder는 필수입니다.")
        if citation_validator is None:
            raise TypeError(
                "citation_validator는 필수입니다."
            )
        if citation_result_builder is None:
            raise TypeError(
                "citation_result_builder는 필수입니다."
            )

        self.repository = repository
        self.embedding_service = embedding_service
        self.query_search_service = query_search_service
        self.keyword_search_service = keyword_search_service
        self.hybrid_search_service = hybrid_search_service
        self.ranking_service = ranking_service
        self.answer_service = answer_service
        self.llm = llm
        self.context_builder = context_builder
        self.prompt_builder = prompt_builder
        self.citation_validator = citation_validator
        self.citation_result_builder = (
            citation_result_builder
        )

    def chat(
        self,
        query: str,
        *,
        match_count: int = 10,
        candidate_multiplier: int = 3,
        max_results: int = 5,
        temperature: float = 0.2,
        max_output_tokens: int = 2048,
        document_category: str = "ADMIN_RULE",
        source_table: str = "admin_rule",
    ) -> dict[str, Any]:
        """
        RAG 파이프라인을 한 번 실행하고 최종 결과를 반환한다.
        """
        if not isinstance(query, str):
            raise TypeError("query는 문자열이어야 합니다.")
        cleaned_query = query.strip()
        if cleaned_query == "":
            raise ValueError("query는 필수입니다.")

        settings = get_ops_settings()
        total_started = time.perf_counter()

        search_started = time.perf_counter()
        ranking_details = (
            self.ranking_service.search_with_details(
                cleaned_query,
                match_count=match_count,
                candidate_multiplier=candidate_multiplier,
                match_threshold=0.0,
                vector_weight=0.65,
                keyword_weight=0.35,
                document_category=document_category,
                source_table=source_table,
                chunk_type="ARTICLE",
                hybrid_candidate_multiplier=candidate_multiplier,
            )
        )
        ranked_results = list(ranking_details["results"])
        ranking_ops = ranking_details.get("_ops_timings")
        if isinstance(ranking_ops, dict):
            search_elapsed_ms = float(
                ranking_ops.get("search_time_ms") or 0.0
            )
            ranking_elapsed_ms = float(
                ranking_ops.get("ranking_time_ms") or 0.0
            )
        else:
            combined_ms = (
                time.perf_counter() - search_started
            ) * 1000.0
            search_elapsed_ms = combined_ms
            ranking_elapsed_ms = 0.0

        context_started = time.perf_counter()
        context_result = self.context_builder.build(
            cleaned_query,
            ranked_results,
            max_results=max_results,
            max_chunk_chars=3000,
            max_context_chars=settings.max_context_length,
        )
        context_elapsed_ms = (
            time.perf_counter() - context_started
        ) * 1000.0

        prompt_result = self.prompt_builder.build(
            context_result,
            max_system_prompt_chars=6000,
            max_user_prompt_chars=30000,
            max_combined_prompt_chars=36000,
        )

        gemini_started = time.perf_counter()
        answer_result = self.answer_service.generate_answer(
            prompt_result,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        )
        gemini_elapsed_ms = (
            time.perf_counter() - gemini_started
        ) * 1000.0

        validation_result = self.citation_validator.validate(
            answer_result
        )

        final_result = self.citation_result_builder.build(
            answer_result,
            context_result,
            validation_result,
        )

        CitationPolicy.evaluate(
            validation_result,
            policy="REPORT",
        )

        total_elapsed_ms = (
            time.perf_counter() - total_started
        ) * 1000.0
        # 응답 스키마 밖 운영 메타(API에서 제거 후 로그만 사용)
        final_result["_ops_timings"] = {
            "search_time_ms": round(search_elapsed_ms, 2),
            "ranking_time_ms": round(ranking_elapsed_ms, 2),
            "context_time_ms": round(context_elapsed_ms, 2),
            "gemini_time_ms": round(gemini_elapsed_ms, 2),
            "total_time_ms": round(total_elapsed_ms, 2),
        }

        return final_result


if __name__ == "__main__":
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

    rag_chat_service = RAGChatService(
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

    query = (
        "사후관리 대상 물품의 용도 외 사용 승인은 "
        "어떻게 하나요?"
    )

    final_result = rag_chat_service.chat(query)

    print("query:", final_result["query"])
    print("provider:", final_result["provider"])
    print("model:", final_result["model"])
    print(
        "result_version:",
        final_result["result_version"],
    )
    print(
        "context_count:",
        final_result["context_count"],
    )
    print(
        "available_source_ids:",
        final_result["available_source_ids"],
    )
    print(
        "citation_validation:",
        {
            "status": final_result[
                "citation_validation"
            ]["status"],
            "is_valid": final_result[
                "citation_validation"
            ]["is_valid"],
            "valid_citation_ids": final_result[
                "citation_validation"
            ]["valid_citation_ids"],
            "invalid_citation_ids": final_result[
                "citation_validation"
            ]["invalid_citation_ids"],
            "unused_source_ids": final_result[
                "citation_validation"
            ]["unused_source_ids"],
            "messages": final_result[
                "citation_validation"
            ]["messages"],
        },
    )
    print(
        "cited_source_count:",
        final_result["cited_source_count"],
    )
    print(
        "unused_source_count:",
        final_result["unused_source_count"],
    )
    print(
        "cited_sources:",
        [
            {
                "citation_id": source["citation_id"],
                "id": source["id"],
                "source_pk": source["source_pk"],
                "law_name": source["law_name"],
                "document_type": source["document_type"],
                "article_no": source["article_no"],
                "title": source["title"],
                "ranking_score": source["ranking_score"],
                "citation_count": source["citation_count"],
                "first_occurrence_order": source[
                    "first_occurrence_order"
                ],
            }
            for source in final_result["cited_sources"]
        ],
    )
    print(
        "unused_sources:",
        [
            {
                "citation_id": source["citation_id"],
                "id": source["id"],
                "source_pk": source["source_pk"],
                "law_name": source["law_name"],
                "article_no": source["article_no"],
                "title": source["title"],
            }
            for source in final_result["unused_sources"]
        ],
    )
    print(
        "answer_chars:",
        final_result["answer_chars"],
    )
    print(
        "total_token_count:",
        final_result["total_token_count"],
    )
    print(
        "answer_text:",
        final_result["answer_text"],
    )

    assert final_result["result_version"] == "1.0"
    assert final_result["query"] == query
    assert isinstance(final_result["answer_text"], str)
    assert final_result["answer_text"].strip() != ""
    assert "citation_validation" in final_result
    assert "cited_sources" in final_result
    assert final_result["cited_source_count"] == len(
        final_result["cited_sources"]
    )
    assert final_result["unused_source_count"] == len(
        final_result["unused_sources"]
    )

    print("OK: STEP 9-5 RAG Chat API 연동 완료")
