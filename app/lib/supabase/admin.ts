import { createClient } from "@supabase/supabase-js";

/**
 * Supabase API(Kong) 기준 URL. 로컬 포트는 supabase/config.toml [api].port(이 저장소 기본 54340).
 * (호스트 Postgres 직접 포트는 config.toml [db].port이며 supabase-js에 넣으면 안 됩니다.)
 */
export function getSupabaseApiUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_URL이 설정되어 있지 않습니다.",
    );
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error(`Supabase API URL 형식이 올바르지 않습니다: ${url}`);
  }
  return url;
}

export function getSupabaseAdmin() {
  const url = getSupabaseApiUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되어 있지 않습니다.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}