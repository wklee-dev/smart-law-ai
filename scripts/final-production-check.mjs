/**
 * STEP 10-5 Next.js 운영 전 최종 검증 스크립트.
 *
 * 사용:
 *   node scripts/final-production-check.mjs
 *
 * 환경변수:
 *   NEXT_PRODUCTION_BASE_URL (기본: http://127.0.0.1:3000)
 *
 * 운영 코드를 수정하지 않으며, 실제 프록시 응답만 검증한다.
 */

const BASE_URL = (
  process.env.NEXT_PRODUCTION_BASE_URL || "http://127.0.0.1:3000"
).replace(/\/+$/, "");

const MAX_HEALTH_MS = 2_000;
const MAX_CHAT_MS = 120_000;
const TARGET_CHAT_MS = 30_000;

const ALLOWED_CITATION_STATUSES = new Set([
  "VALID",
  "NO_CITATIONS",
  "INVALID_CITATIONS",
  "MIXED_CITATIONS",
]);

const FORBIDDEN_KEYS = new Set([
  "system_prompt",
  "user_prompt",
  "combined_prompt",
  "context_text",
  "embedding",
  "api_key",
  "authorization",
  "cookie",
  "password",
  "secret",
]);

const STANDARD_QUERY =
  "사후관리 대상 물품의 용도 외 사용 승인은 어떻게 하나요?";

/**
 * @typedef {{
 *   checkId: string,
 *   name: string,
 *   status: "PASS" | "WARN" | "FAIL",
 *   elapsedMs: number,
 *   message: string,
 * }} CheckRow
 */

/** @type {CheckRow[]} */
const checks = [];

/**
 * @param {boolean} condition
 * @param {string} message
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * @param {unknown} value
 * @param {Set<string>} found
 */
function collectKeys(value, found) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, found);
    }
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      found.add(key);
      collectKeys(item, found);
    }
  }
}

/**
 * @param {Response} response
 */
async function readJSON(response) {
  const contentType = response.headers.get("content-type") || "";
  assert(
    contentType.toLowerCase().includes("application/json"),
    "응답 Content-Type이 application/json이 아닙니다.",
  );
  return response.json();
}

/**
 * @param {string} checkId
 * @param {string} name
 * @param {() => Promise<{ status?: "PASS" | "WARN"; message: string } | void>} fn
 */
async function runCheck(checkId, name, fn) {
  const started = Date.now();
  try {
    const result = await fn();
    const elapsedMs = Date.now() - started;
    const status = result?.status || "PASS";
    const message = result?.message || "OK";
    checks.push({
      checkId,
      name,
      status,
      elapsedMs,
      message,
    });
    console.log(
      `[${status}] ${checkId} ${name} (${(elapsedMs / 1000).toFixed(2)}s)`,
    );
  } catch (error) {
    const elapsedMs = Date.now() - started;
    const message =
      error instanceof Error ? error.message : "unknown error";
    checks.push({
      checkId,
      name,
      status: "FAIL",
      elapsedMs,
      message,
    });
    console.log(
      `[FAIL] ${checkId} ${name} (${(elapsedMs / 1000).toFixed(2)}s)`,
    );
    console.log(`  -> ${message}`);
  }
}

async function checkHealth() {
  const started = Date.now();
  const response = await fetch(`${BASE_URL}/api/rag/health`, {
    method: "GET",
    cache: "no-store",
  });
  const elapsedMs = Date.now() - started;

  assert(response.status === 200, `Health status=${response.status}`);
  const requestId = response.headers.get("x-request-id");
  assert(Boolean(requestId), "Health X-Request-ID 없음");

  const cacheControl = response.headers.get("cache-control") || "";
  assert(
    cacheControl.toLowerCase().includes("no-store"),
    "Cache-Control에 no-store 없음",
  );

  const body = await readJSON(response);
  assert(body.status === "ok", "Health status != ok");
  assert(elapsedMs <= MAX_HEALTH_MS, `Health 응답 ${elapsedMs}ms > 2000ms`);

  return { message: "Health proxy OK" };
}

/**
 * @returns {Promise<{
 *   status?: "PASS" | "WARN",
 *   message: string,
 *   body: any,
 * }>}
 */
async function checkChat() {
  const payload = {
    query: STANDARD_QUERY,
    match_count: 10,
    candidate_multiplier: 3,
    max_results: 5,
    temperature: 0.2,
    max_output_tokens: 2048,
    document_category: "ADMIN_RULE",
    source_table: "admin_rule",
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_CHAT_MS + 5_000);
  const started = Date.now();

  let response;
  try {
    response = await fetch(`${BASE_URL}/api/rag/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const elapsedMs = Date.now() - started;
  assert(response.status === 200, `Chat status=${response.status}`);

  const headerRequestId = response.headers.get("x-request-id");
  assert(Boolean(headerRequestId), "Chat X-Request-ID 없음");

  const body = await readJSON(response);
  assert(
    typeof body.answer_text === "string" && body.answer_text.trim() !== "",
    "answer_text가 비어 있습니다.",
  );
  assert(
    typeof body.request_id === "string" && body.request_id.trim() !== "",
    "request_id 없음",
  );
  assert(
    body.request_id === headerRequestId,
    "request_id와 X-Request-ID 불일치",
  );
  assert(
    body.citation_validation &&
      typeof body.citation_validation === "object",
    "citation_validation 없음",
  );
  assert(
    ALLOWED_CITATION_STATUSES.has(body.citation_validation.status),
    `Citation status 비표준: ${body.citation_validation.status}`,
  );
  assert(Array.isArray(body.cited_sources), "cited_sources 배열 아님");
  assert(Array.isArray(body.unused_sources), "unused_sources 배열 아님");

  const keys = new Set();
  collectKeys(body, keys);
  for (const key of keys) {
    assert(
      !FORBIDDEN_KEYS.has(String(key).toLowerCase()),
      `금지 key 발견: ${key}`,
    );
  }

  assert(elapsedMs <= MAX_CHAT_MS, `Chat 응답 ${elapsedMs}ms > 120000ms`);

  const preview =
    typeof body.answer_text === "string"
      ? body.answer_text.slice(0, 300)
      : "";
  console.log(`  answer_preview: ${preview}`);

  if (elapsedMs > TARGET_CHAT_MS) {
    return {
      status: "WARN",
      message: `Chat OK (느림: ${(elapsedMs / 1000).toFixed(2)}s)`,
      body,
    };
  }

  return {
    status: "PASS",
    message: "Chat OK",
    body,
  };
}

async function checkEmptyQuery() {
  const response = await fetch(`${BASE_URL}/api/rag/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query: "" }),
    cache: "no-store",
  });

  assert(response.status === 422, `빈 query status=${response.status}`);
  const body = await readJSON(response);
  const code = body?.error?.code;
  assert(
    code === "VALIDATION_ERROR" || code === "INVALID_REQUEST",
    `빈 query code=${code}`,
  );
  return { message: "빈 query 422 OK" };
}

async function checkInvalidJSON() {
  const response = await fetch(`${BASE_URL}/api/rag/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: "{not-json",
    cache: "no-store",
  });

  assert(response.status === 400, `잘못된 JSON status=${response.status}`);
  const body = await readJSON(response);
  assert(
    body?.error?.code === "INVALID_JSON",
    `잘못된 JSON code=${body?.error?.code}`,
  );
  return { message: "잘못된 JSON 400 OK" };
}

async function checkExtraField() {
  const response = await fetch(`${BASE_URL}/api/rag/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: "제29조",
      unknown_field: "value",
    }),
    cache: "no-store",
  });

  assert(response.status === 422, `extra field status=${response.status}`);
  return { message: "extra field 422 OK" };
}

/**
 * @param {any} successBody
 */
async function checkResponseSecurity(successBody) {
  assert(
    successBody && typeof successBody === "object",
    "보안 검사용 정상 응답이 없습니다.",
  );
  const keys = new Set();
  collectKeys(successBody, keys);
  const hits = [...keys].filter((key) =>
    FORBIDDEN_KEYS.has(String(key).toLowerCase()),
  );
  assert(hits.length === 0, `금지 key: ${hits.join(",")}`);
  return { message: "응답 보안 key OK" };
}

async function checkRequestIdUniqueness() {
  const response1 = await fetch(`${BASE_URL}/api/rag/health`, {
    method: "GET",
    cache: "no-store",
  });
  const response2 = await fetch(`${BASE_URL}/api/rag/health`, {
    method: "GET",
    cache: "no-store",
  });

  const id1 = response1.headers.get("x-request-id");
  const id2 = response2.headers.get("x-request-id");
  assert(Boolean(id1), "첫 번째 X-Request-ID 없음");
  assert(Boolean(id2), "두 번째 X-Request-ID 없음");
  assert(id1 !== id2, "X-Request-ID가 서로 동일합니다.");
  return { message: "Request ID 고유성 OK" };
}

async function main() {
  console.log(`BASE_URL=${BASE_URL}`);
  /** @type {any} */
  let successBody = null;

  await runCheck("NEXT-001", "Next.js Health Proxy", checkHealth);

  await runCheck("NEXT-002", "정상 Chat", async () => {
    const result = await checkChat();
    successBody = result.body;
    return result;
  });

  await runCheck("NEXT-003", "빈 Query", checkEmptyQuery);
  await runCheck("NEXT-004", "잘못된 JSON", checkInvalidJSON);
  await runCheck("NEXT-005", "Extra Field", checkExtraField);

  await runCheck("NEXT-006", "Response Security", async () =>
    checkResponseSecurity(successBody),
  );

  await runCheck(
    "NEXT-007",
    "Request ID Uniqueness",
    checkRequestIdUniqueness,
  );

  const passCount = checks.filter((item) => item.status === "PASS").length;
  const warnCount = checks.filter((item) => item.status === "WARN").length;
  const failCount = checks.filter((item) => item.status === "FAIL").length;
  const totalMs = checks.reduce((sum, item) => sum + item.elapsedMs, 0);

  console.log("");
  console.log(`PASS: ${passCount}`);
  console.log(`WARN: ${warnCount}`);
  console.log(`FAIL: ${failCount}`);
  console.log(`총 실행시간: ${(totalMs / 1000).toFixed(2)}s`);

  if (failCount > 0) {
    process.exitCode = 1;
    return;
  }

  console.log("OK: STEP 10-5 Next.js 운영 전 최종 검증 완료");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FATAL: ${message}`);
  process.exitCode = 1;
});
