"use client";

import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { FormEvent, useEffect, useState } from "react";

type Notice = { key: string; label: string };
type Row = {
  id: number;
  hs_code: string;
  product_name: string;
  guidance: string;
  law_name: string;
  type_name: string;
};

export function IntegratedNotice({ title = "통합공고" }: { title?: string }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [issue, setIssue] = useState("");
  const [hs, setHs] = useState("");
  const [direction, setDirection] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function run(nextPage: number, nextIssue = issue) {
    setLoading(true);
    setErr(null);
    const sp = new URLSearchParams({
      issue: nextIssue,
      hs,
      direction,
      q,
      page: String(nextPage),
    });
    try {
      const res = await fetch(`/api/guidelines/integrated?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        notices?: Notice[];
        issue?: string;
        rows?: Row[];
        total?: number;
        page?: number;
      };
      if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
      setNotices(data.notices ?? []);
      setIssue(data.issue ?? nextIssue);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(1);
  }

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="panel">
      <div className="panel-hd">{title}</div>
      <div className="panel-bd case-page">
        <SearchToolbar variant="panel" onSubmit={onSubmit}>
          <label>
            발령번호
            <select
              value={issue}
              onChange={(e) => {
                setIssue(e.target.value);
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
            수출입구분
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="">전체</option>
              <option value="11">수출</option>
              <option value="12">수입</option>
            </select>
          </label>
          <label>
            품목번호
            <input value={hs} onChange={(e) => setHs(e.target.value)} />
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
          <table className="answer-table case-table hs-guidance-grid">
            <colgroup>
              <col className="col-number" />
              <col className="col-hs" />
              <col className="col-product" />
              <col className="col-guidance" />
              <col className="col-law" />
              <col className="col-type" />
            </colgroup>
            <thead>
              <tr>
                <th>번호</th>
                <th>품목번호</th>
                <th>품명</th>
                <th>수출입요령</th>
                <th>관련법령</th>
                <th>구분</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    {loading ? "" : "조회 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={row.id}>
                    <td>{(page - 1) * 20 + i + 1}</td>
                    <td>{row.hs_code}</td>
                    <td className="wrap">{row.product_name}</td>
                    <td className="wrap" title={row.guidance}>
                      <span className="guide-clip">{row.guidance}</span>
                    </td>
                    <td className="wrap">{row.law_name}</td>
                    <td>{row.type_name}</td>
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
