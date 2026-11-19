import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  getAllowOrigins,
  getRagVersion,
  RAG_VERSION_HEADER,
  REQUEST_ID_HEADER,
} from "@/lib/rag/ops-config";
import {
  RAGAPIConnectionError,
  RAGAPITimeoutError,
  requestRAGHealth,
} from "@/lib/rag/rag-api-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders(request?: Request): Record<string, string> {
  const headers: Record<string, string> = {
    [RAG_VERSION_HEADER]: getRagVersion(),
    "Cache-Control": "no-store",
  };

  if (!request) {
    return headers;
  }

  const origin = request.headers.get("origin");
  const allowOrigins = getAllowOrigins();
  if (origin && allowOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
  }

  return headers;
}

function unavailableResponse(
  requestId: string,
  request?: Request,
): NextResponse {
  return NextResponse.json(
    {
      status: "error",
      service: "smart-law-ai-rag-proxy",
      version: getRagVersion(),
      build: process.env.RAG_BUILD ?? "dev",
      provider: process.env.RAG_PROVIDER ?? "gemini",
      vector_dimension: Number.parseInt(
        process.env.EMBEDDING_OUTPUT_DIMENSIONALITY ?? "768",
        10,
      ) || 768,
    },
    {
      status: 503,
      headers: {
        [REQUEST_ID_HEADER]: requestId,
        ...corsHeaders(request),
      },
    },
  );
}

export async function OPTIONS(
  request: Request,
): Promise<NextResponse> {
  const headers = corsHeaders(request);
  headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
  headers["Access-Control-Allow-Headers"] =
    "Content-Type, Authorization, X-Request-ID";
  return new NextResponse(null, {
    status: 204,
    headers,
  });
}

export async function GET(
  request: Request,
): Promise<NextResponse> {
  const fallbackRequestId = randomUUID();

  try {
    const result = await requestRAGHealth();

    if (result.ok && result.data) {
      return NextResponse.json(result.data, {
        status: 200,
        headers: {
          [REQUEST_ID_HEADER]: result.requestId,
          ...corsHeaders(request),
        },
      });
    }

    return unavailableResponse(
      result.requestId || fallbackRequestId,
      request,
    );
  } catch (error) {
    if (
      error instanceof RAGAPIConnectionError ||
      error instanceof RAGAPITimeoutError
    ) {
      return unavailableResponse(fallbackRequestId, request);
    }

    return unavailableResponse(fallbackRequestId, request);
  }
}
