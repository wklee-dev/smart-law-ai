"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PROCESSING_STATUS_FIELD_DEFS,
  PROCESSING_STATUS_ITEMS,
  cellText,
  classifyProgress,
  processingStatusAdminRuleLegacyCount,
  processingStatusLawApiCount,
  summarizeProcessingStatusByCategory,
  summarizeProcessingStatusByProgress,
  type ProcessingStatusColumn,
  type ProcessingStatusItem,
  type ProcessingStatusKind,
  type ProcessingStatusPayload,
} from "@/app/lib/data-processing-status";

import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  stickyThClass,
  tdClass,
} from "@/app/lib/sl-table-styles";
import { SlIconRefresh } from "@/app/components/sl-icons";

const KIND_BADGE: Record<ProcessingStatusKind, string> = {
  done: "bg-emerald-100 text-emerald-800 border-emerald-200",
  partial: "bg-amber-100 text-amber-900 border-amber-200",
  ongoing: "bg-sky-100 text-sky-800 border-sky-200",
  none: "bg-slate-100 text-slate-600 border-slate-200",
};

const PROGRESS_CARD_ACCENT: Record<string, string> = {
  크롤링: "text-orange-700",
  크롤러: "text-violet-700",
  "70%완료": "text-amber-700",
  설계완료: "text-sky-700",
  완료: "text-emerald-700",
};

function SummaryCard({
  label,
  value,
  accent,
  sub,
  unit,
}: {
  label: string;
  value: number | null;
  accent?: string;
  sub?: string;
  unit?: string;
}) {
  return (
    <div className="rounded border border-[#b8c9dc] bg-white px-4 py-3 text-center shadow-sm">
      <p className="text-[12px] text-slate-500">{label}</p>
      <p
        className={`mt-1 text-[26px] font-bold tabular-nums ${accent ?? "text-[#1e2f4f]"}`}
      >
        {value == null ? "—" : value}
        {value != null && unit ? (
          <span className="ml-0.5 text-[18px] font-bold">{unit}</span>
        ) : null}
      </p>
      {sub ? <p className="mt-1 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function columnHeaderClass(key: ProcessingStatusColumn["key"]): string {
  switch (key) {
    case "category":
      return " min-w-[72px] text-center";
    case "progress":
      return " min-w-[96px] text-center";
    case "name":
      return " min-w-[140px]";
    case "extraProgress":
      return " min-w-[200px]";
    case "remarks":
      return " min-w-[120px]";
    default:
      return " min-w-[90px]";
  }
}

function columnCellClass(key: ProcessingStatusColumn["key"]): string {
  switch (key) {
    case "progress":
    case "category":
      return " text-center";
    case "name":
      return " font-medium text-[#1e2f4f]";
    case "extraProgress":
    case "remarks":
      return " whitespace-pre-wrap";
    default:
      return "";
  }
}

function CategoryBadge({ category }: { category: string }) {
  const text = cellText(category);
  if (!text) return "\u00a0";
  const tone =
    text === "기존"
      ? "bg-[#eef3fa] text-[#1e2f4f] border-[#b8c9dc]"
      : text === "추가"
        ? "bg-violet-50 text-violet-800 border-violet-200"
        : "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {text}
    </span>
  );
}

function ProgressBadge({ progress }: { progress: string }) {
  const text = cellText(progress);
  if (!text) return "\u00a0";
  const kind = classifyProgress(progress);
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${KIND_BADGE[kind]}`}
    >
      {text}
    </span>
  );
}

function formatSyncedAt(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR");
}

export function ProcessingStatusView() {
  const [items, setItems] = useState<ProcessingStatusItem[]>(
    PROCESSING_STATUS_ITEMS,
  );
  const [syncedAt, setSyncedAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [columns, setColumns] = useState<ProcessingStatusColumn[]>(
    PROCESSING_STATUS_FIELD_DEFS,
  );

  const loadStatus = useCallback(async (force = false) => {
    if (force) {
      setSyncing(true);
      setRefreshNote(null);
    } else setLoading(true);
    try {
      const query = force ? "?force=1" : "";
      const res = await fetch(`/api/dashboard/processing-status${query}`, {
        cache: "no-store",
        method: force ? "POST" : "GET",
      });
      const data = (await res.json()) as ProcessingStatusPayload & {
        ok?: boolean;
        error?: string;
        refreshed?: boolean;
      };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? `조회 실패 (${res.status})`);
      }
      setItems(data.items);
      setSyncedAt(data.syncedAt);
      if (data.columns?.length) setColumns(data.columns);
      setError(null);
      if (force) {
        setRefreshNote(
          `Excel에서 ${data.items.length}건을 반영했습니다.${data.syncedAt ? ` (${formatSyncedAt(data.syncedAt)})` : ""}`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      if (force) setSyncing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus(false);
  }, [loadStatus]);

  const progressSummary = useMemo(
    () => summarizeProcessingStatusByProgress(items),
    [items],
  );
  const lawApiCount = useMemo(
    () => processingStatusLawApiCount(items),
    [items],
  );
  const adminRuleLegacyCount = useMemo(
    () => processingStatusAdminRuleLegacyCount(items),
    [items],
  );

  const totalCategorySub = useMemo(() => {
    const rows = summarizeProcessingStatusByCategory(items);
    const parts: string[] = [];
    for (const key of ["기존", "추가"] as const) {
      const n = rows.find((r) => r.category === key)?.total;
      if (n != null) parts.push(`${key} ${n}건`);
    }
    return parts.length ? parts.join(" · ") : "";
  }, [items]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <CasPageHeader title="법령/행정규칙 현황" />
          {syncedAt || loading ? (
            <p className="text-[12px] text-slate-500">
              {syncedAt ? `최신화 ${formatSyncedAt(syncedAt)}` : null}
              {loading ? `${syncedAt ? " · " : ""}불러오는 중…` : null}
            </p>
          ) : null}
          {refreshNote ? (
            <p className="text-[12px] font-medium text-emerald-700">{refreshNote}</p>
          ) : null}
          {error ? (
            <p className="text-[12px] text-red-600">{error}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[#1e2f4f] bg-[#1e2f4f] px-5 text-[13px] font-medium text-white shadow-sm hover:bg-[#162540] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={syncing || loading}
          title="Excel 파일(리스트 시트)에서 처리현황을 다시 읽어 반영합니다"
          onClick={() => {
            void loadStatus(true);
          }}
        >
          {syncing ? (
            <>
              <SlIconRefresh className="h-4 w-4 animate-spin" />
              Refresh…
            </>
          ) : (
            <>
              <SlIconRefresh className="h-4 w-4" />
              Refresh
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <SummaryCard
          label="전체 항목"
          value={items.length}
          sub={totalCategorySub || undefined}
        />
        <SummaryCard
          label="법령"
          value={lawApiCount}
          unit="건"
          accent="text-[#1e2f4f]"
          sub="법령정보 공동활용(API)"
        />
        <SummaryCard
          label="행정규칙"
          value={adminRuleLegacyCount}
          unit="건"
          accent="text-violet-700"
          sub="기존 대상"
        />
        {progressSummary.map((row) => (
          <SummaryCard
            key={row.progress}
            label={row.progress}
            value={row.count}
            accent={PROGRESS_CARD_ACCENT[row.progress] ?? "text-[#1e2f4f]"}
          />
        ))}
      </div>

      <section className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded border border-[#b8c9dc] bg-white shadow-sm">
        <div className="border-b border-[#b8c9dc] bg-[#f5f9fd] px-4 py-2.5">
          <h2 className="text-[14px] font-bold text-slate-800">리스트 현황</h2>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-max w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`${stickyThClass}${columnHeaderClass(col.key)}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={`${item.name}-${idx}`} className="hover:bg-[#f4f8fc]">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`${tdClass}${columnCellClass(col.key)}`}
                    >
                      {col.key === "category" ? (
                        <CategoryBadge category={item.category} />
                      ) : col.key === "progress" ? (
                        <ProgressBadge progress={item.progress} />
                      ) : (
                        cellText(item[col.key]) || "\u00a0"
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
