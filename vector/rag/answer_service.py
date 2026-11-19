# answer_service.py
#
# 역할: Prompt Builder 결과와 LLM Provider를 연결해
#       표준 RAG 답변 결과를 생성한다.

from __future__ import annotations

import os
from collections.abc import Mapping, Sequence
from typing import Any

from vector.chunk_generator.embedding_service import (
    EmbeddingService,
)
from vector.chunk_generator.supabase_repository import (
    SupabaseRepository,
)
from vector.llm.base_llm import BaseLLM
from vector.llm.gemini_llm import GeminiLLM
from vector.llm.llm_factory import create_llm
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

MAX_ANSWER_TEXT_CHARS = 50_000

_REQUIRED_PROMPT_FIELDS = (
    "query",
    "system_prompt",
    "user_prompt",
    "combined_prompt",
    "source_ids",
    "context_count",
    "system_prompt_chars",
    "user_prompt_chars",
    "combined_prompt_chars",
)


class AnswerService:
    """
    Prompt Builder 결과와 LLM Provider를 연결해
    표준 RAG 답변 결과를 생성한다.
    """

    def __init__(
        self,
        llm: BaseLLM,
    ) -> None:
        if llm is None:
            raise TypeError("llm은 필수입니다.")
        self.llm = llm

    @staticmethod
    def _validate_prompt_result(
        prompt_result: Mapping[str, Any],
    ) -> None:
        if not isinstance(prompt_result, Mapping):
            raise TypeError(
                "prompt_result는 Mapping이어야 합니다."
            )

        for field_name in _REQUIRED_PROMPT_FIELDS:
            if field_name not in prompt_result:
                raise ValueError(
                    f"Answer 입력 필수값이 없습니다: {field_name}"
                )

        for field_name in (
            "query",
            "system_prompt",
            "user_prompt",
            "combined_prompt",
        ):
            value = prompt_result[field_name]
            if not isinstance(value, str) or value.strip() == "":
                raise ValueError(
                    f"Answer 입력 필수값이 없습니다: {field_name}"
                )

        source_ids = prompt_result["source_ids"]
        if isinstance(source_ids, (str, bytes)):
            raise TypeError(
                "source_ids는 Sequence여야 합니다."
            )
        if not isinstance(source_ids, Sequence):
            raise TypeError(
                "source_ids는 Sequence여야 합니다."
            )

        context_count = prompt_result["context_count"]
        if isinstance(context_count, bool) or not isinstance(
            context_count,
            int,
        ):
            raise ValueError(
                "Answer 입력 필수값이 없습니다: context_count"
            )
        if context_count < 1:
            raise ValueError(
                "Answer 입력 필수값이 없습니다: context_count"
            )
        if len(source_ids) != context_count:
            raise RuntimeError(
                "Context 출처번호가 S1부터 연속되지 않습니다."
            )

        expected_source_ids = [
            f"S{index}"
            for index in range(1, context_count + 1)
        ]
        if list(source_ids) != expected_source_ids:
            raise RuntimeError(
                "Context 출처번호가 S1부터 연속되지 않습니다."
            )

        for field_name, text_field in (
            ("system_prompt_chars", "system_prompt"),
            ("user_prompt_chars", "user_prompt"),
            ("combined_prompt_chars", "combined_prompt"),
        ):
            chars_value = prompt_result[field_name]
            if isinstance(chars_value, bool) or not isinstance(
                chars_value,
                int,
            ):
                raise ValueError(
                    f"Answer 입력 필수값이 없습니다: {field_name}"
                )
            if chars_value < 0:
                raise ValueError(
                    f"Answer 입력 필수값이 없습니다: {field_name}"
                )
            if chars_value != len(prompt_result[text_field]):
                raise RuntimeError(
                    "Prompt 문자 수 Metadata가 실제 길이와 "
                    "일치하지 않습니다."
                )

    def generate_answer(
        self,
        prompt_result: Mapping[str, Any],
        *,
        temperature: float | None = None,
        max_output_tokens: int | None = None,
    ) -> dict[str, Any]:
        """
        Prompt 결과를 LLM에 전달하고 답변 결과를 반환한다.
        """
        self._validate_prompt_result(prompt_result)

        llm_result = self.llm.generate(
            prompt_result["system_prompt"],
            prompt_result["user_prompt"],
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        )

        if not isinstance(llm_result, Mapping):
            raise RuntimeError(
                "LLM 결과 형식이 올바르지 않습니다."
            )

        for field_name in ("provider", "model", "answer_text"):
            if field_name not in llm_result:
                raise RuntimeError(
                    f"LLM 결과 필수값이 없습니다: {field_name}"
                )

        answer_text = llm_result["answer_text"]
        if not isinstance(answer_text, str) or answer_text.strip() == "":
            raise RuntimeError(
                "LLM 답변 텍스트가 비어 있습니다."
            )
        cleaned_answer_text = answer_text.strip()
        if len(cleaned_answer_text) > MAX_ANSWER_TEXT_CHARS:
            raise RuntimeError(
                "LLM 답변이 허용된 최대 길이를 초과했습니다."
            )

        return {
            "query": prompt_result["query"],
            "provider": llm_result["provider"],
            "model": llm_result["model"],
            "answer_text": cleaned_answer_text,
            "source_ids": list(
                prompt_result["source_ids"]
            ),
            "context_count": (
                prompt_result["context_count"]
            ),
            "finish_reason": (
                llm_result.get("finish_reason")
            ),
            "prompt_token_count": (
                llm_result.get("prompt_token_count")
            ),
            "candidate_token_count": (
                llm_result.get(
                    "candidate_token_count"
                )
            ),
            "total_token_count": (
                llm_result.get("total_token_count")
            ),
            "temperature": (
                llm_result.get("temperature")
            ),
            "max_output_tokens": (
                llm_result.get("max_output_tokens")
            ),
            "answer_chars": len(
                cleaned_answer_text
            ),
        }

    @staticmethod
    def summarize(
        answer_result: Mapping[str, Any],
    ) -> dict[str, Any]:
        return {
            "provider": answer_result["provider"],
            "model": answer_result["model"],
            "context_count": answer_result["context_count"],
            "source_ids": list(
                answer_result["source_ids"]
            ),
            "finish_reason": (
                answer_result["finish_reason"]
            ),
            "prompt_token_count": (
                answer_result["prompt_token_count"]
            ),
            "candidate_token_count": (
                answer_result[
                    "candidate_token_count"
                ]
            ),
            "total_token_count": (
                answer_result["total_token_count"]
            ),
            "answer_chars": answer_result["answer_chars"],
        }


if __name__ == "__main__":
    class FakeModels:
        def __init__(self):
            self.call_count = 0
            self.last_kwargs = None

        def generate_content(self, **kwargs):
            self.call_count += 1
            self.last_kwargs = kwargs

            class FakeUsageMetadata:
                prompt_token_count = 100
                candidates_token_count = 50
                total_token_count = 150

            class FakeCandidate:
                finish_reason = "STOP"

            class FakeResponse:
                text = (
                    "용도 외 사용을 하려는 경우 "
                    "승인신청이 필요합니다. [S1]"
                )
                usage_metadata = FakeUsageMetadata()
                candidates = [FakeCandidate()]

            return FakeResponse()

    class FakeClient:
        def __init__(self):
            self.models = FakeModels()

    fake_client = FakeClient()

    gemini_llm = GeminiLLM(
        api_key="test-key",
        model="test-model",
        temperature=0.2,
        max_output_tokens=1024,
        client=fake_client,
    )

    llm_result = gemini_llm.generate(
        "시스템 프롬프트",
        "사용자 프롬프트",
    )

    assert fake_client.models.call_count == 1
    assert (
        fake_client.models.last_kwargs["model"]
        == "test-model"
    )
    assert (
        fake_client.models.last_kwargs["contents"]
        == "사용자 프롬프트"
    )
    config = fake_client.models.last_kwargs["config"]
    assert config.system_instruction == "시스템 프롬프트"
    assert llm_result["provider"] == "gemini"
    assert llm_result["model"] == "test-model"
    assert "[S1]" in llm_result["answer_text"]
    assert llm_result["prompt_token_count"] == 100
    assert llm_result["candidate_token_count"] == 50
    assert llm_result["total_token_count"] == 150

    sample_prompt_result = {
        "query": "용도 외 사용 승인은 어떻게 하나요?",
        "system_prompt": "시스템 프롬프트",
        "user_prompt": "사용자 프롬프트",
        "combined_prompt": (
            "===== SYSTEM PROMPT =====\n"
            "시스템 프롬프트\n\n"
            "===== USER PROMPT =====\n"
            "사용자 프롬프트"
        ),
        "source_ids": ["S1"],
        "context_count": 1,
        "system_prompt_chars": len(
            "시스템 프롬프트"
        ),
        "user_prompt_chars": len(
            "사용자 프롬프트"
        ),
        "combined_prompt_chars": 0,
    }
    sample_prompt_result[
        "combined_prompt_chars"
    ] = len(
        sample_prompt_result["combined_prompt"]
    )

    answer_service = AnswerService(
        gemini_llm
    )
    answer_result = answer_service.generate_answer(
        sample_prompt_result
    )

    assert answer_result["query"] == (
        sample_prompt_result["query"]
    )
    assert answer_result["provider"] == "gemini"
    assert answer_result["source_ids"] == ["S1"]
    assert answer_result["context_count"] == 1
    assert answer_result["answer_chars"] > 0

    try:
        GeminiLLM(
            api_key=" ",
            model="test-model",
            client=FakeClient(),
        )
    except ValueError as exc:
        assert "GEMINI_API_KEY" in str(exc)
    else:
        raise AssertionError(
            "API Key 없음 ValueError가 발생하지 않았습니다."
        )

    try:
        GeminiLLM(
            api_key="test-key",
            model=" ",
            client=FakeClient(),
        )
    except ValueError as exc:
        assert "GEMINI_GENERATION_MODEL" in str(exc)
    else:
        raise AssertionError(
            "Model 없음 ValueError가 발생하지 않았습니다."
        )

    try:
        gemini_llm.generate("   ", "사용자 프롬프트")
    except ValueError as exc:
        assert "system_prompt" in str(exc)
    else:
        raise AssertionError(
            "빈 system_prompt ValueError가 발생하지 않았습니다."
        )

    try:
        gemini_llm.generate("시스템 프롬프트", "   ")
    except ValueError as exc:
        assert "user_prompt" in str(exc)
    else:
        raise AssertionError(
            "빈 user_prompt ValueError가 발생하지 않았습니다."
        )

    try:
        gemini_llm.generate(
            "시스템 프롬프트",
            "사용자 프롬프트",
            temperature=3.0,
        )
    except ValueError:
        pass
    else:
        raise AssertionError(
            "잘못된 temperature ValueError가 "
            "발생하지 않았습니다."
        )

    try:
        gemini_llm.generate(
            "시스템 프롬프트",
            "사용자 프롬프트",
            max_output_tokens=10,
        )
    except ValueError:
        pass
    else:
        raise AssertionError(
            "잘못된 max_output_tokens ValueError가 "
            "발생하지 않았습니다."
        )

    class EmptyTextModels(FakeModels):
        def generate_content(self, **kwargs):
            self.call_count += 1
            self.last_kwargs = kwargs

            class FakeResponse:
                text = "   "
                usage_metadata = None
                candidates = []

            return FakeResponse()

    empty_client = FakeClient()
    empty_client.models = EmptyTextModels()
    empty_llm = GeminiLLM(
        api_key="test-key",
        model="test-model",
        client=empty_client,
    )
    try:
        empty_llm.generate(
            "시스템 프롬프트",
            "사용자 프롬프트",
        )
    except RuntimeError as exc:
        assert "답변 텍스트" in str(exc)
    else:
        raise AssertionError(
            "빈 Gemini response RuntimeError가 "
            "발생하지 않았습니다."
        )

    invalid_chars_prompt = dict(sample_prompt_result)
    invalid_chars_prompt["system_prompt_chars"] = 1
    try:
        answer_service.generate_answer(invalid_chars_prompt)
    except RuntimeError as exc:
        assert "문자 수 Metadata" in str(exc)
    else:
        raise AssertionError(
            "Prompt 문자 수 불일치 RuntimeError가 "
            "발생하지 않았습니다."
        )

    invalid_source_prompt = dict(sample_prompt_result)
    invalid_source_prompt["source_ids"] = ["S1", "S3"]
    invalid_source_prompt["context_count"] = 2
    try:
        answer_service.generate_answer(invalid_source_prompt)
    except RuntimeError as exc:
        assert "출처번호" in str(exc)
    else:
        raise AssertionError(
            "불연속 source_ids RuntimeError가 "
            "발생하지 않았습니다."
        )

    class EmptyAnswerLLM:
        def generate(self, system_prompt, user_prompt, **kwargs):
            return {
                "provider": "gemini",
                "model": "test-model",
                "answer_text": "   ",
            }

    try:
        AnswerService(EmptyAnswerLLM()).generate_answer(
            sample_prompt_result
        )
    except RuntimeError as exc:
        assert "답변 텍스트" in str(exc)
    else:
        raise AssertionError(
            "빈 answer_text RuntimeError가 "
            "발생하지 않았습니다."
        )

    print("OK: STEP 9-3 Gemini Answer 단위 테스트 완료")

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
    answer_service = AnswerService(
        llm
    )
    answer_result = (
        answer_service.generate_answer(
            prompt_result,
            temperature=0.2,
            max_output_tokens=2048,
        )
    )
    summary = AnswerService.summarize(
        answer_result
    )

    print("query:", answer_result["query"])
    print("provider:", summary["provider"])
    print("model:", summary["model"])
    print(
        "Context 수:",
        summary["context_count"],
    )
    print(
        "사용 가능 출처:",
        summary["source_ids"],
    )
    print(
        "finish_reason:",
        summary["finish_reason"],
    )
    print(
        "prompt tokens:",
        summary["prompt_token_count"],
    )
    print(
        "candidate tokens:",
        summary["candidate_token_count"],
    )
    print(
        "total tokens:",
        summary["total_token_count"],
    )
    print(
        "답변 문자 수:",
        summary["answer_chars"],
    )
    print("Gemini 답변:")
    print(answer_result["answer_text"])

    assert summary["provider"] == "gemini"
    assert summary["model"] == os.getenv(
        "GEMINI_GENERATION_MODEL",
        "",
    ).strip()
    assert answer_result["answer_text"].strip() != ""
    assert summary["answer_chars"] == len(
        answer_result["answer_text"]
    )
    assert 1 <= summary["context_count"] <= 5
    expected_source_ids = [
        f"S{index}"
        for index in range(1, summary["context_count"] + 1)
    ]
    assert summary["source_ids"] == expected_source_ids
    assert any(
        "가" <= char <= "힣"
        for char in answer_result["answer_text"]
    )

    print("OK: STEP 9-3 Gemini Answer 생성 연동 완료")
