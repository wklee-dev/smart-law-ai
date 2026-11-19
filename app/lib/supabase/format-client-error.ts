/**
 * Supabase JS / fetch 연계 오류를 로그·API 응답용 문자열로 정리합니다.
 * (DNS 실패 등은 환경 변수·프로젝트 상태 점검 안내로 치환)
 */
function flattenErrorMessages(error: unknown, depth = 0): string {
  if (depth > 8) return "";
  if (error == null) return "";

  if (error instanceof Error) {
    const any = error as Error & { cause?: unknown; details?: string };
    const details = typeof any.details === "string" ? any.details : "";
    const parts = [error.message, details].filter(Boolean);
    const fromCause = flattenErrorMessages(any.cause, depth + 1);
    if (fromCause) parts.push(fromCause);
    return parts.join(" | ");
  }

  if (typeof error === "object") {
    const o = error as Record<string, unknown>;
    const msg = typeof o.message === "string" ? o.message : "";
    const details = typeof o.details === "string" ? o.details : "";
    const hint = typeof o.hint === "string" ? o.hint : "";
    const code = typeof o.code === "string" ? o.code : "";
    return [code, msg, details, hint].filter(Boolean).join(" | ");
  }

  return String(error);
}

function humanizeNetworkMessage(flat: string): string | null {
  const lower = flat.toLowerCase();
  if (lower.includes("enotfound") || lower.includes("getaddrinfo")) {
    const local = lower.includes("127.0.0.1") || lower.includes("localhost");
    if (local) {
      return (
        "로컬 Supabase API에 연결할 수 없습니다. " +
        "Docker Desktop과 `npm run supabase:start` 실행 여부를 확인하고, " +
        "NEXT_PUBLIC_SUPABASE_URL·SUPABASE_URL이 supabase/config.toml [api].port와 동일한지 확인하세요. " +
        "(Postgres 직접 접속은 SUPABASE_DB_DIRECT_URL·[db].port를 사용합니다.)"
      );
    }
    return (
      "Supabase 서버 주소를 DNS에서 찾을 수 없습니다. " +
      ".env.local의 NEXT_PUBLIC_SUPABASE_URL(또는 SUPABASE_URL)을 프로젝트 API URL과 동일하게 맞추고, " +
      "클라우드 프로젝트가 일시중지(Paused) 상태가 아닌지 확인한 뒤 개발 서버를 재시작하세요."
    );
  }
  if (lower.includes("econnrefused")) {
    return "Supabase에 연결이 거부되었습니다. 로컬이면 `supabase:start`와 .env의 API URL·config.toml [api].port를 확인하세요.";
  }
  if (
    lower.includes("certificate") ||
    lower.includes("ssl") ||
    lower.includes("tls")
  ) {
    return "HTTPS(인증서) 문제로 Supabase에 연결하지 못했습니다. 프록시·보안 소프트웨어를 확인하세요.";
  }
  if (lower.includes("etimedout") || lower.includes("timeout")) {
    return "Supabase 연결이 시간 초과되었습니다. 네트워크 상태를 확인하세요.";
  }
  if (lower.includes("permission denied for schema public")) {
    return (
      "DB에 anon/authenticated/service_role 용 테이블 권한이 없습니다(pg_restore 후 흔함). " +
      "Postgres에 접속해 `supabase/migrations/20260506131000_api_role_grants.sql` 내용을 실행하거나 " +
      "`npx supabase migration up`으로 최신 마이그레이션을 적용하세요."
    );
  }
  return null;
}

export function formatSupabaseClientError(error: unknown): string {
  const flat = flattenErrorMessages(error);
  const human = humanizeNetworkMessage(flat);
  if (human) return human;
  return flat || "알 수 없는 오류가 발생했습니다.";
}
