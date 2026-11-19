/**
 * 브라우저용 RAG Chat 클라이언트.
 * Next.js `/api/rag/chat` 프록시를 호출한다. (Python URL 직접 호출 금지)
 */

import type {
  APIErrorDetail,
  APIErrorResponse,
  RAGChatRequest,
  RAGChatResponse,
  RAGSource,
} from "@/types/rag-api";

export const RAG_CHAT_PROXY_PATH = "/api/rag/chat";

export type RagClientError = {
  kind: "http" | "network" | "invalid_response" | "aborted";
  status: number | null;
  code: string;
  message: string;
  requestId: string | null;
};

export type RagChatClientResult =
  | {
      ok: true;
      status: number;
      data: RAGChatResponse;
      requestId: string;
    }
  | {
      ok: false;
      status: number | null;
      error: RagClientError;
    };

/** UI / Hook에서 쓰는 정규화 메시지 DTO */
export type RagChatMessageDto = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  requestId?: string | null;
  error?: boolean;
  errorCode?: string | null;
  citationValidationStatus?: string | null;
  citedSources?: RAGSource[];
  unusedSources?: RAGSource[];
  provider?: string | null;
  model?: string | null;
};

/** Streaming 구조 준비 (실제 SSE/스트림은 다음 STEP) */
export type RagStreamEvent =
  | { type: "status"; message: string }
  | { type: "token"; text: string }
  | { type: "citation"; sources: RAGSource[] }
  | { type: "done"; data: RAGChatResponse }
  | { type: "error"; error: RagClientError };

export function supportsRagStreaming(): boolean {
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAPIErrorResponse(value: unknown): value is APIErrorResponse {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }
  return (
    typeof value.error.code === "string" &&
    typeof value.error.message === "string"
  );
}

function isRAGChatResponse(value: unknown): value is RAGChatResponse {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.result_version === "string" &&
    typeof value.request_id === "string" &&
    typeof value.query === "string" &&
    typeof value.answer_text === "string" &&
    isRecord(value.citation_validation) &&
    Array.isArray(value.cited_sources) &&
    Array.isArray(value.unused_sources)
  );
}

function createMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createUserMessage(content: string): RagChatMessageDto {
  return {
    id: createMessageId(),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
}

export function createAssistantMessageFromResponse(
  data: RAGChatResponse,
): RagChatMessageDto {
  return {
    id: createMessageId(),
    role: "assistant",
    content: data.answer_text,
    createdAt: new Date().toISOString(),
    requestId: data.request_id,
    citationValidationStatus: data.citation_validation.status,
    citedSources: data.cited_sources,
    unusedSources: data.unused_sources,
    provider: data.provider,
    model: data.model,
  };
}

export function createAssistantErrorMessage(
  error: RagClientError,
): RagChatMessageDto {
  return {
    id: createMessageId(),
    role: "assistant",
    content: error.message,
    createdAt: new Date().toISOString(),
    requestId: error.requestId,
    error: true,
    errorCode: error.code,
  };
}

export function toRagClientError(
  detail: APIErrorDetail,
  status: number | null,
  kind: RagClientError["kind"] = "http",
): RagClientError {
  return {
    kind,
    status,
    code: detail.code,
    message: detail.message,
    requestId: detail.request_id || null,
  };
}

/**
 * Next.js RAG Proxy로 동기 Chat 요청을 1회 전송한다.
 */
export async function requestRagChat(
  requestData: RAGChatRequest,
  options?: {
    signal?: AbortSignal;
  },
): Promise<RagChatClientResult> {
  const query = requestData.query.trim();
  if (!query) {
    return {
      ok: false,
      status: 422,
      error: {
        kind: "http",
        status: 422,
        code: "INVALID_REQUEST",
        message: "질문을 입력해 주세요.",
        requestId: null,
      },
    };
  }

  const payload: RAGChatRequest = {
    ...requestData,
    query,
  };

  let response: Response;
  try {
    response = await fetch(RAG_CHAT_PROXY_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: options?.signal,
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      return {
        ok: false,
        status: null,
        error: {
          kind: "aborted",
          status: null,
          code: "REQUEST_ABORTED",
          message: "요청이 취소되었습니다.",
          requestId: null,
        },
      };
    }
    return {
      ok: false,
      status: null,
      error: {
        kind: "network",
        status: null,
        code: "NETWORK_ERROR",
        message: "네트워크 오류가 발생했습니다.",
        requestId: null,
      },
    };
  }

  const requestIdHeader = response.headers.get("x-request-id");
  let body: unknown = null;
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().includes("application/json")) {
      body = await response.json();
    }
  } catch {
    body = null;
  }

  if (response.ok) {
    if (isRAGChatResponse(body)) {
      return {
        ok: true,
        status: response.status,
        data: body,
        requestId: body.request_id || requestIdHeader || "",
      };
    }
    return {
      ok: false,
      status: 502,
      error: {
        kind: "invalid_response",
        status: 502,
        code: "INVALID_RAG_API_RESPONSE",
        message: "답변 응답 형식이 올바르지 않습니다.",
        requestId: requestIdHeader,
      },
    };
  }

  if (isAPIErrorResponse(body)) {
    return {
      ok: false,
      status: response.status,
      error: toRagClientError(
        {
          code: body.error.code,
          message: body.error.message,
          request_id:
            body.error.request_id || requestIdHeader || "",
        },
        response.status,
      ),
    };
  }

  return {
    ok: false,
    status: response.status,
    error: {
      kind: "http",
      status: response.status,
      code: "RAG_API_ERROR",
      message: "답변 요청 처리에 실패했습니다.",
      requestId: requestIdHeader,
    },
  };
}

/**
 * Streaming 연동용 스텁.
 * 다음 STEP에서 SSE/ReadableStream으로 교체한다.
 */
export async function* streamRagChat(
  _requestData: RAGChatRequest,
  _options?: {
    signal?: AbortSignal;
  },
): AsyncGenerator<RagStreamEvent, void, unknown> {
  yield {
    type: "error",
    error: {
      kind: "http",
      status: null,
      code: "STREAMING_NOT_IMPLEMENTED",
      message:
        "스트리밍 답변은 아직 지원되지 않습니다. 동기 요청을 사용하세요.",
      requestId: null,
    },
  };
}
