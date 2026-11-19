"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { GuidelineOverview } from "@/hanjoo/components/guideline-overview";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { FormEvent, useEffect, useState } from "react";

type Row = {
  id: number;
  hs_sgn: string;
  item_name: string;
  document_name: string;
  law_name: string;
  start_dt: string;
  end_dt: string;
  imex_name: string;
};

export default function CustomsChiefPage() {
  return (
    <AppShellClient>
      <GuidelineOverview code="customs-chief" fallbackTitle="세관장확인" />
    </AppShellClient>
  );
}

function CustomsChief({ title = "세관장확인" }: { title?: string }) {
  const [hs, setHs] = useState("");
  const [imex, setImex] = useState("");
  const [doc, setDoc] = useState("");
  const [law, setLaw] = useState("");
  const [history, setHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function run(nextPage: number, nextHistory = history) {
    setLoading(true);
    setErr(null);
    const sp = new URLSearchParams({
      hs,
      imex,
      doc,
      law,
      history: nextHistory ? "1" : "0",
      page: String(nextPage),
    });
    try {
      const res = await fetch(`/api/guidelines/customs-chief?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rows?: Row[];
        total?: number;
        page?: number;
      };
      if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
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
    void run(1, false);
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
            품목번호
            <input value={hs} onChange={(e) => setHs(e.target.value)} />
          </label>
          <label>
            수출입구분
            <select value={imex} onChange={(e) => setImex(e.target.value)}>
              <option value="">전체</option>
              <option value="E">수출</option>
              <option value="I">수입</option>
            </select>
          </label>
          <label>
            요건확인 서류명
            <input value={doc} onChange={(e) => setDoc(e.target.value)} />
          </label>
          <label>
            관련법령
            <input value={law} onChange={(e) => setLaw(e.target.value)} />
          </label>
          <label className="guide-check">
            <input
              type="checkbox"
              checked={history}
              onChange={(e) => setHistory(e.target.checked)}
            />
            과거 이력 포함
          </label>
          <Button type="submit" action="lookup" />
        </SearchToolbar>
        {err ? <p className="case-err">{err}</p> : null}
        {loading ? <p className="muted">조회 중…</p> : <p className="muted">총 {total.toLocaleString()}건</p>}
        <div className="table-scroll">
          <table className="answer-table case-table">
            <thead>
              <tr>
                <th>품목번호</th>
                <th>품명</th>
                <th>요건확인 서류명</th>
                <th>관련법령</th>
                <th>적용시작</th>
                <th>적용종료</th>
                <th>수출입구분</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    {loading ? "" : "조회 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.hs_sgn}</td>
                    <td className="wrap">{row.item_name}</td>
                    <td className="wrap">{row.document_name}</td>
                    <td className="wrap">{row.law_name}</td>
                    <td>{row.start_dt}</td>
                    <td>{row.end_dt}</td>
                    <td>{row.imex_name}</td>
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
