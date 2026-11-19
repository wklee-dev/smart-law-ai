/**
 * STEP 10-2 Next.js RAG API Proxy 연동 검증 스크립트.
 *
 * 사용:
 *   node scripts/test-rag-next-proxy.mjs
 *
 * 환경변수:
 *   NEXT_RAG_PROXY_BASE_URL (기본: http://127.0.0.1:3000)
 */

const BASE_URL = (
  process.env.NEXT_RAG_PROXY_BASE_URL || "http://127.0.0.1:3000"
).replace(/\/+$/, "");

const ALLOWED_CITATION_STATUSES = new Set([
  "VALID",
  "NO_CITATIONS",
  "INVALID_CITATIONS",
  "MIXED_CITATIONS",
]);

const FORBIDDEN_KEYS = [
  "system_prompt",
  "user_prompt",
  "combined_prompt",
  "context_text",
  "embedding",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJSON(response) {
  const contentType = response.headers.get("content-type") || "";
  assert(
    contentType.toLowerCase().includes("application/json"),
    "응답 Content-Type이 application/json이 아닙니다.",
  );
  return response.json();
}

async function testHealth() {
  const response = await fetch(`${BASE_URL}/api/rag/health`, {
    method: "GET",
    cache: "no-store",
  });

  assert(response.status === 200, `Health status=${response.status}`);
  const requestId = response.headers.get("x-request-id");
  assert(Boolean(requestId), "Health X-Request-ID 없음");

  const body = await readJSON(response);
  assert(body.status === "ok", "Health status != ok");
  assert(typeof body.service === "string", "Health service 없음");
  assert(typeof body.version === "string", "Health version 없음");

  console.log("TEST 1 Health: OK");
}

async function testChat() {
  const payload = {
    query:
      "사후관리 대상 물품의 용도 외 사용 승인은 어떻게 하나요?",
    match_count: 10,
    candidate_multiplier: 3,
    max_results: 5,
    temperature: 0.2,
    max_output_tokens: 2048,
    document_category: "ADMIN_RULE",
    source_table: "admin_rule",
  };

  const response = await fetch(`${BASE_URL}/api/rag/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  assert(response.status === 200, `Chat status=${response.status}`);
  const headerRequestId = response.headers.get("x-request-id");
  assert(Boolean(headerRequestId), "Chat X-Request-ID 없음");

  const body = await readJSON(response);
  assert(
    typeof body.answer_text === "string" &&
      body.answer_text.trim() !== "",
    "answer_text가 비어 있습니다.",
  );
  assert(
    typeof body.request_id === "string" &&
      body.request_id.trim() !== "",
    "request_id 없음",
  );
  assert(
    body.request_id === headerRequestId,
    "request_id와 X-Request-ID가 일치하지 않습니다.",
  );
  assert(
    body.citation_validation &&
      typeof body.citation_validation === "object",
    "citation_validation 없음",
  );
  assert(
    ALLOWED_CITATION_STATUSES.has(body.citation_validation.status),
    "citation status가 표준값이 아닙니다.",
  );
  assert(Array.isArray(body.cited_sources), "cited_sources 배열 아님");
  assert(
    Array.isArray(body.unused_sources),
    "unused_sources 배열 아님",
  );

  for (const key of FORBIDDEN_KEYS) {
    assert(!(key in body), `금지 필드 노출: ${key}`);
  }

  console.log("TEST 2 Chat: OK");
  console.log("validation_status:", body.citation_validation.status);
  console.log("cited_source_count:", body.cited_source_count);
  console.log("unused_source_count:", body.unused_source_count);
  console.log("answer_chars:", body.answer_chars);
  console.log("answer_text preview:", body.answer_text.slice(0, 300));
}

async function testEmptyQuery() {
  const response = await fetch(`${BASE_URL}/api/rag/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: "" }),
    cache: "no-store",
  });

  assert(response.status === 422, `빈 query status=${response.status}`);
  console.log("TEST 3 Empty query: OK");
}

async function testInvalidJSON() {
  const response = await fetch(`${BASE_URL}/api/rag/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: "{not-json",
    cache: "no-store",
  });

  assert(
    response.status === 400,
    `잘못된 JSON status=${response.status}`,
  );
  console.log("TEST 4 Invalid JSON: OK");
}

async function testUnknownField() {
  const response = await fetch(`${BASE_URL}/api/rag/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "제29조",
      unknown_field: "x",
    }),
    cache: "no-store",
  });

  assert(
    response.status === 422,
    `알 수 없는 필드 status=${response.status}`,
  );
  console.log("TEST 5 Unknown field: OK");
}

async function main() {
  await testHealth();
  await testChat();
  await testEmptyQuery();
  await testInvalidJSON();
  await testUnknownField();
  console.log("OK: STEP 10-2 Next.js RAG API Proxy 연동 완료");
}

main().catch((error) => {
  console.error(
    "FAIL:",
    error instanceof Error ? error.message : "unknown",
  );
  process.exitCode = 1;
});
