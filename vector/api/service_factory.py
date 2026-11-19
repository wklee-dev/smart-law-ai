# service_factory.py
#
# 역할: 완성된 Smart Law AI RAG 서비스 객체 그래프를 생성한다.

from __future__ import annotations

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
from vector.rag.rag_chat_service import (
    RAGChatService,
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
from vector.search.ranking_service import RankingService


def create_rag_chat_service() -> RAGChatService:
    """
    완성된 Smart Law AI RAG 서비스 객체 그래프를 생성한다.
    """
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
