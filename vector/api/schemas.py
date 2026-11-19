# schemas.py
#
# 역할: RAG API 요청·응답·오류의 Pydantic 계약을 정의한다.

from __future__ import annotations

from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


class StrictRequestModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )


class APIResponseModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )


class RAGChatRequest(StrictRequestModel):
    query: str = Field(
        min_length=1,
        max_length=2000,
    )

    match_count: int = Field(
        default=10,
        ge=1,
        le=100,
    )

    candidate_multiplier: int = Field(
        default=3,
        ge=1,
        le=10,
    )

    max_results: int = Field(
        default=5,
        ge=1,
        le=50,
    )

    temperature: float = Field(
        default=0.2,
        ge=0.0,
        le=2.0,
    )

    max_output_tokens: int = Field(
        default=2048,
        ge=128,
        le=8192,
    )

    document_category: str = Field(
        default="ADMIN_RULE",
        min_length=1,
        max_length=100,
    )

    source_table: str = Field(
        default="admin_rule",
        min_length=1,
        max_length=100,
    )

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        from vector.api.query_validator import (
            QUERY_VALIDATION_ERROR_MESSAGE,
            validate_query,
        )

        result = validate_query(value)
        if not result.ok:
            raise ValueError(
                QUERY_VALIDATION_ERROR_MESSAGE
            )
        return result.cleaned_query

    @field_validator("document_category", "source_table")
    @classmethod
    def validate_non_blank_str(cls, value: str) -> str:
        cleaned = value.strip()
        if cleaned == "":
            raise ValueError("공백만 있는 문자열은 허용되지 않습니다.")
        return cleaned

    @field_validator(
        "match_count",
        "candidate_multiplier",
        "max_results",
        "max_output_tokens",
        mode="before",
    )
    @classmethod
    def reject_bool_for_int_fields(
        cls,
        value: Any,
        info: Any,
    ) -> Any:
        if isinstance(value, bool):
            field_name = info.field_name
            raise ValueError(
                f"{field_name}에 bool을 사용할 수 없습니다."
            )
        return value

    @field_validator("temperature", mode="before")
    @classmethod
    def reject_bool_for_temperature(
        cls,
        value: Any,
    ) -> Any:
        if isinstance(value, bool):
            raise ValueError(
                "temperature에 bool을 사용할 수 없습니다."
            )
        return value


class HealthResponse(APIResponseModel):
    status: str
    service: str
    version: str
    build: str | None = None
    provider: str | None = None
    vector_dimension: int | None = None


class CitationValidationResponse(APIResponseModel):
    status: str
    is_valid: bool
    parsed_citation_ids: list[str]
    valid_citation_ids: list[str]
    invalid_citation_ids: list[str]
    unused_source_ids: list[str]
    citation_occurrence_count: int
    unique_citation_count: int
    has_malformed_citation_candidates: bool
    malformed_citation_candidates: list[str]
    messages: list[str]


class SourceResponse(APIResponseModel):
    citation_id: str
    id: int
    source_table: str
    source_pk: int
    document_category: str
    document_type: str | None = None
    law_name: str
    chunk_type: str
    article_no: str | None = None
    title: str | None = None
    header: str | None = None
    ranking_rank: int | None = None
    ranking_score: float
    text_truncated: bool
    cited: bool
    citation_count: int
    first_occurrence_order: int | None = None


class RAGChatResponse(APIResponseModel):
    result_version: str
    request_id: str

    query: str
    answer_text: str
    answer_chars: int

    provider: str
    model: str
    finish_reason: str | None = None

    prompt_token_count: int | None = None
    candidate_token_count: int | None = None
    total_token_count: int | None = None

    context_count: int
    available_source_ids: list[str]

    citation_validation: CitationValidationResponse

    cited_sources: list[SourceResponse]
    unused_sources: list[SourceResponse]

    cited_source_count: int
    unused_source_count: int


class ErrorDetail(APIResponseModel):
    code: str
    message: str
    request_id: str


class ErrorResponse(APIResponseModel):
    error: ErrorDetail
