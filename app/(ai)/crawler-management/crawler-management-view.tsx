"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CasPageHeader,
  CasPageShell,
  casInputClass,
  slTableClass,
  slTableWrapClass,
  tdClass,
  thClass,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import type { CrawlerListItem } from "@/app/shared/crawler-management-types";
import {
  postWeeklyRun,
  WeeklyCrawlersPanel,
} from "@/app/(ai)/crawler-management/weekly-crawlers-panel";

type ListResponse = {
  ok: boolean;
  error?: string;
  excelPath?: string;
  targetDb?: string;
  total?: number;
  items?: CrawlerListItem[];
};

/** 엑셀 「리스트」 시트 A~O열 (G~I는 Source 한 칸) */
const EXCEL_COLUMNS: [string, string][] = [
  ["A", "구분"],
  ["B", "진행사항"],
  ["C", "대상"],
  ["D", "진행사항"],
  ["E", "매주최신화 대상"],
  ["F", "비고"],
  ["G~I", "Source"],
  ["J", "대상"],
  ["K", "DB"],
  ["L", "embedding"],
  ["M", "프로그램 위치"],
  ["N", "첨부파일"],
  ["O", "호출"],
];

function TextCell({
  value,
  width,
  mono,
}: {
  value: string;
  width: string;
  mono?: boolean;
}) {
  return (
    <td className={`${tdClass} ${width}`}>
      <div
        className={`whitespace-pre-wrap break-all text-[11px] leading-snug ${
          mono ? "font-mono text-[10.5px] text-[#475569]" : ""
        }`}
      >
        {value || "—"}
      </div>
    </td>
  );
}

function statusBadgeClass(status: string): string {
  if (status.includes("실행") || status.includes("크롤링")) {
    return "bg-amber-100 text-amber-900";
  }
  if (status.includes("완료")) return "bg-emerald-100 text-emerald-800";
  if (status.includes("실패") || status.includes("오류")) {
    return "bg-red-100 text-red-800";
  }
  return "bg-slate-100 text-slate-700";
}

export function CrawlerManagementView() {
  const [items, setItems] = useState<CrawlerListItem[]>([]);
  const [excelPath, setExcelPath] = useState("");
  const [targetDb, setTargetDb] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [weeklyFilter, setWeeklyFilter] = useState<"Y" | "all">("Y");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [weeklyRefresh, setWeeklyRefresh] = useState(0);

  const runWeekly = async (it: CrawlerListItem) => {
    if (!it.weeklyKey) return;
    setError(null);
    try {
      await postWeeklyRun([it.weeklyKey]);
      setMessage(`${it.name} — smart_law_ai 내장 주간 크롤러 실행 요청`);
      setWeeklyRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crawler-management/list", {
        cache: "no-store",
      });
      const data = (await res.json()) as ListResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "목록 조회 실패");
      }
      setItems(data.items ?? []);
      setExcelPath(data.excelPath ?? "");
      setTargetDb(data.targetDb ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base =
      weeklyFilter === "Y"
        ? items.filter((it) => it.weekly.trim().toUpperCase() === "Y")
        : items;
    if (!needle) return base;
    return base.filter((it) =>
      [
        it.category,
        it.status,
        it.name,
        it.progress,
        it.weekly,
        it.note,
        it.source,
        it.target,
        it.db,
        it.embedding,
        it.programLocationRaw,
        it.attachment,
        it.callRaw,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [items, q, weeklyFilter]);

  const runNext = async (id: string) => {
    setRunningId(id);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/crawler-management/run-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crawlerId: id }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        command?: string;
        period?: string | null;
        runId?: number;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "실행 실패");
      }
      setMessage(
        `다음 차수 실행 시작 (run #${data.runId})${
          data.period ? ` · ${data.period}` : ""
        }\n${data.command ?? ""}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunningId(null);
    }
  };

  return (
    <CasPageShell>
      <CasPageHeader
        title="크롤러 관리"
        action={
          <button
            type="button"
            onClick={() => void load()}
            className="rounded border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
          >
            새로고침
          </button>
        }
      />

      <section className="rounded-md border border-[#e5e9ef] bg-white p-3 shadow-sm">
        <div className="mb-3 grid gap-2 text-[12px] text-[#666] sm:grid-cols-2">
          <p>
            <span className="font-medium text-[#333]">리스트 엑셀</span>
            <br />
            <span className="break-all font-mono text-[11px]">{excelPath || "—"}</span>
          </p>
          <p>
            <span className="font-medium text-[#333]">기본 DB</span>
            <br />
            <span className="break-all font-mono text-[11px]">{targetDb || "—"}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-[11rem]">
            <span className="mb-1 block text-[11px] text-[#666]">매주최신화 대상(E)</span>
            <select
              className={casInputClass}
              value={weeklyFilter}
              onChange={(e) => setWeeklyFilter(e.target.value as "Y" | "all")}
            >
              <option value="Y">Y</option>
              <option value="all">전체</option>
            </select>
          </label>
          <label className="min-w-[14rem] flex-1">
            <span className="mb-1 block text-[11px] text-[#666]">검색</span>
            <input
              className={casInputClass}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="구분·대상·진행사항·Source·DB·경로·호출"
            />
          </label>
          <p className="pb-1 text-[12px] text-[#666]">
            {loading ? "불러오는 중…" : `${filtered.length} / ${items.length}건`}
          </p>
        </div>
        {error ? (
          <p className="mt-2 text-[12px] text-red-700">{error}</p>
        ) : null}
        {message ? (
          <pre className="mt-2 whitespace-pre-wrap rounded border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-900">
            {message}
          </pre>
        ) : null}
      </section>

      <WeeklyCrawlersPanel refreshToken={weeklyRefresh} />

      <div className={`${slTableWrapClass} max-h-[calc(100vh-16rem)] overflow-auto`}>
        <table className={`${slTableClass} min-w-[1900px]`}>
          <thead className="sticky top-0 z-10">
            <tr>
              {EXCEL_COLUMNS.map(([col, label]) => (
                <th key={col} className={`${thClass} whitespace-nowrap`}>
                  {label}
                  <span className="ml-1 text-[10px] font-normal text-[#94a3b8]">
                    ({col})
                  </span>
                </th>
              ))}
              <th className={`${thClass} whitespace-nowrap`}>실행</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => {
              const busy =
                runningId === it.id || it.lastRun?.status === "running";
              return (
                <tr key={it.id} className="align-top hover:bg-[#f8fafc]">
                  <td className={`${tdClass} whitespace-nowrap text-center text-[11px]`}>
                    {it.category || "—"}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${statusBadgeClass(it.status)}`}
                    >
                      {it.status || "—"}
                    </span>
                  </td>
                  <td className={`${tdClass} min-w-[8rem]`}>
                    <div className="font-medium text-[#1e2f4f]">{it.name}</div>
                    <div className="text-[10px] text-[#94a3b8]">
                      엑셀 {it.excelRow}행
                    </div>
                  </td>
                  <TextCell value={it.progress} width="w-[11rem]" />
                  <td className={`${tdClass} whitespace-nowrap text-center text-[11px]`}>
                    {it.weekly || "—"}
                  </td>
                  <TextCell value={it.note} width="w-[11rem]" />
                  <TextCell value={it.source} width="w-[11rem]" />
                  <TextCell value={it.target} width="w-[11rem]" />
                  <td className={`${tdClass} w-[8rem]`}>
                    <div className="break-all font-mono text-[11px]">
                      {it.db || "—"}
                    </div>
                    {it.db && !it.dbIsSmartLaw ? (
                      <div className="mt-1 text-[10px] text-amber-700">
                        DB 미통합
                      </div>
                    ) : null}
                  </td>
                  <TextCell value={it.embedding} width="w-[9rem]" />
                  <TextCell value={it.programLocationRaw} width="w-[14rem]" mono />
                  <TextCell value={it.attachment} width="w-[12rem]" mono />
                  <TextCell value={it.callRaw} width="w-[24rem]" mono />
                  {it.weeklyKey ? (
                    <td className={`${tdClass} w-[9rem]`}>
                      <span className="inline-block rounded bg-[#e0e7ff] px-1.5 py-0.5 text-[10px] font-medium text-[#3730a3]">
                        smart_law_ai 내장
                      </span>
                      <button
                        type="button"
                        onClick={() => void runWeekly(it)}
                        className="mt-1.5 block rounded bg-[#1e2f4f] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#162438]"
                        title="직전 주차 기준 주간 최신화 실행 (상단 「매주 최신화」에서 진행·로그 확인)"
                      >
                        주간 실행
                      </button>
                    </td>
                  ) : (
                  <td className={`${tdClass} w-[9rem]`}>
                    <div className="text-[11px] leading-snug">
                      <div>
                        다음 차수:{" "}
                        <span className="font-mono">{it.nextPeriod || "—"}</span>
                      </div>
                      {it.lastRun ? (
                        <div className="mt-1 text-[#94a3b8]">
                          {it.lastRun.status} ·{" "}
                          {it.lastRun.started_at?.slice(0, 16).replace("T", " ")}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={busy || !it.nextCommand || !it.programDir}
                      onClick={() => void runNext(it.id)}
                      className="mt-1.5 rounded bg-[#1e2f4f] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#162438] disabled:cursor-not-allowed disabled:opacity-40"
                      title={
                        !it.programDir
                          ? "프로그램 위치(M열)에서 실행 폴더를 찾지 못했습니다"
                          : (it.nextCommand ?? "호출(O열)에 실행할 python 명령 없음")
                      }
                    >
                      {busy ? "실행중…" : "다음 차수"}
                    </button>
                  </td>
                  )}
                </tr>
              );
            })}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td
                  className={`${tdClass} py-8 text-center text-[#94a3b8]`}
                  colSpan={EXCEL_COLUMNS.length + 1}
                >
                  표시할 크롤러가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </CasPageShell>
  );
}
