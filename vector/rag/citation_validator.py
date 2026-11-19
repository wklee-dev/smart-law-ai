# citation_validator.py
#
# 역할: Gemini 답변의 출처번호를 파싱하고
#       사용 가능한 Context 출처와 비교해 검증한다.

from __future__ import annotations

import re
from collections import Counter
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

CITATION_STATUS_VALID = "VALID"
CITATION_STATUS_NO_CITATIONS = "NO_CITATIONS"
CITATION_STATUS_INVALID_CITATIONS = (
    "INVALID_CITATIONS"
)
CITATION_STATUS_MIXED_CITATIONS = (
    "MIXED_CITATIONS"
)

CITATION_ID_PATTERN = re.compile(
    r"\[S([1-9]\d*)\]"
)

MALFORMED_CITATION_PATTERN = re.compile(
    r"""
    (?:
        \[\s*[sS]\s*\d+\s*\]
        |
        \(\s*[sS]\s*\d+\s*\)
        |
        【\s*[sS]\s*\d+\s*】
        |
        (?<![\w\[]) [sS]\d+ (?![\w\]])
    )
    """,
    re.VERBOSE,
)

MAX_CITATION_NUMBER = 100_000
MAX_ANSWER_VALIDATION_CHARS = 50_000

_REQUIRED_ANSWER_FIELDS = (
    "query",
    "answer_text",
    "source_ids",
    "context_count",
)


class CitationValidator:
    """
    Gemini 답변의 출처번호를 파싱하고
    사용 가능한 Context 출처와 비교해 검증한다.
    """

    @staticmethod
    def _validate_answer_result(
        answer_result: Mapping[str, Any],
    ) -> None:
        if not isinstance(answer_result, Mapping):
            raise TypeError(
                "answer_result는 Mapping이어야 합니다."
            )

        for field_name in _REQUIRED_ANSWER_FIELDS:
            if field_name not in answer_result:
                raise ValueError(
                    f"Citation 입력 필수값이 없습니다: {field_name}"
                )

        query = answer_result["query"]
        if not isinstance(query, str) or query.strip() == "":
            raise ValueError(
                "Citation 입력 필수값이 없습니다: query"
            )

        answer_text = answer_result["answer_text"]
        if (
            not isinstance(answer_text, str)
            or answer_text.strip() == ""
        ):
            raise ValueError(
                "Citation 입력 필수값이 없습니다: answer_text"
            )
        if len(answer_text) > MAX_ANSWER_VALIDATION_CHARS:
            raise ValueError(
                "answer_text가 Citation 검증 최대 길이를 초과했습니다."
            )

        source_ids = answer_result["source_ids"]
        if isinstance(source_ids, (str, bytes)):
            raise TypeError(
                "source_ids는 Sequence여야 합니다."
            )
        if not isinstance(source_ids, Sequence):
            raise TypeError(
                "source_ids는 Sequence여야 합니다."
            )

        context_count = answer_result["context_count"]
        if isinstance(context_count, bool) or not isinstance(
            context_count,
            int,
        ):
            raise ValueError(
                "Citation 입력 필수값이 없습니다: context_count"
            )
        if context_count < 1:
            raise ValueError(
                "Citation 입력 필수값이 없습니다: context_count"
            )

        if len(source_ids) != context_count:
            raise RuntimeError(
                "source_ids 개수와 context_count가 일치하지 않습니다."
            )

        expected_source_ids = [
            f"S{index}"
            for index in range(1, context_count + 1)
        ]
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

    @classmethod
    def _parse_citation_occurrences(
        cls,
        answer_text: str,
    ) -> list[str]:
        """
        답변에 나타난 정식 Citation을 순서와 중복을 유지해 반환한다.
        """
        if not isinstance(answer_text, str):
            raise TypeError(
                "answer_text는 문자열이어야 합니다."
            )
        cleaned = answer_text.strip()
        if cleaned == "":
            raise ValueError(
                "answer_text는 필수입니다."
            )

        occurrences: list[str] = []
        for match in CITATION_ID_PATTERN.finditer(answer_text):
            citation_number = int(match.group(1))
            if citation_number > MAX_CITATION_NUMBER:
                continue
            occurrences.append(f"S{citation_number}")
        return occurrences

    @staticmethod
    def _unique_in_order(
        values: Sequence[str],
    ) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for value in values:
            if value in seen:
                continue
            seen.add(value)
            result.append(value)
        return result

    @classmethod
    def _spans_overlap(
        cls,
        left: tuple[int, int],
        right: tuple[int, int],
    ) -> bool:
        return left[0] < right[1] and right[0] < left[1]

    @classmethod
    def _find_malformed_citation_candidates(
        cls,
        answer_text: str,
        valid_occurrence_spans: Sequence[tuple[int, int]],
    ) -> list[str]:
        """
        정식 Citation이 아닌 Citation 유사 표현을 찾는다.
        """
        candidates: list[str] = []
        seen: set[str] = set()

        for match in MALFORMED_CITATION_PATTERN.finditer(
            answer_text
        ):
            span = match.span()
            overlaps_valid = any(
                cls._spans_overlap(span, valid_span)
                for valid_span in valid_occurrence_spans
            )
            if overlaps_valid:
                continue

            # Exact formal citation already handled separately.
            if CITATION_ID_PATTERN.fullmatch(match.group(0)):
                continue

            candidate = match.group(0).strip()
            if candidate == "" or candidate in seen:
                continue
            seen.add(candidate)
            candidates.append(candidate)

        return candidates

    @staticmethod
    def _determine_status(
        *,
        valid_citation_ids: Sequence[str],
        invalid_citation_ids: Sequence[str],
    ) -> tuple[str, bool]:
        has_valid = len(valid_citation_ids) > 0
        has_invalid = len(invalid_citation_ids) > 0

        if not has_valid and not has_invalid:
            return CITATION_STATUS_NO_CITATIONS, False
        if has_valid and not has_invalid:
            return CITATION_STATUS_VALID, True
        if not has_valid and has_invalid:
            return CITATION_STATUS_INVALID_CITATIONS, False
        return CITATION_STATUS_MIXED_CITATIONS, False

    @staticmethod
    def _build_validation_messages(
        *,
        status: str,
        valid_citation_ids: Sequence[str],
        invalid_citation_ids: Sequence[str],
        unused_source_ids: Sequence[str],
        malformed_citation_candidates: Sequence[str],
    ) -> list[str]:
        messages: list[str] = []

        if status == CITATION_STATUS_VALID:
            messages.append(
                "답변의 출처번호가 모두 유효합니다."
            )
        elif status == CITATION_STATUS_NO_CITATIONS:
            messages.append(
                "답변에 정식 출처번호가 없습니다."
            )
        elif status == CITATION_STATUS_INVALID_CITATIONS:
            messages.append(
                "답변에 사용할 수 없는 출처번호가 "
                "포함되어 있습니다: "
                + ", ".join(invalid_citation_ids)
            )
        elif status == CITATION_STATUS_MIXED_CITATIONS:
            messages.append(
                "답변에 유효한 출처번호와 사용할 수 없는 "
                "출처번호가 함께 포함되어 있습니다."
            )
            if invalid_citation_ids:
                messages.append(
                    "사용할 수 없는 출처번호: "
                    + ", ".join(invalid_citation_ids)
                )

        if unused_source_ids:
            messages.append(
                "답변에서 사용하지 않은 Context 출처가 있습니다: "
                + ", ".join(unused_source_ids)
            )

        if malformed_citation_candidates:
            messages.append(
                "정식 형식이 아닌 Citation 후보가 있습니다: "
                + ", ".join(malformed_citation_candidates)
            )

        return messages

    @classmethod
    def validate(
        cls,
        answer_result: Mapping[str, Any],
    ) -> dict[str, Any]:
        """
        Answer Result의 Citation을 파싱·검증하고
        표준 결과를 반환한다.
        """
        cls._validate_answer_result(answer_result)

        cleaned_query = str(answer_result["query"]).strip()
        cleaned_answer_text = str(
            answer_result["answer_text"]
        ).strip()
        available_source_ids = list(
            answer_result["source_ids"]
        )
        available_source_id_set = set(available_source_ids)

        citation_occurrences: list[str] = []
        valid_occurrence_spans: list[tuple[int, int]] = []
        for match in CITATION_ID_PATTERN.finditer(
            cleaned_answer_text
        ):
            citation_number = int(match.group(1))
            if citation_number > MAX_CITATION_NUMBER:
                continue
            citation_occurrences.append(
                f"S{citation_number}"
            )
            valid_occurrence_spans.append(match.span())

        parsed_citation_ids = cls._unique_in_order(
            citation_occurrences
        )

        valid_citation_ids = [
            citation_id
            for citation_id in parsed_citation_ids
            if citation_id in available_source_id_set
        ]
        invalid_citation_ids = [
            citation_id
            for citation_id in parsed_citation_ids
            if citation_id not in available_source_id_set
        ]
        unused_source_ids = [
            source_id
            for source_id in available_source_ids
            if source_id not in set(valid_citation_ids)
        ]

        occurrence_counter = Counter(citation_occurrences)
        citation_counts: dict[str, int] = {}
        for citation_id in parsed_citation_ids:
            citation_counts[citation_id] = (
                occurrence_counter[citation_id]
            )

        malformed_citation_candidates = (
            cls._find_malformed_citation_candidates(
                cleaned_answer_text,
                valid_occurrence_spans,
            )
        )

        status, is_valid = cls._determine_status(
            valid_citation_ids=valid_citation_ids,
            invalid_citation_ids=invalid_citation_ids,
        )
        validation_messages = cls._build_validation_messages(
            status=status,
            valid_citation_ids=valid_citation_ids,
            invalid_citation_ids=invalid_citation_ids,
            unused_source_ids=unused_source_ids,
            malformed_citation_candidates=(
                malformed_citation_candidates
            ),
        )

        return {
            "query": cleaned_query,
            "answer_text": cleaned_answer_text,
            "validation_status": status,
            "is_valid": is_valid,
            "available_source_ids": available_source_ids,
            "citation_occurrences": citation_occurrences,
            "parsed_citation_ids": parsed_citation_ids,
            "valid_citation_ids": valid_citation_ids,
            "invalid_citation_ids": invalid_citation_ids,
            "unused_source_ids": unused_source_ids,
            "citation_counts": citation_counts,
            "citation_occurrence_count": len(
                citation_occurrences
            ),
            "unique_citation_count": len(
                parsed_citation_ids
            ),
            "valid_citation_count": len(
                valid_citation_ids
            ),
            "invalid_citation_count": len(
                invalid_citation_ids
            ),
            "unused_source_count": len(
                unused_source_ids
            ),
            "has_citations": bool(
                citation_occurrences
            ),
            "has_invalid_citations": bool(
                invalid_citation_ids
            ),
            "has_malformed_citation_candidates": bool(
                malformed_citation_candidates
            ),
            "malformed_citation_candidates": (
                malformed_citation_candidates
            ),
            "validation_messages": validation_messages,
        }

    @staticmethod
    def summarize(
        validation_result: Mapping[str, Any],
    ) -> dict[str, Any]:
        return {
            "validation_status": (
                validation_result["validation_status"]
            ),
            "is_valid": validation_result["is_valid"],
            "available_source_ids": list(
                validation_result["available_source_ids"]
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
            "validation_messages": list(
                validation_result["validation_messages"]
            ),
        }


if __name__ == "__main__":
    # TEST 1
    answer_result = {
        "query": "용도 외 사용 승인은 어떻게 하나요?",
        "answer_text": (
            "용도 외 사용 전 승인을 신청해야 합니다. [S1] "
            "위탁관리 대상은 별도 절차를 확인해야 합니다. [S2]"
        ),
        "source_ids": ["S1", "S2", "S3"],
        "context_count": 3,
    }
    result = CitationValidator.validate(answer_result)
    assert result["validation_status"] == "VALID"
    assert result["is_valid"] is True
    assert result["citation_occurrences"] == ["S1", "S2"]
    assert result["valid_citation_ids"] == ["S1", "S2"]
    assert result["invalid_citation_ids"] == []
    assert result["unused_source_ids"] == ["S3"]

    # TEST 2
    duplicate_result = CitationValidator.validate(
        {
            "query": "중복 Citation 테스트",
            "answer_text": (
                "근거입니다. [S2][S1] 추가 근거입니다. [S2]"
            ),
            "source_ids": ["S1", "S2"],
            "context_count": 2,
        }
    )
    assert duplicate_result["citation_occurrences"] == [
        "S2",
        "S1",
        "S2",
    ]
    assert duplicate_result["parsed_citation_ids"] == [
        "S2",
        "S1",
    ]
    assert duplicate_result["citation_counts"] == {
        "S2": 2,
        "S1": 1,
    }

    # TEST 3
    invalid_result = CitationValidator.validate(
        {
            "query": "잘못된 Citation 테스트",
            "answer_text": "근거입니다. [S9]",
            "source_ids": ["S1", "S2"],
            "context_count": 2,
        }
    )
    assert (
        invalid_result["validation_status"]
        == "INVALID_CITATIONS"
    )
    assert invalid_result["is_valid"] is False
    assert invalid_result["invalid_citation_ids"] == ["S9"]

    # TEST 4
    mixed_result = CitationValidator.validate(
        {
            "query": "혼합 Citation 테스트",
            "answer_text": (
                "정상 근거 [S1], 잘못된 근거 [S7]"
            ),
            "source_ids": ["S1", "S2"],
            "context_count": 2,
        }
    )
    assert (
        mixed_result["validation_status"]
        == "MIXED_CITATIONS"
    )
    assert mixed_result["valid_citation_ids"] == ["S1"]
    assert mixed_result["invalid_citation_ids"] == ["S7"]

    # TEST 5
    no_citation_result = CitationValidator.validate(
        {
            "query": "Citation 없음 테스트",
            "answer_text": (
                "제공된 자료에 따라 승인이 필요합니다."
            ),
            "source_ids": ["S1"],
            "context_count": 1,
        }
    )
    assert (
        no_citation_result["validation_status"]
        == "NO_CITATIONS"
    )
    assert no_citation_result["is_valid"] is False
    assert no_citation_result["has_citations"] is False

    # TEST 6
    malformed_result = CitationValidator.validate(
        {
            "query": "잘못된 형식 후보 테스트",
            "answer_text": (
                "근거는 [s1], [S 2], (S3), 【S4】입니다."
            ),
            "source_ids": ["S1", "S2", "S3", "S4"],
            "context_count": 4,
        }
    )
    assert malformed_result["parsed_citation_ids"] == []
    assert (
        malformed_result[
            "has_malformed_citation_candidates"
        ]
        is True
    )
    malformed_candidates = malformed_result[
        "malformed_citation_candidates"
    ]
    assert "[s1]" in malformed_candidates
    assert "[S 2]" in malformed_candidates
    assert "(S3)" in malformed_candidates
    assert "【S4】" in malformed_candidates

    # TEST 7
    mixed_format_result = CitationValidator.validate(
        {
            "query": "정식/malformed 혼합 테스트",
            "answer_text": (
                "정상 [S1], 잘못된 형식 [s2]"
            ),
            "source_ids": ["S1", "S2"],
            "context_count": 2,
        }
    )
    assert mixed_format_result["valid_citation_ids"] == [
        "S1"
    ]
    assert (
        mixed_format_result["validation_status"]
        == "VALID"
    )
    assert (
        mixed_format_result[
            "has_malformed_citation_candidates"
        ]
        is True
    )

    # Extra exception tests
    try:
        CitationValidator.validate("not-a-mapping")  # type: ignore[arg-type]
    except TypeError:
        pass
    else:
        raise AssertionError("Mapping TypeError 미발생")

    try:
        CitationValidator.validate(
            {
                "answer_text": "테스트 [S1]",
                "source_ids": ["S1"],
                "context_count": 1,
            }
        )
    except ValueError as exc:
        assert "query" in str(exc)
    else:
        raise AssertionError("query 누락 ValueError 미발생")

    try:
        CitationValidator.validate(
            {
                "query": "테스트",
                "source_ids": ["S1"],
                "context_count": 1,
            }
        )
    except ValueError as exc:
        assert "answer_text" in str(exc)
    else:
        raise AssertionError(
            "answer_text 누락 ValueError 미발생"
        )

    try:
        CitationValidator.validate(
            {
                "query": "테스트",
                "answer_text": "   ",
                "source_ids": ["S1"],
                "context_count": 1,
            }
        )
    except ValueError:
        pass
    else:
        raise AssertionError(
            "빈 answer_text ValueError 미발생"
        )

    try:
        CitationValidator.validate(
            {
                "query": "테스트",
                "answer_text": "테스트 [S1]",
                "source_ids": "S1",
                "context_count": 1,
            }
        )
    except TypeError:
        pass
    else:
        raise AssertionError(
            "source_ids 문자열 TypeError 미발생"
        )

    try:
        CitationValidator.validate(
            {
                "query": "테스트",
                "answer_text": "테스트 [S1]",
                "source_ids": ["S1", "S2"],
                "context_count": 1,
            }
        )
    except RuntimeError as exc:
        assert "context_count" in str(exc)
    else:
        raise AssertionError(
            "개수 불일치 RuntimeError 미발생"
        )

    try:
        CitationValidator.validate(
            {
                "query": "테스트",
                "answer_text": "테스트 [S1]",
                "source_ids": ["S1", "S3"],
                "context_count": 2,
            }
        )
    except RuntimeError as exc:
        assert "S1부터 연속" in str(exc)
    else:
        raise AssertionError(
            "불연속 source_ids RuntimeError 미발생"
        )

    try:
        CitationValidator.validate(
            {
                "query": "테스트",
                "answer_text": "a" * 50_001,
                "source_ids": ["S1"],
                "context_count": 1,
            }
        )
    except ValueError as exc:
        assert "최대 길이" in str(exc)
    else:
        raise AssertionError(
            "최대 길이 ValueError 미발생"
        )

    special_parse = CitationValidator.validate(
        {
            "query": "특수 Citation 테스트",
            "answer_text": (
                "값 [S0], [S01], [S100001], [S2]"
            ),
            "source_ids": ["S1", "S2"],
            "context_count": 2,
        }
    )
    assert "S0" not in special_parse["citation_occurrences"]
    assert "S01" not in special_parse["parsed_citation_ids"]
    assert (
        "S100001"
        not in special_parse["citation_occurrences"]
    )
    assert special_parse["citation_occurrences"] == ["S2"]

    print("OK: STEP 9-4A Citation Validator 단위 테스트 완료")

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
    summary = CitationValidator.summarize(
        validation_result
    )

    print("query:", answer_result["query"])
    print(
        "사용 가능 출처:",
        summary["available_source_ids"],
    )
    print(
        "파싱된 출처:",
        summary["parsed_citation_ids"],
    )
    print(
        "유효 출처:",
        summary["valid_citation_ids"],
    )
    print(
        "잘못된 출처:",
        summary["invalid_citation_ids"],
    )
    print(
        "미사용 출처:",
        summary["unused_source_ids"],
    )
    print(
        "검증 상태:",
        summary["validation_status"],
    )
    print(
        "검증 성공:",
        summary["is_valid"],
    )
    print(
        "Citation 전체 등장 횟수:",
        summary["citation_occurrence_count"],
    )
    print(
        "Citation 고유 개수:",
        summary["unique_citation_count"],
    )
    print(
        "잘못된 형식 후보 존재:",
        summary[
            "has_malformed_citation_candidates"
        ],
    )
    for message in summary["validation_messages"]:
        print("검증 메시지:", message)
    print(
        "답변 preview:",
        answer_result["answer_text"][:1000],
    )

    assert summary["validation_status"] in {
        CITATION_STATUS_VALID,
        CITATION_STATUS_NO_CITATIONS,
        CITATION_STATUS_INVALID_CITATIONS,
        CITATION_STATUS_MIXED_CITATIONS,
    }
    assert len(summary["parsed_citation_ids"]) == len(
        set(summary["parsed_citation_ids"])
    )
    available = set(summary["available_source_ids"])
    assert all(
        citation_id in available
        for citation_id in summary["valid_citation_ids"]
    )
    assert all(
        citation_id not in available
        for citation_id in summary["invalid_citation_ids"]
    )
    if (
        summary["valid_citation_ids"]
        and summary["invalid_citation_ids"]
    ):
        assert (
            summary["validation_status"]
            == CITATION_STATUS_MIXED_CITATIONS
        )
    if summary["citation_occurrence_count"] == 0:
        assert (
            summary["validation_status"]
            == CITATION_STATUS_NO_CITATIONS
        )
    assert (
        answer_result["answer_text"]
        == original_answer_text
    )

    print(
        "OK: STEP 9-4A Citation 파싱·검증·표준화 연동 완료"
    )
