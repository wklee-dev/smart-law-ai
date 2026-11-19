# citation_policy.py
#
# 역할: Citation Validation 결과를 기준으로
#       RAG 응답 허용 여부를 판정한다.

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

CITATION_POLICY_REPORT = "REPORT"
CITATION_POLICY_STRICT = "STRICT"

SUPPORTED_CITATION_POLICIES = frozenset(
    {
        CITATION_POLICY_REPORT,
        CITATION_POLICY_STRICT,
    }
)

CITATION_STATUS_VALID = "VALID"
CITATION_STATUS_NO_CITATIONS = "NO_CITATIONS"
CITATION_STATUS_INVALID_CITATIONS = (
    "INVALID_CITATIONS"
)
CITATION_STATUS_MIXED_CITATIONS = (
    "MIXED_CITATIONS"
)

SUPPORTED_CITATION_STATUSES = frozenset(
    {
        CITATION_STATUS_VALID,
        CITATION_STATUS_NO_CITATIONS,
        CITATION_STATUS_INVALID_CITATIONS,
        CITATION_STATUS_MIXED_CITATIONS,
    }
)

_REQUIRED_VALIDATION_FIELDS = (
    "validation_status",
    "is_valid",
    "valid_citation_ids",
    "invalid_citation_ids",
    "parsed_citation_ids",
)

_REASON_CODE_BY_STATUS = {
    CITATION_STATUS_VALID: "CITATION_VALID",
    CITATION_STATUS_NO_CITATIONS: "CITATION_MISSING",
    CITATION_STATUS_INVALID_CITATIONS: "CITATION_INVALID",
    CITATION_STATUS_MIXED_CITATIONS: "CITATION_MIXED",
}


class CitationPolicy:
    """
    Citation Validation 결과를 기준으로
    RAG 응답 허용 여부를 판정한다.
    """

    @staticmethod
    def _validate_policy(
        policy: str,
    ) -> str:
        if not isinstance(policy, str):
            raise TypeError(
                "policy는 문자열이어야 합니다."
            )
        cleaned_policy = policy.strip().upper()
        if cleaned_policy not in SUPPORTED_CITATION_POLICIES:
            raise ValueError(
                f"지원하지 않는 Citation 정책입니다: "
                f"{cleaned_policy}"
            )
        return cleaned_policy

    @staticmethod
    def _validate_validation_result(
        validation_result: Mapping[str, Any],
    ) -> None:
        if not isinstance(validation_result, Mapping):
            raise TypeError(
                "validation_result는 Mapping이어야 합니다."
            )

        for field_name in _REQUIRED_VALIDATION_FIELDS:
            if field_name not in validation_result:
                raise ValueError(
                    f"Citation 정책 입력 필수값이 없습니다: "
                    f"{field_name}"
                )

        status = validation_result["validation_status"]
        if status not in SUPPORTED_CITATION_STATUSES:
            raise ValueError(
                f"지원하지 않는 Citation 상태입니다: {status}"
            )

        is_valid = validation_result["is_valid"]
        if not isinstance(is_valid, bool):
            raise ValueError(
                "is_valid는 bool이어야 합니다."
            )

        for field_name in (
            "valid_citation_ids",
            "invalid_citation_ids",
            "parsed_citation_ids",
        ):
            value = validation_result[field_name]
            if isinstance(value, (str, bytes)) or not isinstance(
                value,
                Sequence,
            ):
                raise TypeError(
                    f"{field_name}는 Sequence여야 합니다."
                )

        valid_citation_ids = validation_result[
            "valid_citation_ids"
        ]
        invalid_citation_ids = validation_result[
            "invalid_citation_ids"
        ]

        if status == CITATION_STATUS_VALID:
            if is_valid is not True:
                raise RuntimeError(
                    "VALID 상태와 is_valid가 일치하지 않습니다."
                )
            if len(valid_citation_ids) < 1:
                raise RuntimeError(
                    "VALID 상태에는 유효 Citation이 "
                    "1개 이상 필요합니다."
                )
            if len(invalid_citation_ids) != 0:
                raise RuntimeError(
                    "VALID 상태에는 잘못된 Citation이 "
                    "없어야 합니다."
                )
        elif is_valid is not False:
            raise RuntimeError(
                "VALID가 아닌 상태에서는 is_valid가 "
                "False여야 합니다."
            )

    @classmethod
    def evaluate(
        cls,
        validation_result: Mapping[str, Any],
        *,
        policy: str = CITATION_POLICY_REPORT,
    ) -> dict[str, Any]:
        cleaned_policy = cls._validate_policy(policy)
        cls._validate_validation_result(validation_result)

        status = validation_result["validation_status"]
        is_valid = validation_result["is_valid"]
        valid_citation_ids = list(
            validation_result["valid_citation_ids"]
        )
        invalid_citation_ids = list(
            validation_result["invalid_citation_ids"]
        )

        citation_stable = (
            status == CITATION_STATUS_VALID
            and is_valid is True
            and len(valid_citation_ids) > 0
            and len(invalid_citation_ids) == 0
        )

        if cleaned_policy == CITATION_POLICY_REPORT:
            allowed = True
        else:
            allowed = citation_stable

        return {
            "policy": cleaned_policy,
            "validation_status": status,
            "citation_stable": citation_stable,
            "allowed": allowed,
            "reason_code": _REASON_CODE_BY_STATUS[status],
            "valid_citation_count": len(
                valid_citation_ids
            ),
            "invalid_citation_count": len(
                invalid_citation_ids
            ),
        }

    @classmethod
    def enforce(
        cls,
        validation_result: Mapping[str, Any],
        *,
        policy: str = CITATION_POLICY_REPORT,
    ) -> dict[str, Any]:
        evaluation = cls.evaluate(
            validation_result,
            policy=policy,
        )
        if evaluation["allowed"] is False:
            raise RuntimeError(
                "Citation 안정성 기준을 충족하지 못했습니다. "
                f"status={evaluation['validation_status']}, "
                f"reason={evaluation['reason_code']}"
            )
        return evaluation
