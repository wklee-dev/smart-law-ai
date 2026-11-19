# app.py
#
# 역할: RAGChatService를 FastAPI HTTP Endpoint로 노출한다.

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from concurrent.futures import (
    ThreadPoolExecutor,
    TimeoutError as FuturesTimeoutError,
)
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Request,
)
from fastapi.exceptions import (
    RequestValidationError,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from vector.api.ops_settings import get_ops_settings
from vector.api.prompt_injection_guard import (
    scan_prompt_injection,
)
from vector.api.query_validator import (
    QUERY_VALIDATION_ERROR_MESSAGE,
    validate_query,
)
from vector.api.schemas import (
    ErrorResponse,
    HealthResponse,
    RAGChatRequest,
    RAGChatResponse,
)
from vector.api.secure_logging import (
    configure_secure_logging,
    get_ops_logger,
    log_performance,
    log_request,
)
from vector.api.service_factory import (
    create_rag_chat_service,
)
from vector.rag.rag_chat_service import (
    RAGChatService,
)

API_TITLE = "Smart Law AI RAG API"
API_DESCRIPTION = (
    "관세·무역 법률정보 검색 및 "
    "출처 기반 답변 API"
)
API_VERSION = "1.0.0"

SERVICE_NAME = "smart-law-ai-rag-api"

RAG_CHAT_PATH = "/api/v1/rag/chat"
HEALTH_PATH = "/health"

RAG_VERSION_HEADER = "X-RAG-Version"
REQUEST_ID_HEADER = "X-Request-ID"

logger = logging.getLogger(__name__)


def create_app(
    *,
    service_factory: Callable[
        [],
        RAGChatService,
    ] = create_rag_chat_service,
) -> FastAPI:
    """
    RAG API FastAPI 앱을 생성한다.
    """
    settings = get_ops_settings()
    configure_secure_logging()
    ops_logger = get_ops_logger()

    @asynccontextmanager
    async def lifespan(
        app: FastAPI,
    ) -> AsyncIterator[None]:
        app.state.rag_chat_service = service_factory()
        app.state.ops_settings = get_ops_settings()
        yield
        app.state.rag_chat_service = None

    app = FastAPI(
        title=API_TITLE,
        description=API_DESCRIPTION,
        version=API_VERSION,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allow_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[
            REQUEST_ID_HEADER,
            RAG_VERSION_HEADER,
        ],
    )

    @app.middleware("http")
    async def security_ops_middleware(
        request: Request,
        call_next: Callable,
    ):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        current = get_ops_settings()

        if current.enable_request_log:
            log_request(
                request_id=request_id,
                path=str(request.url.path),
                method=request.method,
            )

        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        response.headers[RAG_VERSION_HEADER] = (
            current.rag_version or API_VERSION
        )
        return response

    def get_rag_chat_service(
        request: Request,
    ) -> RAGChatService:
        service = getattr(
            request.app.state,
            "rag_chat_service",
            None,
        )
        if service is None:
            raise RuntimeError(
                "RAG Chat Service가 초기화되지 않았습니다."
            )
        return service

    def _get_request_id(
        request: Request,
    ) -> str:
        value = getattr(
            request.state,
            "request_id",
            None,
        )
        if isinstance(value, str) and value:
            return value
        return str(uuid.uuid4())

    def _error_response(
        request: Request,
        *,
        status_code: int,
        code: str,
        message: str,
    ) -> JSONResponse:
        request_id = _get_request_id(request)
        content = {
            "error": {
                "code": code,
                "message": message,
                "request_id": request_id,
            }
        }
        current = get_ops_settings()
        return JSONResponse(
            status_code=status_code,
            content=content,
            headers={
                REQUEST_ID_HEADER: request_id,
                RAG_VERSION_HEADER: (
                    current.rag_version or API_VERSION
                ),
            },
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        message = "요청값이 올바르지 않습니다."
        for err in exc.errors():
            loc = err.get("loc") or ()
            if "query" in loc:
                message = QUERY_VALIDATION_ERROR_MESSAGE
                break
            err_msg = str(err.get("msg") or "")
            if QUERY_VALIDATION_ERROR_MESSAGE in err_msg:
                message = QUERY_VALIDATION_ERROR_MESSAGE
                break

        logger.warning(
            "API request validation failed. request_id=%s",
            _get_request_id(request),
        )
        return _error_response(
            request,
            status_code=422,
            code="VALIDATION_ERROR",
            message=message,
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(
        request: Request,
        exc: HTTPException,
    ) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, dict):
            code = detail.get(
                "code",
                "HTTP_ERROR",
            )
            message = detail.get(
                "message",
                "요청 처리 중 오류가 발생했습니다.",
            )
        else:
            code = "HTTP_ERROR"
            message = "요청 처리 중 오류가 발생했습니다."

        return _error_response(
            request,
            status_code=exc.status_code,
            code=str(code),
            message=str(message),
        )

    @app.get(
        HEALTH_PATH,
        response_model=HealthResponse,
        tags=["system"],
    )
    def health() -> HealthResponse:
        current = get_ops_settings()
        return HealthResponse(
            status="ok",
            service=SERVICE_NAME,
            version=current.rag_version or API_VERSION,
            build=current.rag_build,
            provider=current.provider,
            vector_dimension=current.vector_dimension,
        )

    @app.post(
        RAG_CHAT_PATH,
        response_model=RAGChatResponse,
        responses={
            422: {
                "model": ErrorResponse,
            },
            500: {
                "model": ErrorResponse,
            },
            503: {
                "model": ErrorResponse,
            },
            504: {
                "model": ErrorResponse,
            },
        },
        tags=["rag"],
    )
    def rag_chat(
        request_data: RAGChatRequest,
        request: Request,
        service: RAGChatService = Depends(
            get_rag_chat_service
        ),
    ) -> RAGChatResponse:
        request_id = _get_request_id(request)
        current = get_ops_settings()

        query_check = validate_query(request_data.query)
        if not query_check.ok:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "INVALID_QUERY",
                    "message": QUERY_VALIDATION_ERROR_MESSAGE,
                    "request_id": request_id,
                },
            )

        injection = scan_prompt_injection(
            query_check.cleaned_query
        )
        if injection.warning:
            request.state.prompt_injection_warning = True
            ops_logger.warning(
                "prompt_injection_warning request_id=%s "
                "matched=%s",
                request_id,
                list(injection.matched_patterns),
            )

        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(
                    service.chat,
                    query_check.cleaned_query,
                    match_count=request_data.match_count,
                    candidate_multiplier=(
                        request_data.candidate_multiplier
                    ),
                    max_results=request_data.max_results,
                    temperature=request_data.temperature,
                    max_output_tokens=(
                        request_data.max_output_tokens
                    ),
                    document_category=(
                        request_data.document_category
                    ),
                    source_table=(
                        request_data.source_table
                    ),
                )
                try:
                    final_result = future.result(
                        timeout=(
                            current.request_timeout_seconds
                        ),
                    )
                except FuturesTimeoutError as exc:
                    raise HTTPException(
                        status_code=504,
                        detail={
                            "code": "REQUEST_TIMEOUT",
                            "message": (
                                "요청 처리 시간이 초과되었습니다."
                            ),
                            "request_id": request_id,
                        },
                    ) from exc

            if not isinstance(final_result, dict):
                raise HTTPException(
                    status_code=500,
                    detail={
                        "code": "INVALID_SERVICE_RESULT",
                        "message": (
                            "답변 결과 형식이 올바르지 않습니다."
                        ),
                        "request_id": request_id,
                    },
                )

            response_data = dict(final_result)
            timings = response_data.pop("_ops_timings", None)
            response_data["request_id"] = request_id

            if isinstance(timings, dict):
                log_performance(
                    request_id=request_id,
                    search_time_ms=timings.get(
                        "search_time_ms"
                    ),
                    ranking_time_ms=timings.get(
                        "ranking_time_ms"
                    ),
                    context_time_ms=timings.get(
                        "context_time_ms"
                    ),
                    gemini_time_ms=timings.get(
                        "gemini_time_ms"
                    ),
                    total_time_ms=timings.get(
                        "total_time_ms"
                    ),
                    prompt_token=response_data.get(
                        "prompt_token_count"
                    ),
                    completion_token=response_data.get(
                        "candidate_token_count"
                    ),
                )
            else:
                log_performance(
                    request_id=request_id,
                    search_time_ms=None,
                    ranking_time_ms=None,
                    context_time_ms=None,
                    gemini_time_ms=None,
                    total_time_ms=None,
                    prompt_token=response_data.get(
                        "prompt_token_count"
                    ),
                    completion_token=response_data.get(
                        "candidate_token_count"
                    ),
                )

            return RAGChatResponse.model_validate(
                response_data
            )

        except HTTPException:
            raise

        except ValidationError:
            logger.exception(
                "Unexpected RAG API error. request_id=%s",
                request_id,
            )
            raise HTTPException(
                status_code=500,
                detail={
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": (
                        "서버 내부 오류가 발생했습니다."
                    ),
                    "request_id": request_id,
                },
            )

        except (TypeError, ValueError):
            logger.warning(
                "RAG request rejected. request_id=%s",
                request_id,
            )
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "INVALID_REQUEST",
                    "message": (
                        QUERY_VALIDATION_ERROR_MESSAGE
                    ),
                    "request_id": request_id,
                },
            )

        except RuntimeError:
            logger.exception(
                "RAG service unavailable. request_id=%s",
                request_id,
            )
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "RAG_SERVICE_UNAVAILABLE",
                    "message": (
                        "현재 답변 서비스를 사용할 수 없습니다."
                    ),
                    "request_id": request_id,
                },
            )

        except Exception:
            logger.exception(
                "Unexpected RAG API error. request_id=%s",
                request_id,
            )
            raise HTTPException(
                status_code=500,
                detail={
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": (
                        "서버 내부 오류가 발생했습니다."
                    ),
                    "request_id": request_id,
                },
            )

    return app


app = create_app()
