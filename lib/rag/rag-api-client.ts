import "server-only";

import { randomUUID } from "node:crypto";

import {
  buildRAGAPIURL,
  getRAGAPITimeoutMS,
  RAG_CHAT_UPSTREAM_PATH,
  RAG_HEALTH_UPSTREAM_PATH,
} from "./rag-api-config";

import type {
  APIErrorDetail,
  APIErrorResponse,
  RAGChatRequest,
  RAGChatResponse,
  RAGHealthResponse,
  RAGProxyResult,
} from "@/types/rag-api";

const REQUEST_ID_HEADER = "x-request-id";

const CITATION_STATUSES = new Set([
  "VALID",
  "NO_CITATIONS",
  "INVALID_CITATIONS",
  "MIXED_CITATIONS",
]);

export class RAGAPITimeoutError extends Error {
  constructor() {
    super("Python RAG API 요청 시간이 초과되었습니다.");
    this.name = "RAGAPITimeoutError";
  }
}

export class RAGAPIConnectionError extends Error {
  constructor() {
    super("Python RAG API에 연결할 수 없습니다.");
    this.name = "RAGAPIConnectionError";
  }
}

function createFallbackRequestId(): string {
  return randomUUID();
}

function getResponseRequestId(
  response: Response,
  fallback: string,
): string {
  const value = response.headers.get(REQUEST_ID_HEADER)?.trim();
  return value || fallback;
}

async function parseJSONSafely(
  response: Response,
): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isAPIErrorDetail(
  value: unknown,
): value is APIErrorDetail {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.request_id === "string"
  );
}

function isAPIErrorResponse(
  value: unknown,
): value is APIErrorResponse {
  if (!isRecord(value)) {
    return false;
  }
  return isAPIErrorDetail(value.error);
}

function isRAGHealthResponse(
  value: unknown,
): value is RAGHealthResponse {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.status === "string" &&
    typeof value.service === "string" &&
    typeof value.version === "string"
  );
}

function isRAGChatResponse(
  value: unknown,
): value is RAGChatResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.result_version !== "string" ||
    typeof value.request_id !== "string" ||
    typeof value.query !== "string" ||
    typeof value.answer_text !== "string" ||
    !isRecord(value.citation_validation) ||
    !Array.isArray(value.cited_sources) ||
    !Array.isArray(value.unused_sources)
  ) {
    return false;
  }

  const status = value.citation_validation.status;
  if (typeof status !== "string" || !CITATION_STATUSES.has(status)) {
    return false;
  }

  return true;
}

async function fetchRAGAPI(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = getRAGAPITimeoutMS();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const url = buildRAGAPIURL(path);
    const headers = new Headers(init.headers);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    try {
      return await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new RAGAPITimeoutError();
      }
      throw new RAGAPIConnectionError();
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function requestRAGChat(
  requestData: RAGChatRequest,
): Promise<RAGProxyResult> {
  const fallbackRequestId = createFallbackRequestId();

  const response = await fetchRAGAPI(RAG_CHAT_UPSTREAM_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(requestData),
  });

  const requestId = getResponseRequestId(
    response,
    fallbackRequestId,
  );
  const payload = await parseJSONSafely(response);

  if (response.ok) {
    if (isRAGChatResponse(payload)) {
      return {
        ok: true,
        status: response.status,
        data: payload,
        requestId,
      };
    }

    return {
      ok: false,
      status: 502,
      error: {
        code: "INVALID_RAG_API_RESPONSE",
        message:
          "Python RAG API 응답 형식이 올바르지 않습니다.",
        request_id: requestId,
      },
      requestId,
    };
  }

  if (isAPIErrorResponse(payload)) {
    return {
      ok: false,
      status: response.status,
      error: payload.error,
      requestId,
    };
  }

  return {
    ok: false,
    status: response.status >= 400 ? response.status : 502,
    error: {
      code: "RAG_API_ERROR",
      message: "Python RAG API 요청 처리에 실패했습니다.",
      request_id: requestId,
    },
    requestId,
  };
}

export async function requestRAGHealth(): Promise<{
  ok: boolean;
  status: number;
  data: RAGHealthResponse | null;
  requestId: string;
}> {
  const fallbackRequestId = createFallbackRequestId();

  const response = await fetchRAGAPI(RAG_HEALTH_UPSTREAM_PATH, {
    method: "GET",
  });

  const requestId = getResponseRequestId(
    response,
    fallbackRequestId,
  );
  const payload = await parseJSONSafely(response);

  if (response.ok && isRAGHealthResponse(payload)) {
    return {
      ok: true,
      status: response.status,
      data: payload,
      requestId,
    };
  }

  return {
    ok: false,
    status: response.status,
    data: null,
    requestId,
  };
}
