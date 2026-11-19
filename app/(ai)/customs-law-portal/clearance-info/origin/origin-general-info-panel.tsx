"use client";

import { ClipPortalHtmlPanel } from "@/app/(ai)/customs-law-portal/clearance-info/clip-portal-html-panel";
import { CasCard } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import type {
  ClipOriginGeneralSectionDetail,
  ClipOriginGeneralSectionRow,
} from "@/app/lib/clip-origin-general-shared";
import { useCallback, useEffect, useState } from "react";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

export function OriginGeneralInfoPanel() {
  const [sections, setSections] = useState<ClipOriginGeneralSectionRow[]>([]);
  const [sectionKey, setSectionKey] = useState("");
  const [section, setSection] = useState<ClipOriginGeneralSectionDetail | null>(
    null,
  );
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSection, setLoadingSection] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchJson<{ sections: ClipOriginGeneralSectionRow[] }>(
      "/api/clip-origin/general/sections",
    )
      .then((data) => {
        const list = data.sections ?? [];
        setSections(list);
        if (list[0]?.section_key) setSectionKey(list[0].section_key);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "종합정보 목록 조회 실패"),
      )
      .finally(() => setLoadingList(false));
  }, []);

  const loadSection = useCallback(async (key: string) => {
    if (!key) return;
    setLoadingSection(true);
    setError(null);
    try {
      const data = await fetchJson<{ section: ClipOriginGeneralSectionDetail }>(
        `/api/clip-origin/general?sectionKey=${encodeURIComponent(key)}`,
      );
      setSection(data.section ?? null);
    } catch (e) {
      setSection(null);
      setError(e instanceof Error ? e.message : "종합정보 조회 실패");
    } finally {
      setLoadingSection(false);
    }
  }, []);

  useEffect(() => {
    if (sectionKey) void loadSection(sectionKey);
  }, [loadSection, sectionKey]);

  return (
    <CasCard title="종합정보">
      {error ? (
        <p className="mb-3 text-[12px] text-red-600">{error}</p>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-1 border-b border-stone-300 pb-2">
        {loadingList ? (
          <p className="text-[12px] text-[#666]">탭 불러오는 중…</p>
        ) : sections.length === 0 ? (
          <p className="text-[12px] text-[#666]">
            종합정보가 없습니다. origin_crawler.py --mode general 수집 후
            origin_general_sections에 표시됩니다.
          </p>
        ) : (
          sections.map((item) => {
            const active = item.section_key === sectionKey;
            return (
              <button
                key={item.section_key}
                type="button"
                onClick={() => setSectionKey(item.section_key)}
                className={
                  active
                    ? "rounded border border-[#1e2f4f] bg-[#1e2f4f] px-3 py-1.5 text-[12px] font-medium text-white"
                    : "rounded border border-stone-300 bg-white px-3 py-1.5 text-[12px] text-[#333] hover:bg-[#f8f6f2]"
                }
              >
                {item.section_name}
              </button>
            );
          })
        )}
      </div>

      <ClipPortalHtmlPanel
        html={section?.body_html}
        text={section?.body_text}
        loading={loadingList || loadingSection}
        emptyMessage="종합정보 본문이 없습니다."
      />
    </CasCard>
  );
}
