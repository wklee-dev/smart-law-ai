"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasSubNavTabs,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { ClipPortalHtmlPanel } from "@/app/(ai)/customs-law-portal/clearance-info/clip-portal-html-panel";
import type {
  ClipClearanceContentDetail,
  ClipClearanceContentSlug,
} from "@/app/lib/clip-clearance-content-shared";
import { useCallback, useEffect, useState } from "react";

const TABS = [{ key: "general", label: "종합정보" }] as const;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

export function ClipClearanceContentView({
  slug,
  title,
}: {
  slug: ClipClearanceContentSlug;
  title: string;
}) {
  const [content, setContent] = useState<ClipClearanceContentDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ content: ClipClearanceContentDetail }>(
        `/api/clip-clearance-content?slug=${encodeURIComponent(slug)}`,
      );
      setContent(data.content ?? null);
    } catch (e) {
      setContent(null);
      setError(e instanceof Error ? e.message : "종합정보 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  return (
    <CasPageShell>
      <CasPageHeader title={title} />

      <CasSubNavTabs
        tabs={TABS}
        activeKey="general"
        onChange={() => undefined}
      />

      <CasCard title="종합정보">
        {error ? <p className="mb-2 text-[12px] text-red-600">{error}</p> : null}
        <ClipPortalHtmlPanel
          html={content?.body_html}
          text={content?.body_text}
          loading={loading}
          emptyMessage="종합정보가 없습니다. customs_law_crawler.py 수집 후 DB에 표시됩니다."
        />
      </CasCard>
    </CasPageShell>
  );
}
