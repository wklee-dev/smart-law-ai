"use client";

import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";

import { useCallback, useEffect, useState } from "react";
import {
  formatLawIdForDisplay,
  normalizeLawIdForStorage,
} from "@/app/shared/law-id";

type Row = {
  id: number;
  law_pk: number;
  law_id_text: string;
  mst: string | null;
  ef_yd: string;
  jo: string;
  hang: string | null;
  ho: string | null;
  mok: string | null;
  source_title: string | null;
  chunk_text_preview: string | null;
  law_chunk_id: number | null;
  requested_url: string | null;
  created_at: string;
};

export default function LawEflawJosubRecordsPage() {
  const [lawId, setLawId] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (lawId.trim()) q.set("lawId", normalizeLawIdForStorage(lawId.trim()));
      q.set("limit", "100");
      const res = await fetch(`/api/law-eflaw-josub/list?${q.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok: boolean;
        items?: Row[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setItems([]);
        setError(data.error || "조회 실패");
        return;
      }
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [lawId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <CasPageHeader title="조항호목 API 저장 이력" />
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="font-medium text-slate-700">법령 ID 필터</span>
              <input
                value={lawId}
                onChange={(e) => setLawId(e.target.value)}
                placeholder="1556 (전체는 비움)"
                className="mt-1 block w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              새로고침
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="p-6 text-sm text-slate-500">불러오는 중…</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">저장된 행이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2">id</th>
                    <th className="border-b border-slate-200 px-3 py-2">법령 ID</th>
                    <th className="border-b border-slate-200 px-3 py-2">시행일</th>
                    <th className="border-b border-slate-200 px-3 py-2">조·항·호·목</th>
                    <th className="border-b border-slate-200 px-3 py-2">제목</th>
                    <th className="border-b border-slate-200 px-3 py-2">chunk</th>
                    <th className="border-b border-slate-200 px-3 py-2">저장 시각</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-2 tabular-nums text-slate-600">{r.id}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {formatLawIdForDisplay(r.law_id_text)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.ef_yd}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.jo}
                        {r.hang ? ` / ${r.hang}` : ""}
                        {r.ho ? ` / ${r.ho}` : ""}
                        {r.mok ? ` / ${r.mok}` : ""}
                      </td>
                      <td className="max-w-md px-3 py-2 text-slate-800">
                        {r.source_title ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums">
                        {r.law_chunk_id ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {r.created_at
                          ? new Date(r.created_at).toLocaleString("ko-KR")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
