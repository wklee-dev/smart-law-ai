import "server-only";

const DEFAULT_RAG_API_TIMEOUT_MS = 120_000;
const MIN_RAG_API_TIMEOUT_MS = 5_000;
const MAX_RAG_API_TIMEOUT_MS = 300_000;

export const RAG_CHAT_UPSTREAM_PATH = "/api/v1/rag/chat";

export const RAG_HEALTH_UPSTREAM_PATH = "/health";

export function getRAGAPIBaseURL(): string {
  const raw = process.env.RAG_API_BASE_URL;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("RAG_API_BASE_URL이 설정되지 않았습니다.");
  }

  const cleaned = raw.trim().replace(/\/+$/, "");

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new Error("RAG_API_BASE_URL이 올바르지 않습니다.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("RAG_API_BASE_URL이 올바르지 않습니다.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("RAG_API_BASE_URL이 올바르지 않습니다.");
  }

  const pathname = parsed.pathname === "" ? "/" : parsed.pathname;
  if (pathname !== "/") {
    throw new Error("RAG_API_BASE_URL이 올바르지 않습니다.");
  }

  return cleaned;
}

export function getRAGAPITimeoutMS(): number {
  const raw = process.env.RAG_API_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_RAG_API_TIMEOUT_MS;
  }

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error("RAG_API_TIMEOUT_MS 설정이 올바르지 않습니다.");
  }

  const value = Number.parseInt(trimmed, 10);
  if (
    !Number.isFinite(value) ||
    value < MIN_RAG_API_TIMEOUT_MS ||
    value > MAX_RAG_API_TIMEOUT_MS
  ) {
    throw new Error("RAG_API_TIMEOUT_MS 설정이 올바르지 않습니다.");
  }

  return value;
}

export function buildRAGAPIURL(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error("RAG API path가 올바르지 않습니다.");
  }

  const baseURL = getRAGAPIBaseURL();
  return new URL(path, `${baseURL}/`).toString();
}
