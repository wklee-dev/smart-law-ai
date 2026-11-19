# admin_rule_quality_cases.py
#
# 역할: 행정규칙 RAG 품질 검증용 질의 케이스를 정의한다.
#       고정 답변 문구를 기대값으로 사용하지 않는다.

from __future__ import annotations

from typing import TypedDict


class QualityCase(TypedDict, total=False):
    case_id: str
    category: str
    query: str
    expected_law_name_terms: tuple[str, ...]
    expected_article_terms: tuple[str, ...]
    expected_title_terms: tuple[str, ...]
    minimum_context_count: int
    require_valid_citation: bool
    low_evidence: bool


QUALITY_CASES: tuple[QualityCase, ...] = (
    {
        "case_id": "GENERAL_USAGE_APPROVAL",
        "category": "GENERAL",
        "query": (
            "사후관리 대상 물품의 용도 외 사용 승인은 "
            "어떻게 하나요?"
        ),
        "expected_law_name_terms": (
            "사후관리에 관한 고시",
        ),
        "expected_title_terms": (
            "용도 외 사용",
            "승인",
            "승인신청",
        ),
        "minimum_context_count": 1,
        "require_valid_citation": True,
    },
    {
        "case_id": "ARTICLE_29",
        "category": "ARTICLE_NUMBER",
        "query": (
            "사후관리에 관한 고시 제29조는 "
            "어떤 내용을 규정하나요?"
        ),
        "expected_law_name_terms": (
            "사후관리에 관한 고시",
        ),
        "expected_article_terms": (
            "제29조",
            "29조",
        ),
        "minimum_context_count": 1,
        "require_valid_citation": True,
    },
    {
        "case_id": "CONSIGNMENT_APPROVAL",
        "category": "SPECIALIZED_TERM",
        "query": "위탁사후관리물품 승인신청 절차를 알려주세요.",
        "expected_title_terms": (
            "위탁사후관리물품",
            "승인신청",
            "승인",
        ),
        "minimum_context_count": 1,
        "require_valid_citation": True,
    },
    {
        "case_id": "SHORT_USAGE_QUERY",
        "category": "SHORT_QUERY",
        "query": "용도 외 사용",
        "expected_title_terms": (
            "용도 외 사용",
            "승인",
        ),
        "minimum_context_count": 1,
        "require_valid_citation": True,
    },
    {
        "case_id": "COMPARE_APPROVALS",
        "category": "COMPARISON",
        "query": (
            "용도 외 사용 승인과 위탁사후관리물품 승인 "
            "절차의 차이를 설명해주세요."
        ),
        "expected_title_terms": (
            "용도 외 사용",
            "위탁사후관리물품",
            "승인",
        ),
        "minimum_context_count": 2,
        "require_valid_citation": True,
    },
    {
        "case_id": "LOW_EVIDENCE",
        "category": "LOW_EVIDENCE",
        "query": (
            "현재 적재된 자료에 없는 가상의 관세 "
            "자동승인제도를 설명해주세요."
        ),
        "minimum_context_count": 1,
        "require_valid_citation": False,
        "low_evidence": True,
    },
)
