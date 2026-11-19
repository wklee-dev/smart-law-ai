"use client";

import { useCallback, useEffect, useState } from "react";
import { tdClass, thClass } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import type {
  WeeklyBatchState,
  WeeklyCrawlerItem,
} from "@/app/shared/crawler-management-types";

type WeeklyResponse = {
  ok: boolean;
  error?: string;
  root?: string;
  period?: string;
  batch?: WeeklyBatchState | null;
  items?: WeeklyCrawlerItem[];
};

export async function postWeeklyRun(keys?: string[]): Promise<void> {
  const res = await fetch("/api/crawler-management/weekly", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error || "실행 실패");
}

function runStatusClass(status: string | undefined): string {
  if (status === "running") return "bg-amber-100 text-amber-900";
  if (status === "success") return "bg-emerald-100 text-emerald-800";
  if (status === "failed") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-600";
}

const RUN_STATUS_LABEL: Record<string, string> = {
  running: "실행중",
  success: "성공",
  failed: "실패",
};

export function WeeklyCrawlersPanel({ refreshToken }: { refreshToken: number }) {
  const [items, setItems] = useState<WeeklyCrawlerItem[]>([]);
  const [batch, setBatch] = useState<WeeklyBatchState | null>(null);
  const [period, setPeriod] = useState("");
  const [root, setRoot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [log, setLog] = useState<{ title: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/crawler-management/weekly", { cache: "no-store" });
      const data = (await res.json()) as WeeklyResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || "주간 크롤러 조회 실패");
      setItems(data.items ?? []);
      setBatch(data.batch ?? null);
      setPeriod(data.period ?? "");
      setRoot(data.root ?? "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const active =
    !!batch || items.some((it) => it.lastRun?.status === "running");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [active, load]);

  const run = async (keys?: string[]) => {
    setError(null);
    try {
      await postWeeklyRun(keys);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const showLog = async (it: WeeklyCrawlerItem) => {
    if (!it.lastRun) return;
    const res = await fetch(
      `/api/crawler-management/weekly/log?runId=${it.lastRun.id}`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as { ok?: boolean; log?: string; error?: string };
    setLog({
      title: `${it.names.join(", ")} · run #${it.lastRun.id}`,
      text: data.ok ? (data.log ?? "") : (data.error ?? "로그 조회 실패"),
    });
  };

  const autoCount = items.filter((it) => !it.interactive).length;

  return (
    <section className="rounded-md border border-[#e5e9ef] bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[13px] font-semibold text-[#1e2f4f]"
        >
          {open ? "▾" : "▸"} 매주 최신화 (smart_law_ai 내장 크롤러 {items.length}개)
        </button>
        <span className="text-[11px] text-[#666]">
          기준 주차(직전 주) <span className="font-mono">{period || "—"}</span>
        </span>
        {batch ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">
            일괄 실행중 {batch.done}/{batch.total}
            {batch.current ? ` · ${batch.current}` : ""}
          </span>
        ) : null}
        <button
          type="button"
          disabled={!!batch}
          onClick={() => void run()}
          className="ml-auto rounded bg-[#1e2f4f] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#162438] disabled:cursor-not-allowed disabled:opacity-40"
          title="로그인이 필요한 유니패스 항목은 제외하고 순차 실행"
        >
          전체 실행 ({autoCount}개)
        </button>
      </div>
      <p className="mt-1 text-[11px] text-[#94a3b8]">
        엑셀 E열(매주최신화 대상)=Y 프로그램을 <span className="font-mono">{root}</span> 로
        복사해 두었습니다. 결과는 모두 smart_law_ai.db 에 저장되며, 한 번에 1개씩 순차 실행합니다.
      </p>
      {error ? <p className="mt-1 text-[12px] text-red-700">{error}</p> : null}

      {open ? (
        <div className="mt-2 max-h-[22rem] overflow-auto rounded border border-[#e5e9ef]">
          <table className="w-full min-w-[1100px] border-collapse text-[12px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={thClass}>대상</th>
                <th className={thClass}>내장 위치</th>
                <th className={thClass}>주간 실행 명령</th>
                <th className={thClass}>최근 실행</th>
                <th className={thClass}>실행</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const running = it.lastRun?.status === "running" || batch?.current === it.key;
                return (
                  <tr key={it.key} className="align-top hover:bg-[#f8fafc]">
                    <td className={`${tdClass} w-[13rem]`}>
                      {it.names.map((n) => (
                        <div key={n} className="font-medium text-[#1e2f4f]">
                          {n}
                        </div>
                      ))}
                      {it.interactive ? (
                        <div className="mt-0.5 text-[10px] text-amber-700">
                          {it.interactive}
                        </div>
                      ) : null}
                    </td>
                    <td className={`${tdClass} w-[16rem]`}>
                      <div className="break-all font-mono text-[10.5px] text-[#475569]">
                        {it.dir}
                      </div>
                      <div className="mt-0.5 break-all font-mono text-[10px] text-[#94a3b8]">
                        원본: {it.originalDir}
                      </div>
                      {!it.dirExists ? (
                        <div className="text-[10px] text-red-700">폴더 없음</div>
                      ) : null}
                    </td>
                    <td className={tdClass}>
                      <div className="whitespace-pre-wrap break-all font-mono text-[10.5px] text-[#475569]">
                        {it.command.replaceAll(" && ", "\n")}
                      </div>
                    </td>
                    <td className={`${tdClass} w-[10rem] whitespace-nowrap`}>
                      {it.lastRun ? (
                        <div className="text-[11px] leading-snug">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 font-medium ${runStatusClass(it.lastRun.status)}`}
                          >
                            {RUN_STATUS_LABEL[it.lastRun.status] ?? it.lastRun.status}
                          </span>
                          <div className="mt-0.5 text-[#94a3b8]">
                            {new Date(it.lastRun.started_at).toLocaleString("ko-KR", {
                              hour12: false,
                            })}
                          </div>
                          {it.lastRun.period ? (
                            <div className="font-mono text-[#64748b]">
                              주차 {it.lastRun.period}
                            </div>
                          ) : null}
                        </div>
                      ) : it.queued ? (
                        <span className="text-[11px] text-amber-700">대기중</span>
                      ) : (
                        <span className="text-[11px] text-[#94a3b8]">실행 이력 없음</span>
                      )}
                    </td>
                    <td className={`${tdClass} w-[9rem] whitespace-nowrap`}>
                      <button
                        type="button"
                        disabled={running || it.queued || !it.dirExists}
                        onClick={() => void run([it.key])}
                        className="rounded bg-[#1e2f4f] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#162438] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {running ? "실행중…" : it.queued ? "대기중" : "실행"}
                      </button>
                      <button
                        type="button"
                        disabled={!it.lastRun}
                        onClick={() => void showLog(it)}
                        className="ml-1 rounded border border-[#cbd5e1] px-2.5 py-1 text-[11px] text-[#334155] hover:bg-[#f1f5f9] disabled:opacity-40"
                      >
                        로그
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {log ? (
        <div className="mt-2 rounded border border-[#cbd5e1] bg-[#0f172a] p-2">
          <div className="mb-1 flex items-center text-[11px] text-slate-300">
            <span className="font-medium">{log.title}</span>
            <button
              type="button"
              onClick={() => setLog(null)}
              className="ml-auto rounded border border-slate-500 px-2 py-0.5 hover:bg-slate-700"
            >
              닫기
            </button>
          </div>
          <pre className="max-h-[20rem] overflow-auto whitespace-pre-wrap text-[11px] leading-snug text-slate-100">
            {log.text}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
