# citation_stability_test.py
#
# 역할: Citation Prompt 강화와 CitationPolicy 판정을
#       단위·회귀 검증한다.

from __future__ import annotations

import os
from typing import Any

from vector.chunk_generator.embedding_service import (
    EmbeddingService,
)
from vector.chunk_generator.supabase_repository import (
    SupabaseRepository,
)
from vector.llm.llm_factory import create_llm
from vector.rag.answer_service import AnswerService
from vector.rag.citation_policy import (
    CITATION_POLICY_REPORT,
    CITATION_POLICY_STRICT,
    CitationPolicy,
)
from vector.rag.citation_result_builder import (
    CitationResultBuilder,
)
from vector.rag.citation_validator import (
    CitationValidator,
)
from vector.rag.context_builder import ContextBuilder
from vector.rag.prompt_builder import (
    PROMPT_CONTEXT_END_MARKER,
    PROMPT_CONTEXT_START_MARKER,
    PROMPT_QUERY_END_MARKER,
    PROMPT_QUERY_START_MARKER,
    PromptBuilder,
)
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
from vector.search.ranking_service import RankingService

CITATION_STABILITY_ENV = (
    "SMARTLAW_RUN_CITATION_STABILITY_TEST"
)
CITATION_STABILITY_VALUE = "YES"

REGRESSION_QUERY = (
    "사후관리 대상 물품의 용도 외 사용 승인은 "
    "어떻게 하나요?"
)


def _sample_context_result() -> dict[str, Any]:
    context_text = (
        "[S1]\n"
        "문서명: 사후관리에 관한 고시\n"
        "조문: 제11조\n"
        "제목: 용도 외 사용 승인\n\n"
        "본문:\n"
        "용도 외 사용을 하려는 자는 승인을 신청해야 한다.\n\n"
        "---\n\n"
        "[S2]\n"
        "문서명: 사후관리에 관한 고시\n"
        "조문: 제29조\n"
        "제목: 위탁사후관리물품 승인신청\n\n"
        "본문:\n"
        "위탁사후관리물품에 관한 승인 절차를 규정한다."
    )
    return {
        "query": REGRESSION_QUERY,
        "context_text": context_text,
        "context_count": 2,
        "source_ids": ["S1", "S2"],
        "included_chunk_ids": [10, 20],
        "excluded_chunk_ids": [],
        "duplicate_chunk_ids": [],
        "truncated_chunk_ids": [],
        "total_context_chars": len(context_text),
        "sources": [
            {
                "citation_id": "S1",
                "id": 10,
            },
            {
                "citation_id": "S2",
                "id": 20,
            },
        ],
    }


def _base_validation(
    *,
    status: str,
    is_valid: bool,
    parsed: list[str],
    valid: list[str],
    invalid: list[str],
) -> dict[str, Any]:
    return {
        "validation_status": status,
        "is_valid": is_valid,
        "parsed_citation_ids": parsed,
        "valid_citation_ids": valid,
        "invalid_citation_ids": invalid,
    }


def test_prompt_strengthening() -> None:
    context_result = _sample_context_result()
    prompt_result = PromptBuilder.build(context_result)

    system_prompt = prompt_result["system_prompt"]
    user_prompt = prompt_result["user_prompt"]

    system_checks = (
        "각 문단",
        "[S1]",
        "[S2]",
        "사용 가능한 Context 출처번호",
        "존재하지 않는 번호",
        "한꺼번에 나열",
        "추측하지 말고",
        "형식 예시",
    )
    for required in system_checks:
        assert required in system_prompt, required

    user_checks = (
        "각 문단 끝",
        "사용 가능한 출처번호 목록",
        "[S숫자]",
        "[S1][S2]",
        "일괄 나열하지",
        "출처 없는 법률적 결론",
        "추측하지 말고",
        "스스로 다음을 검사",
        "주요 문단마다 Citation",
        "사용 가능 목록",
        "정확히 [S숫자]",
    )
    for required in user_checks:
        assert required in user_prompt, required

    assert PROMPT_QUERY_START_MARKER in user_prompt
    assert PROMPT_QUERY_END_MARKER in user_prompt
    assert PROMPT_CONTEXT_START_MARKER in user_prompt
    assert PROMPT_CONTEXT_END_MARKER in user_prompt
    assert context_result["context_text"] in user_prompt
    assert "S1, S2" in user_prompt
    assert context_result["query"] in user_prompt


def test_policy_valid() -> None:
    validation = _base_validation(
        status="VALID",
        is_valid=True,
        parsed=["S1"],
        valid=["S1"],
        invalid=[],
    )

    report = CitationPolicy.evaluate(
        validation,
        policy=CITATION_POLICY_REPORT,
    )
    assert report["allowed"] is True
    assert report["citation_stable"] is True
    assert report["reason_code"] == "CITATION_VALID"

    strict = CitationPolicy.evaluate(
        validation,
        policy=CITATION_POLICY_STRICT,
    )
    assert strict["allowed"] is True
    assert strict["citation_stable"] is True

    enforced = CitationPolicy.enforce(
        validation,
        policy=CITATION_POLICY_STRICT,
    )
    assert enforced["allowed"] is True


def test_policy_no_citations() -> None:
    validation = _base_validation(
        status="NO_CITATIONS",
        is_valid=False,
        parsed=[],
        valid=[],
        invalid=[],
    )

    report = CitationPolicy.evaluate(
        validation,
        policy=CITATION_POLICY_REPORT,
    )
    assert report["allowed"] is True
    assert report["citation_stable"] is False
    assert report["reason_code"] == "CITATION_MISSING"

    try:
        CitationPolicy.enforce(
            validation,
            policy=CITATION_POLICY_STRICT,
        )
    except RuntimeError as exc:
        assert "CITATION_MISSING" in str(exc)
    else:
        raise AssertionError(
            "NO_CITATIONS STRICT enforce 미발생"
        )


def test_policy_invalid_citations() -> None:
    validation = _base_validation(
        status="INVALID_CITATIONS",
        is_valid=False,
        parsed=["S9"],
        valid=[],
        invalid=["S9"],
    )

    report = CitationPolicy.evaluate(
        validation,
        policy=CITATION_POLICY_REPORT,
    )
    assert report["allowed"] is True
    assert report["citation_stable"] is False
    assert report["reason_code"] == "CITATION_INVALID"

    try:
        CitationPolicy.enforce(
            validation,
            policy=CITATION_POLICY_STRICT,
        )
    except RuntimeError as exc:
        assert "CITATION_INVALID" in str(exc)
    else:
        raise AssertionError(
            "INVALID_CITATIONS STRICT enforce 미발생"
        )


def test_policy_mixed_citations() -> None:
    validation = _base_validation(
        status="MIXED_CITATIONS",
        is_valid=False,
        parsed=["S1", "S9"],
        valid=["S1"],
        invalid=["S9"],
    )

    report = CitationPolicy.evaluate(
        validation,
        policy=CITATION_POLICY_REPORT,
    )
    assert report["allowed"] is True
    assert report["citation_stable"] is False
    assert report["reason_code"] == "CITATION_MIXED"

    try:
        CitationPolicy.enforce(
            validation,
            policy=CITATION_POLICY_STRICT,
        )
    except RuntimeError as exc:
        assert "CITATION_MIXED" in str(exc)
    else:
        raise AssertionError(
            "MIXED_CITATIONS STRICT enforce 미발생"
        )


def test_policy_invalid_state_combinations() -> None:
    invalid_cases = (
        _base_validation(
            status="VALID",
            is_valid=False,
            parsed=["S1"],
            valid=["S1"],
            invalid=[],
        ),
        _base_validation(
            status="VALID",
            is_valid=True,
            parsed=[],
            valid=[],
            invalid=[],
        ),
        _base_validation(
            status="VALID",
            is_valid=True,
            parsed=["S1", "S9"],
            valid=["S1"],
            invalid=["S9"],
        ),
        _base_validation(
            status="NO_CITATIONS",
            is_valid=True,
            parsed=[],
            valid=[],
            invalid=[],
        ),
    )

    for case in invalid_cases:
        try:
            CitationPolicy.evaluate(
                case,
                policy=CITATION_POLICY_REPORT,
            )
        except RuntimeError:
            pass
        else:
            raise AssertionError(
                "잘못된 상태 조합 RuntimeError 미발생: "
                f"{case['validation_status']}"
            )


def run_unit_tests() -> None:
    test_prompt_strengthening()
    test_policy_valid()
    test_policy_no_citations()
    test_policy_invalid_citations()
    test_policy_mixed_citations()
    test_policy_invalid_state_combinations()
    print(
        "OK: STEP 9-6 Citation 출력 안정화 "
        "단위 테스트 완료"
    )


def _create_rag_chat_service() -> RAGChatService:
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


def run_real_regression() -> None:
    service = _create_rag_chat_service()
    valid_runs = 0
    total_runs = 3

    for index in range(1, total_runs + 1):
        final_result = service.chat(REGRESSION_QUERY)
        citation = final_result["citation_validation"]
        status = citation["status"]
        is_valid = citation["is_valid"]
        valid_ids = list(citation["valid_citation_ids"])
        invalid_ids = list(citation["invalid_citation_ids"])

        print(f"run={index}")
        print("validation_status:", status)
        print("is_valid:", is_valid)
        print("valid_citation_ids:", valid_ids)
        print("invalid_citation_ids:", invalid_ids)
        print("answer_chars:", final_result["answer_chars"])
        print(
            "cited_source_count:",
            final_result["cited_source_count"],
        )
        print(
            "unused_source_count:",
            final_result["unused_source_count"],
        )
        print(
            "answer_text preview:",
            final_result["answer_text"][:300],
        )

        CitationPolicy.evaluate(
            {
                "validation_status": status,
                "is_valid": is_valid,
                "parsed_citation_ids": list(
                    citation["parsed_citation_ids"]
                ),
                "valid_citation_ids": valid_ids,
                "invalid_citation_ids": invalid_ids,
            },
            policy=CITATION_POLICY_REPORT,
        )

        if (
            status == "VALID"
            and is_valid is True
            and len(valid_ids) >= 1
            and len(invalid_ids) == 0
            and final_result["cited_source_count"] >= 1
        ):
            valid_runs += 1

    if valid_runs < 2:
        raise RuntimeError(
            "Citation 안정화 회귀 기준을 충족하지 못했습니다. "
            f"valid_runs={valid_runs}, total_runs=3"
        )

    print(
        "OK: STEP 9-6 Citation 출력 안정화 "
        "실제 회귀 테스트 완료"
    )


if __name__ == "__main__":
    run_unit_tests()

    if (
        os.getenv(CITATION_STABILITY_ENV)
        == CITATION_STABILITY_VALUE
    ):
        run_real_regression()
    else:
        print(
            "실제 Citation 안정화 회귀 테스트를 실행하려면 "
            f"{CITATION_STABILITY_ENV}="
            f"{CITATION_STABILITY_VALUE}를 설정하세요."
        )

    print(
        "OK: STEP 9-6 Citation 출력 안정화 완료"
    )
