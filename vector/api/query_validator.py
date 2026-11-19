# query_validator.py
#
# 역할: RAG 질문 문자열의 운영 검증을 수행한다.

from __future__ import annotations

from dataclasses import dataclass

from vector.api.ops_settings import get_ops_settings

QUERY_VALIDATION_ERROR_MESSAGE = (
    "질문을 다시 입력해주세요."
)


@dataclass(frozen=True)
class QueryValidationResult:
    ok: bool
    cleaned_query: str
    message: str | None = None


def _is_valid_utf8_text(value: str) -> bool:
    if not isinstance(value, str):
        return False
    try:
        encoded = value.encode("utf-8")
        decoded = encoded.decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return False
    if decoded != value:
        return False
    # unpaired surrogate 등 비정상 코드포인트 거부
    for ch in value:
        code = ord(ch)
        if 0xD800 <= code <= 0xDFFF:
            return False
    return True


def validate_query(
    query: object,
    *,
    max_length: int | None = None,
) -> QueryValidationResult:
    """
    빈 문자열·공백만·최대 길이·UTF-8 정상 여부를 검사한다.
    """
    settings = get_ops_settings()
    limit = (
        settings.max_query_length
        if max_length is None
        else max_length
    )

    if not isinstance(query, str):
        return QueryValidationResult(
            ok=False,
            cleaned_query="",
            message=QUERY_VALIDATION_ERROR_MESSAGE,
        )

    if not _is_valid_utf8_text(query):
        return QueryValidationResult(
            ok=False,
            cleaned_query="",
            message=QUERY_VALIDATION_ERROR_MESSAGE,
        )

    cleaned = query.strip()
    if cleaned == "":
        return QueryValidationResult(
            ok=False,
            cleaned_query="",
            message=QUERY_VALIDATION_ERROR_MESSAGE,
        )

    if len(cleaned) > limit:
        return QueryValidationResult(
            ok=False,
            cleaned_query="",
            message=QUERY_VALIDATION_ERROR_MESSAGE,
        )

    return QueryValidationResult(
        ok=True,
        cleaned_query=cleaned,
        message=None,
    )
