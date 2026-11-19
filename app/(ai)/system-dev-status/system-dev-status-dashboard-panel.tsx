"use client";

import type {
  DevStatusGroupRow,
  DevStatusProgressBucketRow,
  SystemDevStatusDashboardSummary,
} from "@/app/lib/system-dev-status-dashboard";
import { CasCard } from "@/app/(ai)/cas-ncom/cas-ncom-ui";

function fmtNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-[#1e2f4f]">
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p> : null}
    </div>
  );
}

function GroupTable({
  title,
  rows,
  scroll,
}: {
  title: string;
  rows: DevStatusGroupRow[];
  scroll?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
        {title}
      </div>
      <div
        className={`min-h-0 flex-1 ${scroll ? "max-h-[200px] overflow-x-auto overflow-y-auto" : "overflow-x-auto"}`}
      >
        <table className="w-full min-w-[320px] border-collapse text-left text-[12px]">
          <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-semibold">구분</th>
              <th className="px-2 py-1.5 text-right font-semibold">건수</th>
              <th className="px-2 py-1.5 text-right font-semibold">비중</th>
              <th className="px-2 py-1.5 text-right font-semibold">완료</th>
              <th className="px-2 py-1.5 text-right font-semibold">평균진척</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-50">
                <td className="max-w-[8rem] truncate px-2 py-1.5 font-medium text-slate-800">
                  {row.label}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(row.count)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                  {fmtPct(row.sharePct)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                  {fmtNum(row.completed)} ({fmtPct(row.completedPct)})
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                  {row.avgProgressPct != null ? fmtPct(row.avgProgressPct) : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-slate-400">
                  데이터 없음
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProgressTable({ rows }: { rows: DevStatusProgressBucketRow[] }) {
  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
        진척율 구간
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[240px] border-collapse text-left text-[12px]">
          <thead className="bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-semibold">구간</th>
              <th className="px-2 py-1.5 text-right font-semibold">건수</th>
              <th className="px-2 py-1.5 text-right font-semibold">비중</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-50">
                <td className="px-2 py-1.5 font-medium text-slate-800">{row.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(row.count)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtPct(row.sharePct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SystemDevStatusDashboardPanel({
  year,
  summary,
}: {
  year: number;
  summary: SystemDevStatusDashboardSummary;
}) {
  return (
    <CasCard className="shrink-0 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-slate-800">{year}년 대시보드</h2>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="전체" value={fmtNum(summary.total)} />
        <KpiCard label="완료(100%)" value={fmtNum(summary.completed)} />
        <KpiCard label="진행중" value={fmtNum(summary.inProgress)} />
        <KpiCard label="미착수·미입력" value={fmtNum(summary.notStarted)} />
        <KpiCard
          label="평균 진척율"
          value={
            summary.avgProgressPct != null ? fmtPct(summary.avgProgressPct) : "—"
          }
        />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <GroupTable title="SYSTEM별" rows={summary.bySystem} scroll />
        <GroupTable title="업무별" rows={summary.byWorkArea} scroll />
        <GroupTable title="기능구분별" rows={summary.byFeatureType} scroll />
        <ProgressTable rows={summary.byProgress} />
      </div>
    </CasCard>
  );
}
