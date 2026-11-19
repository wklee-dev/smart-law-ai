"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasResetButton,
  CasSearchButton,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  ClipGridEmptyRow,
  ClipGridStatsBar,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipPaginationBar,
  clipGridMonoClass,
  clipGridRowHoverClass,
  tdClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import { formatClipCustomsChiefHsInput } from "@/app/lib/clip-customs-chief-shared";
import type {
  ClipWorldHsRevisionListRow,
  ClipWorldHsRevisionVersionOption,
} from "@/app/lib/clip-world-hs-revision-shared";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;

function visiblePageBlock(currentPage: number, totalPages: number): number[] {
  const tp = Math.max(1, Math.floor(totalPages));
  const cur = Math.min(Math.max(1, Math.floor(currentPage)), tp);
  const start = Math.floor((cur - 1) / PAGE_NUMBER_WINDOW) * PAGE_NUMBER_WINDOW + 1;
  const end = Math.min(start + PAGE_NUMBER_WINDOW - 1, tp);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

function HsCodeCell({ value }: { value: string }) {
  const text = value.trim();
  if (!text) {
    return (
      <ClipGridTd align="center" className={clipGridMonoClass}>
        {"\u00a0"}
      </ClipGridTd>
    );
  }
  return (
    <ClipGridTd
      align="center"
      className={`${clipGridMonoClass} whitespace-pre-wrap text-center leading-relaxed`}
    >
      {text}
    </ClipGridTd>
  );
}

function DescriptionCell({ value }: { value: string }) {
  const text = value.trim();
  return (
    <td className={`${tdClass} align-top text-left text-[12px] leading-relaxed text-[#333]`}>
      {text || "\u00a0"}
    </td>
  );
}

export default function WorldHsRevisionView() {
  const [versions, setVersions] = useState<ClipWorldHsRevisionVersionOption[]>([]);
  const [dbReady, setDbReady] = useState(true);
  const [draft, setDraft] = useState({
    versionPair: "",
    hsCode: "",
    description: "",
  });
  const [applied, setApplied] = useState({
    versionPair: "",
    hsCode: "",
    description: "",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [rows, setRows] = useState<ClipWorldHsRevisionListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchJson<{
      versions: ClipWorldHsRevisionVersionOption[];
      defaultVersionPair: string;
      ready: boolean;
    }>("/api/clip-world-hs-revision/versions")
      .then((data) => {
        setVersions(data.versions ?? []);
        setDbReady(data.ready);
        const initial = data.defaultVersionPair || data.versions[0]?.value || "";
        setDraft((p) => ({ ...p, versionPair: initial }));
        setApplied((p) => ({ ...p, versionPair: initial }));
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "버전 목록 조회 실패"),
      );
  }, []);

  const activeVersion = useMemo(
    () =>
      versions.find((v) => v.value === applied.versionPair) ??
      versions.find((v) => v.value === draft.versionPair),
    [applied.versionPair, draft.versionPair, versions],
  );

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    if (applied.versionPair) u.set("versionPair", applied.versionPair);
    if (applied.hsCode.trim()) u.set("hsCode", applied.hsCode.trim());
    if (applied.description.trim()) u.set("description", applied.description.trim());
    return `/api/clip-world-hs-revision/query?${u}`;
  }, [applied, page, pageSize]);

  const loadRows = useCallback(async () => {
    if (!applied.versionPair) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: ClipWorldHsRevisionListRow[];
        total: number;
        ready: boolean;
      }>(buildQueryUrl());
      setDbReady(data.ready);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [applied.versionPair, buildQueryUrl]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const totalPg = Math.max(1, Math.ceil(total / pageSize));
  const curPageSafe = Math.min(page, totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  const pairParts = applied.versionPair.split("-");
  const baseYear =
    activeVersion?.baseYear ?? (Number(pairParts[0]) || 0);
  const revisedYear =
    activeVersion?.revisedYear ?? (Number(pairParts[1]) || 0);

  const onSearch = () => {
    setApplied({ ...draft });
    setPage(1);
  };

  const onReset = () => {
    const defaultPair =
      versions.find((v) => (v.count ?? 0) > 0)?.value ??
      versions[0]?.value ??
      draft.versionPair;
    const empty = { versionPair: defaultPair, hsCode: "", description: "" };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
  };

  return (
    <CasPageShell>
      <CasPageHeader title="세계HS 개정표" />

      <CasCard title="검색">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ClassificationFormSplitField label="Version">
            <select
              className={CLASSIFICATION_FORM_INPUT_CLASS}
              value={draft.versionPair}
              onChange={(e) =>
                setDraft((p) => ({ ...p, versionPair: e.target.value }))
              }
            >
              {versions.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </ClassificationFormSplitField>
          <ClassificationFormSplitField label="품목번호">
            <input
              type="text"
              className={`${CLASSIFICATION_FORM_INPUT_CLASS} font-mono`}
              value={draft.hsCode}
              placeholder="HS 품목번호"
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  hsCode: formatClipCustomsChiefHsInput(e.target.value),
                }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
          </ClassificationFormSplitField>
          <ClassificationFormSplitField label="설명">
            <input
              type="text"
              className={CLASSIFICATION_FORM_INPUT_CLASS}
              value={draft.description}
              placeholder="국문·영문 설명"
              onChange={(e) =>
                setDraft((p) => ({ ...p, description: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
          </ClassificationFormSplitField>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-stone-300 bg-[#f8f6f2] px-3 py-2.5">
          <CasResetButton onClick={onReset} disabled={loading} />
          <CasSearchButton
            onClick={onSearch}
            disabled={loading || !draft.versionPair}
          />
        </div>
      </CasCard>

      <CasCard title="조회 결과" className="flex min-w-0 flex-col">
        <ClipGridStatsBar
          total={total}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPage(1);
            setPageSize(size);
          }}
        />

        {!dbReady ? (
          <p className="mb-2 text-[12px] text-amber-800">
            세계HS 개정표 데이터가 없습니다. `world_hs_revision_crawler.py`로
            `smart_law_ai.db`에 수집해 주세요.
          </p>
        ) : null}
        {error ? <p className="mb-2 text-[12px] text-red-600">{error}</p> : null}

        <ClipGridTable fixedLayout={false} minWidth="100%">
          <colgroup>
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "36%" }} />
            <col style={{ width: "36%" }} />
          </colgroup>
          <thead>
            <tr>
              <ClipGridTh colSpan={2} className="text-center">
                Version
              </ClipGridTh>
              <ClipGridTh colSpan={2} className="text-center">
                설명
              </ClipGridTh>
            </tr>
            <tr>
              <ClipGridTh className="text-center">{baseYear || "—"}</ClipGridTh>
              <ClipGridTh className="text-center">{revisedYear || "—"}</ClipGridTh>
              <ClipGridTh className="text-center">영문</ClipGridTh>
              <ClipGridTh className="text-center">국문</ClipGridTh>
            </tr>
          </thead>
          <tbody>
            {(loading || rows.length === 0) && (
              <ClipGridEmptyRow colSpan={4} loading={loading} />
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.id} className={clipGridRowHoverClass}>
                  <HsCodeCell value={row.before_hs_code} />
                  <HsCodeCell value={row.after_hs_code} />
                  <DescriptionCell value={row.description_en} />
                  <DescriptionCell value={row.description_ko} />
                </tr>
              ))}
          </tbody>
        </ClipGridTable>

        {total > 0 ? (
          <ClipPaginationBar
            curPageSafe={curPageSafe}
            totalPg={totalPg}
            loading={loading}
            block={block}
            onPage={setPage}
          />
        ) : null}
      </CasCard>
    </CasPageShell>
  );
}
