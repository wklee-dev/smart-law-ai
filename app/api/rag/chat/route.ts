import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  getAllowOrigins,
  getRagVersion,
  isRequestLogEnabled,
  maskSensitiveData,
  QUERY_VALIDATION_ERROR_MESSAGE,
  RAG_VERSION_HEADER,
  REQUEST_ID_HEADER,
  scanPromptInjection,
  validateQueryText,
} from "@/lib/rag/ops-config";
import {
  RAGAPIConnectionError,
  RAGAPITimeoutError,
  requestRAGChat,
} from "@/lib/rag/rag-api-client";

import type {
  APIErrorResponse,
  RAGChatRequest,
} from "@/types/rag-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowOrigins = getAllowOrigins();
  const headers: Record<string, string> = {
    [RAG_VERSION_HEADER]: getRagVersion(),
    "Cache-Control": "no-store",
  };

  if (origin && allowOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
  }

  return headers;
}

function errorResponse(
  request: Request,
  status: number,
  code: string,
  message: string,
  requestId: string,
): NextResponse<APIErrorResponse> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        request_id: requestId,
      },
    } satisfies APIErrorResponse,
    {
      status,
      headers: {
        [REQUEST_ID_HEADER]: requestId,
        ...corsHeaders(request),
      },
    },
  );
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function OPTIONS(
  request: Request,
): Promise<NextResponse> {
  const headers = corsHeaders(request);
  headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  headers["Access-Control-Allow-Headers"] =
    "Content-Type, Authorization, X-Request-ID";
  return new NextResponse(null, {
    status: 204,
    headers,
  });
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const fallbackRequestId = randomUUID();

  if (isRequestLogEnabled()) {
    console.info(
      "rag-proxy request",
      maskSensitiveData({
        RequestID: fallbackRequestId,
        path: "/api/rag/chat",
      }),
    );
  }

  let requestData: unknown;
  try {
    requestData = await request.json();
  } catch {
    return errorResponse(
      request,
      400,
      "INVALID_JSON",
      "요청 JSON 형식이 올바르지 않습니다.",
      fallbackRequestId,
    );
  }

  if (!isPlainObject(requestData)) {
    return errorResponse(
      request,
      400,
      "INVALID_REQUEST",
      "요청값이 올바르지 않습니다.",
      fallbackRequestId,
    );
  }

  const queryCheck = validateQueryText(requestData.query);
  if (!queryCheck.ok) {
    return errorResponse(
      request,
      422,
      "INVALID_QUERY",
      QUERY_VALIDATION_ERROR_MESSAGE,
      fallbackRequestId,
    );
  }

  const injection = scanPromptInjection(queryCheck.cleaned);
  if (injection.warning) {
    console.warn(
      "prompt_injection_warning",
      maskSensitiveData({
        RequestID: fallbackRequestId,
        matched: injection.matched,
      }),
    );
  }

  const payload = {
    ...requestData,
    query: queryCheck.cleaned,
  } as RAGChatRequest;

  try {
    const result = await requestRAGChat(payload);

    if (result.ok) {
      return NextResponse.json(result.data, {
        status: result.status,
        headers: {
          [REQUEST_ID_HEADER]: result.requestId,
          ...corsHeaders(request),
        },
      });
    }

    return NextResponse.json(
      {
        error: result.error,
      } satisfies APIErrorResponse,
      {
        status: result.status,
        headers: {
          [REQUEST_ID_HEADER]: result.requestId,
          ...corsHeaders(request),
        },
      },
    );
  } catch (error) {
    if (error instanceof RAGAPITimeoutError) {
      return errorResponse(
        request,
        504,
        "RAG_API_TIMEOUT",
        "답변 생성 시간이 초과되었습니다.",
        fallbackRequestId,
      );
    }

    if (error instanceof RAGAPIConnectionError) {
      return errorResponse(
        request,
        503,
        "RAG_API_UNAVAILABLE",
        "현재 답변 서비스에 연결할 수 없습니다.",
        fallbackRequestId,
      );
    }

    return errorResponse(
      request,
      500,
      "NEXT_RAG_PROXY_ERROR",
      "답변 요청 처리 중 오류가 발생했습니다.",
      fallbackRequestId,
    );
  }
}
