# api_endpoint_test.py
#
# 역할: FastAPI RAG Endpoint 계약·오류 처리·Fake 연동을 검증한다.

from __future__ import annotations

import os
from typing import Any

from fastapi.testclient import TestClient

from vector.api.app import (
    API_VERSION,
    HEALTH_PATH,
    RAG_CHAT_PATH,
    SERVICE_NAME,
    create_app,
)

REAL_API_INTEGRATION_ENV = (
    "SMARTLAW_RUN_REAL_API_INTEGRATION_TEST"
)
REAL_API_INTEGRATION_VALUE = "YES"

ALLOWED_CITATION_STATUSES = frozenset(
    {
        "VALID",
        "NO_CITATIONS",
        "INVALID_CITATIONS",
        "MIXED_CITATIONS",
    }
)

FORBIDDEN_RESPONSE_KEYS = (
    "system_prompt",
    "user_prompt",
    "combined_prompt",
    "context_text",
    "embedding",
    "body",
    "chunk_text",
    "api_key",
)


def _sample_final_result(
    *,
    query: str = "용도 외 사용 승인은 어떻게 하나요?",
) -> dict[str, Any]:
    answer_text = (
        "승인신청이 필요합니다. [S1] "
        "추가 절차도 확인해야 합니다."
    )
    return {
        "result_version": "1.0",
        "query": query,
        "answer_text": answer_text,
        "answer_chars": len(answer_text),
        "provider": "gemini",
        "model": "fake-model",
        "finish_reason": "STOP",
        "prompt_token_count": 100,
        "candidate_token_count": 50,
        "total_token_count": 150,
        "context_count": 2,
        "available_source_ids": ["S1", "S2"],
        "citation_validation": {
            "status": "VALID",
            "is_valid": True,
            "parsed_citation_ids": ["S1"],
            "valid_citation_ids": ["S1"],
            "invalid_citation_ids": [],
            "unused_source_ids": ["S2"],
            "citation_occurrence_count": 1,
            "unique_citation_count": 1,
            "has_malformed_citation_candidates": False,
            "malformed_citation_candidates": [],
            "messages": [
                "답변의 출처번호가 모두 유효합니다."
            ],
        },
        "cited_sources": [
            {
                "citation_id": "S1",
                "id": 10,
                "source_table": "admin_rule",
                "source_pk": 10,
                "document_category": "ADMIN_RULE",
                "document_type": "고시",
                "law_name": "사후관리에 관한 고시",
                "chunk_type": "ARTICLE",
                "article_no": "제11조",
                "title": "용도 외 사용 승인",
                "header": "용도 외 사용 승인",
                "ranking_rank": 1,
                "ranking_score": 0.95,
                "text_truncated": False,
                "cited": True,
                "citation_count": 1,
                "first_occurrence_order": 1,
            },
        ],
        "unused_sources": [
            {
                "citation_id": "S2",
                "id": 20,
                "source_table": "admin_rule",
                "source_pk": 20,
                "document_category": "ADMIN_RULE",
                "document_type": "고시",
                "law_name": "사후관리에 관한 고시",
                "chunk_type": "ARTICLE",
                "article_no": "제29조",
                "title": "위탁사후관리물품 승인신청",
                "header": "위탁사후관리물품 승인신청",
                "ranking_rank": 2,
                "ranking_score": 0.90,
                "text_truncated": False,
                "cited": False,
                "citation_count": 0,
                "first_occurrence_order": None,
            },
        ],
        "cited_source_count": 1,
        "unused_source_count": 1,
    }


class FakeRAGChatService:
    def __init__(self) -> None:
        self.call_count = 0
        self.last_args: tuple[Any, ...] | None = None
        self.last_kwargs: dict[str, Any] | None = None
        self._error: BaseException | None = None
        self._result: Any = _sample_final_result()

    def set_result(self, result: Any) -> None:
        self._result = result
        self._error = None

    def set_error(self, error: BaseException) -> None:
        self._error = error

    def chat(self, query: str, **kwargs: Any) -> Any:
        self.call_count += 1
        self.last_args = (query,)
        self.last_kwargs = dict(kwargs)
        if self._error is not None:
            raise self._error
        if isinstance(self._result, dict):
            payload = dict(self._result)
            payload["query"] = query
            if "answer_text" in payload and isinstance(
                payload["answer_text"],
                str,
            ):
                payload["answer_chars"] = len(
                    payload["answer_text"]
                )
            return payload
        return self._result


def _assert_error_envelope(
    payload: dict[str, Any],
    *,
    code: str,
) -> None:
    assert "error" in payload
    error = payload["error"]
    assert error["code"] == code
    assert isinstance(error["message"], str)
    assert error["message"].strip() != ""
    assert isinstance(error["request_id"], str)
    assert error["request_id"].strip() != ""
    text = str(payload)
    for forbidden in (
        "system_prompt",
        "Traceback",
        "GEMINI_API_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
    ):
        assert forbidden not in text


def _assert_no_forbidden_keys(payload: dict[str, Any]) -> None:
    for key in FORBIDDEN_RESPONSE_KEYS:
        assert key not in payload


def test_health(fake_service: FakeRAGChatService) -> None:
    app = create_app(service_factory=lambda: fake_service)
    with TestClient(app) as client:
        response = client.get(HEALTH_PATH)

    assert response.status_code == 200
    assert response.headers.get("X-Request-ID")
    assert response.headers.get("X-RAG-Version")
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == SERVICE_NAME
    assert body["version"] == API_VERSION
    assert "build" in body
    assert "provider" in body
    assert "vector_dimension" in body
    assert fake_service.call_count == 0


def test_successful_chat(
    fake_service: FakeRAGChatService,
) -> None:
    app = create_app(service_factory=lambda: fake_service)
    payload = {
        "query": "용도 외 사용 승인은 어떻게 하나요?",
        "match_count": 7,
        "candidate_multiplier": 4,
        "max_results": 3,
        "temperature": 0.1,
        "max_output_tokens": 1024,
        "document_category": "ADMIN_RULE",
        "source_table": "admin_rule",
    }

    with TestClient(app) as client:
        response = client.post(RAG_CHAT_PATH, json=payload)

    assert response.status_code == 200
    assert "application/json" in response.headers.get(
        "content-type",
        "",
    )
    request_id_header = response.headers.get("X-Request-ID")
    assert request_id_header

    body = response.json()
    assert body["request_id"] == request_id_header
    assert fake_service.call_count == 1
    assert fake_service.last_args == (payload["query"],)
    assert fake_service.last_kwargs == {
        "match_count": 7,
        "candidate_multiplier": 4,
        "max_results": 3,
        "temperature": 0.1,
        "max_output_tokens": 1024,
        "document_category": "ADMIN_RULE",
        "source_table": "admin_rule",
    }
    _assert_no_forbidden_keys(body)
    assert body["result_version"] == "1.0"
    assert body["context_count"] == 2
    assert body["cited_source_count"] == 1
    assert body["unused_source_count"] == 1


def test_default_parameters(
    fake_service: FakeRAGChatService,
) -> None:
    app = create_app(service_factory=lambda: fake_service)
    with TestClient(app) as client:
        response = client.post(
            RAG_CHAT_PATH,
            json={"query": "제29조"},
        )

    assert response.status_code == 200
    assert fake_service.call_count == 1
    assert fake_service.last_args == ("제29조",)
    assert fake_service.last_kwargs == {
        "match_count": 10,
        "candidate_multiplier": 3,
        "max_results": 5,
        "temperature": 0.2,
        "max_output_tokens": 2048,
        "document_category": "ADMIN_RULE",
        "source_table": "admin_rule",
    }


def test_request_validation_errors(
    fake_service: FakeRAGChatService,
) -> None:
    app = create_app(service_factory=lambda: fake_service)
    query_invalid_payloads: list[Any] = [
        {},
        {"query": ""},
        {"query": "   "},
        {"query": "가" * 2001},
    ]
    other_invalid_payloads: list[Any] = [
        {"query": "제29조", "match_count": 0},
        {"query": "제29조", "match_count": True},
        {"query": "제29조", "candidate_multiplier": 11},
        {"query": "제29조", "max_results": 0},
        {"query": "제29조", "temperature": 2.1},
        {"query": "제29조", "max_output_tokens": 127},
        {"query": "제29조", "unknown_field": "x"},
    ]

    with TestClient(app) as client:
        for payload in query_invalid_payloads:
            response = client.post(
                RAG_CHAT_PATH,
                json=payload,
            )
            assert response.status_code == 422
            body = response.json()
            _assert_error_envelope(
                body,
                code="VALIDATION_ERROR",
            )
            assert body["error"]["message"] == (
                "질문을 다시 입력해주세요."
            )
            raw = response.text
            query_value = payload.get("query")
            if (
                isinstance(query_value, str)
                and len(query_value) > 50
            ):
                assert query_value not in raw

        for payload in other_invalid_payloads:
            response = client.post(
                RAG_CHAT_PATH,
                json=payload,
            )
            assert response.status_code == 422
            body = response.json()
            _assert_error_envelope(
                body,
                code="VALIDATION_ERROR",
            )
            assert body["error"]["message"] == (
                "요청값이 올바르지 않습니다."
            )

    assert fake_service.call_count == 0


def test_service_value_error(
    fake_service: FakeRAGChatService,
) -> None:
    fake_service.set_error(ValueError("bad query"))
    app = create_app(service_factory=lambda: fake_service)

    with TestClient(app) as client:
        response = client.post(
            RAG_CHAT_PATH,
            json={"query": "제29조"},
        )

    assert response.status_code == 422
    body = response.json()
    _assert_error_envelope(body, code="INVALID_REQUEST")
    assert "bad query" not in response.text


def test_service_runtime_error(
    fake_service: FakeRAGChatService,
) -> None:
    fake_service.set_error(
        RuntimeError("supabase connection failed")
    )
    app = create_app(service_factory=lambda: fake_service)

    with TestClient(app) as client:
        response = client.post(
            RAG_CHAT_PATH,
            json={"query": "제29조"},
        )

    assert response.status_code == 503
    body = response.json()
    _assert_error_envelope(
        body,
        code="RAG_SERVICE_UNAVAILABLE",
    )
    assert "supabase connection failed" not in response.text


def test_service_unexpected_error(
    fake_service: FakeRAGChatService,
) -> None:
    fake_service.set_error(Exception("boom"))
    app = create_app(service_factory=lambda: fake_service)

    with TestClient(app) as client:
        response = client.post(
            RAG_CHAT_PATH,
            json={"query": "제29조"},
        )

    assert response.status_code == 500
    body = response.json()
    _assert_error_envelope(
        body,
        code="INTERNAL_SERVER_ERROR",
    )
    assert "boom" not in response.text
    assert "Traceback" not in response.text


def test_invalid_service_result(
    fake_service: FakeRAGChatService,
) -> None:
    for bad_result in ([], None):
        fake_service = FakeRAGChatService()
        fake_service.set_result(bad_result)
        app = create_app(
            service_factory=lambda service=fake_service: service
        )
        with TestClient(app) as client:
            response = client.post(
                RAG_CHAT_PATH,
                json={"query": "제29조"},
            )
        assert response.status_code == 500
        body = response.json()
        _assert_error_envelope(
            body,
            code="INVALID_SERVICE_RESULT",
        )
        assert "Traceback" not in response.text


def test_response_validation_error(
    fake_service: FakeRAGChatService,
) -> None:
    fake_service.set_result(
        {
            "result_version": "1.0",
            "query": "제29조",
        }
    )
    app = create_app(service_factory=lambda: fake_service)

    with TestClient(app) as client:
        response = client.post(
            RAG_CHAT_PATH,
            json={"query": "제29조"},
        )

    assert response.status_code == 500
    body = response.json()
    _assert_error_envelope(
        body,
        code="INTERNAL_SERVER_ERROR",
    )
    assert "Traceback" not in response.text
    assert "ValidationError" not in response.text


def test_chat_called_once(
    fake_service: FakeRAGChatService,
) -> None:
    app = create_app(service_factory=lambda: fake_service)
    with TestClient(app) as client:
        response = client.post(
            RAG_CHAT_PATH,
            json={"query": "제29조"},
        )
    assert response.status_code == 200
    assert fake_service.call_count == 1


def run_unit_tests() -> None:
    fake_service = FakeRAGChatService()
    test_health(fake_service)

    fake_service = FakeRAGChatService()
    test_successful_chat(fake_service)

    fake_service = FakeRAGChatService()
    test_default_parameters(fake_service)

    fake_service = FakeRAGChatService()
    test_request_validation_errors(fake_service)

    fake_service = FakeRAGChatService()
    test_service_value_error(fake_service)

    fake_service = FakeRAGChatService()
    test_service_runtime_error(fake_service)

    fake_service = FakeRAGChatService()
    test_service_unexpected_error(fake_service)

    test_invalid_service_result(FakeRAGChatService())

    fake_service = FakeRAGChatService()
    test_response_validation_error(fake_service)

    fake_service = FakeRAGChatService()
    test_chat_called_once(fake_service)

    print(
        "OK: STEP 10-1 Python RAG API 단위 테스트 완료"
    )


def run_real_integration_test() -> None:
    from vector.api.service_factory import (
        create_rag_chat_service,
    )

    app = create_app(
        service_factory=create_rag_chat_service
    )
    query = (
        "사후관리 대상 물품의 용도 외 사용 승인은 "
        "어떻게 하나요?"
    )

    with TestClient(app) as client:
        response = client.post(
            RAG_CHAT_PATH,
            json={"query": query},
        )

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body.get("answer_text"), str)
    assert body["answer_text"].strip() != ""
    assert body.get("result_version")
    assert (
        body["citation_validation"]["status"]
        in ALLOWED_CITATION_STATUSES
    )
    assert (
        body["cited_source_count"]
        + body["unused_source_count"]
        == body["context_count"]
    )
    _assert_no_forbidden_keys(body)

    print("status_code:", response.status_code)
    print("result_version:", body["result_version"])
    print(
        "validation_status:",
        body["citation_validation"]["status"],
    )
    print("context_count:", body["context_count"])
    print(
        "cited_source_count:",
        body["cited_source_count"],
    )
    print(
        "unused_source_count:",
        body["unused_source_count"],
    )
    print("answer_chars:", body["answer_chars"])
    print(
        "answer_text preview:",
        body["answer_text"][:500],
    )


if __name__ == "__main__":
    run_unit_tests()

    if (
        os.getenv(REAL_API_INTEGRATION_ENV)
        == REAL_API_INTEGRATION_VALUE
    ):
        run_real_integration_test()
    else:
        print(
            "실제 API 통합 테스트를 실행하려면 "
            f"{REAL_API_INTEGRATION_ENV}="
            f"{REAL_API_INTEGRATION_VALUE}를 설정하세요."
        )

    print(
        "OK: STEP 10-1 Python RAG API Endpoint 연동 완료"
    )
