"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { GuidelineOverview } from "@/hanjoo/components/guideline-overview";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { FormEvent, useEffect, useState } from "react";

type Notice = { key: string; label: string };
type Row = {
  key: string;
  hs_code: string;
  item_name: string;
  guidance: string;
  imex_type_name: string;
};

const TYPES = [
  { value: "", label: "전체" },
  { value: "01", label: "수출금지" },
  { value: "02", label: "수출제한" },
  { value: "03", label: "수입제한" },
];

export default function ImexNoticePage() {
  return (
    <AppShellClient>
      <GuidelineOverview code="imex" fallbackTitle="수출입공고" />
    </AppShellClient>
  );
}

function ImexNotice() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [notice, setNotice] = useState("");
  const [hs, setHs] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function run(nextPage: number, nextNotice = notice) {
    setLoading(true);
    setErr(null);
    const sp = new URLSearchParams({
      notice: nextNotice,
      hs,
      type,
      q,
      page: String(nextPage),
    });
    try {
      const res = await fetch(`/api/guidelines/imex?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        notices?: Notice[];
        notice?: string;
        rows?: Row[];
        total?: number;
        page?: number;
      };
      if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
      setNotices(data.notices ?? []);
      setNotice(data.notice ?? nextNotice);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? nextPage);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void run(1, "");
    // 최신 발령번호로 첫 목록을 연다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(1);
  }

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="panel">
      <div className="panel-hd">수출입공고</div>
      <div className="panel-bd case-page">
        <SearchToolbar variant="panel" onSubmit={onSubmit}>
          <label>
            발령번호
            <select
              value={notice}
              onChange={(e) => {
                setNotice(e.target.value);
                void run(1, e.target.value);
              }}
            >
              {notices.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            품목번호
            <input value={hs} onChange={(e) => setHs(e.target.value)} placeholder="0101.21-1000" />
          </label>
          <label>
            수출입구분
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.label} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            수출입요령
            <input value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <Button type="submit" action="lookup" />
        </SearchToolbar>
        {err ? <p className="case-err">{err}</p> : null}
        {loading ? <p className="muted">조회 중…</p> : <p className="muted">총 {total.toLocaleString()}건</p>}
        <div className="table-scroll">
          <table className="answer-table case-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>품목번호</th>
                <th>품명</th>
                <th>수출입요령</th>
                <th>수출입구분</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    {loading ? "" : "조회 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={row.key}>
                    <td>{(page - 1) * 20 + i + 1}</td>
                    <td>{row.hs_code}</td>
                    <td className="wrap">{row.item_name}</td>
                    <td className="wrap guide-clip" title={row.guidance}>
                      {row.guidance}
                    </td>
                    <td>{row.imex_type_name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > 20 ? (
          <div className="case-pager">
            <Button type="button" action="prev" size="small" disabled={page <= 1} onClick={() => void run(page - 1)} />
            <span>
              {page} / {pages}
            </span>
            <Button type="button" action="next" size="small" disabled={page >= pages} onClick={() => void run(page + 1)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
