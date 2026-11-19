"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasSubNavTabs,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { NtxHtmlPanel } from "@/app/(ai)/customs-law-portal/tax-refund-info/ntx-html-panel";
import type { NtxPageContent } from "@/app/lib/clip-ntx-content-server";
import type { ClipTaxRefundInfoItem } from "@/app/lib/clip-tax-refund-info-items";
import { useCallback, useEffect, useState } from "react";

async function fetchNtxContent(section: string): Promise<NtxPageContent | null> {
  const res = await fetch(
    `/api/clip-ntx-content?section=${encodeURIComponent(section)}`,
    { cache: "no-store" },
  );
  const data = (await res.json()) as {
    ok: boolean;
    content?: NtxPageContent | null;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "본문 조회 실패");
  }
  return data.content ?? null;
}

export function TaxRefundContentView({ item }: { item: ClipTaxRefundInfoItem }) {
  const tabs = item.ntxTabs ?? [];
  const hasTabs = tabs.length > 0;
  const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? "main");
  const [content, setContent] = useState<NtxPageContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSection =
    tabs.find((t) => t.key === activeTab)?.section ?? item.ntxSection ?? "";

  const loadContent = useCallback(async (section: string) => {
    if (!section) return;
    setLoading(true);
    setError(null);
    try {
      setContent(await fetchNtxContent(section));
    } catch (e) {
      setContent(null);
      setError(e instanceof Error ? e.message : "본문 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection) void loadContent(activeSection);
  }, [activeSection, loadContent]);

  return (
    <CasPageShell>
      <CasPageHeader title={item.label} />

      {hasTabs ? (
        <CasSubNavTabs
          tabs={tabs.map((t) => ({ key: t.key, label: t.label }))}
          activeKey={activeTab}
          onChange={setActiveTab}
        />
      ) : null}

      <CasCard title={hasTabs ? undefined : "종합정보"} className="!overflow-visible">
        {error ? (
          <p className="mb-2 text-[12px] text-red-600">{error}</p>
        ) : null}
        <NtxHtmlPanel content={content} loading={loading} />
      </CasCard>
    </CasPageShell>
  );
}
