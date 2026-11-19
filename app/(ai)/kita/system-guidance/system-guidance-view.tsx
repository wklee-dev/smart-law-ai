"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  formatFileSize,
  YestradeFileList,
  YestradeHtmlPanel,
} from "@/app/(ai)/kita/yestrade-content-panel";
import type {
  YtgPageDetail,
  YtgPageListRow,
} from "@/app/lib/yestrade-guideline-shared";
import { useCallback, useEffect, useMemo, useState } from "react";

const SOURCE_ROOT = "https://www.yestrade.go.kr/system-guidance";

type NavGroup = { key: string; label: string; items: YtgPageListRow[] };

function buildGroups(pages: YtgPageListRow[]): NavGroup[] {
  const order: string[] = [];
  const map = new Map<string, YtgPageListRow[]>();
  for (const p of pages) {
    const key = p.menu_lv1 || p.page_name || `p-${p.page_id}`;
    if (!map.has(key)) {
      order.push(key);
      map.set(key, []);
    }
    map.get(key)!.push(p);
  }
  return order.map((key) => ({
    key,
    label: key,
    items: map.get(key) ?? [],
  }));
}

function navLabel(p: YtgPageListRow): string {
  return p.menu_lv2 || p.page_title || p.page_name;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

export function SystemGuidanceView() {
  const [ready, setReady] = useState(true);
  const [pages, setPages] = useState<YtgPageListRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<YtgPageDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const groups = useMemo(() => buildGroups(pages), [pages]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const data = await fetchJson<{
        ready: boolean;
        pages: YtgPageListRow[];
      }>("/api/yestrade-guideline/pages");
      setReady(data.ready);
      setPages(data.pages ?? []);
      setExpanded(new Set((data.pages ?? []).map((p) => p.menu_lv1 || p.page_name)));
      if ((data.pages ?? []).length > 0) {
        setSelectedId((prev) => prev ?? data.pages[0]!.page_id);
      }
    } catch (e) {
      setPages([]);
      setError(e instanceof Error ? e.message : "목록 조회 실패");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (pageId: number) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const data = await fetchJson<{ page: YtgPageDetail }>(
        `/api/yestrade-guideline/page?pageId=${pageId}`,
      );
      setDetail(data.page);
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : "본문 조회 실패");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <CasPageShell>
      <CasPageHeader title="전략물자제도안내" />
      <p className="text-[12px] text-slate-600">
        예스트레이드 「제도 안내」 수집본(
        <a
          href={SOURCE_ROOT}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#1e2f4f] underline"
        >
          원본
        </a>
        ). 테이블{" "}
        <code className="rounded bg-slate-100 px-1">ytg_*</code>
        {!ready ? " · DB 미준비" : null}
        {pages.length ? ` · ${pages.length}개 화면` : null}
      </p>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex min-h-[28rem] gap-3">
        <CasCard title="제도 안내 메뉴" className="w-[240px] shrink-0">
          {loadingList ? (
            <p className="text-[12px] text-[#666]">목록 불러오는 중…</p>
          ) : groups.length === 0 ? (
            <p className="text-[12px] text-[#666]">수집 데이터가 없습니다.</p>
          ) : (
            <nav className="space-y-1">
              {groups.map((g) => {
                const open = expanded.has(g.key);
                const single = g.items.length === 1 && !g.items[0]!.menu_lv2;
                if (single) {
                  const p = g.items[0]!;
                  const on = selectedId === p.page_id;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => setSelectedId(p.page_id)}
                      className={`block w-full rounded-md px-2 py-1.5 text-left text-[12px] ${
                        on
                          ? "bg-[#3b82f6] font-semibold text-white"
                          : "text-[#333] hover:bg-[#eef2f6]"
                      }`}
                    >
                      {navLabel(p)}
                    </button>
                  );
                }
                return (
                  <div key={g.key}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.key)}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] font-semibold text-[#1e2f4f] hover:bg-[#eef2f6]"
                    >
                      <span>{g.label}</span>
                      <span className="text-[10px] text-[#666]">
                        {open ? "▲" : "▼"}
                      </span>
                    </button>
                    {open ? (
                      <div className="ml-1 space-y-0.5 border-l border-[#e5e9ef] pl-2">
                        {g.items.map((p) => {
                          const on = selectedId === p.page_id;
                          return (
                            <button
                              key={p.page_id}
                              type="button"
                              onClick={() => setSelectedId(p.page_id)}
                              className={`block w-full rounded-md px-2 py-1 text-left text-[12px] ${
                                on
                                  ? "bg-[#3b82f6] font-semibold text-white"
                                  : "text-[#333] hover:bg-[#eef2f6]"
                              }`}
                            >
                              {navLabel(p)}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          )}
        </CasCard>

        <CasCard
          title={detail?.page_title || detail?.page_name || "본문"}
          className="min-w-0 flex-1"
        >
          {detail?.breadcrumb ? (
            <p className="mb-2 text-[11px] text-[#666]">{detail.breadcrumb}</p>
          ) : null}
          {detail?.source_url ? (
            <p className="mb-3 text-[11px]">
              <a
                href={detail.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1e2f4f] underline"
              >
                원본 페이지
              </a>
              {detail.crawled_at ? (
                <span className="ml-2 text-[#666]">
                  수집 {detail.crawled_at}
                </span>
              ) : null}
            </p>
          ) : null}

          {detail?.images?.length ? (
            <div className="mb-4 flex flex-wrap gap-3">
              {detail.images.map((im) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={im.image_id}
                  src={im.srcUrl}
                  alt={im.alt || im.file_name}
                  className="max-h-48 max-w-full rounded border border-[#e5e9ef] bg-white object-contain"
                />
              ))}
            </div>
          ) : null}

          <YestradeHtmlPanel
            html={detail?.content_xhtml}
            text={detail?.page_text}
            loading={loadingDetail}
            emptyMessage="본문이 없습니다. (링크·표만 있는 화면일 수 있습니다)"
          />

          <YestradeFileList
            title="첨부파일"
            items={(detail?.attachments ?? []).map((a) => ({
              key: `a-${a.attach_id}`,
              label: a.label || a.button_text || a.file_name,
              href: a.downloadUrl,
              meta: [a.file_name, formatFileSize(a.file_size)]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
          <YestradeFileList
            title="관련 링크"
            items={(detail?.links ?? []).map((l) => ({
              key: `l-${l.link_id}`,
              label: l.label || l.url,
              href: l.url,
              meta: l.domain || undefined,
            }))}
          />
        </CasCard>
      </div>
    </CasPageShell>
  );
}
