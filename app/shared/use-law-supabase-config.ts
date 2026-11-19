"use client";

import { useEffect, useState } from "react";

export type LawSupabaseConfig = {
  supabaseApiUrl: string | null;
  /** 로드 완료 전·실패 시 null */
  supabaseIsLocal: boolean | null;
  loaded: boolean;
};

/**
 * `/api/law-config` 기준 현재 앱이 붙는 Supabase(API)가 로컬인지 여부.
 * 서버는 `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`을 사용합니다.
 */
export function useLawSupabaseConfig(): LawSupabaseConfig {
  const [state, setState] = useState<LawSupabaseConfig>({
    supabaseApiUrl: null,
    supabaseIsLocal: null,
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/law-config", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (d: {
          supabaseApiUrl?: string | null;
          supabaseIsLocal?: boolean;
        }) => {
          if (cancelled) return;
          setState({
            supabaseApiUrl:
              typeof d.supabaseApiUrl === "string" ? d.supabaseApiUrl : null,
            supabaseIsLocal:
              typeof d.supabaseIsLocal === "boolean" ? d.supabaseIsLocal : null,
            loaded: true,
          });
        },
      )
      .catch(() => {
        if (cancelled) return;
        setState({
          supabaseApiUrl: null,
          supabaseIsLocal: null,
          loaded: true,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function lawSupabaseBackendLabel(isLocal: boolean | null): string {
  if (isLocal === true) return "로컬 Supabase";
  if (isLocal === false) return "클라우드 Supabase";
  return "Supabase";
}
