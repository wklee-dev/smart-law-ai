"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { FormEvent, useEffect, useState } from "react";

type Row = {
  id: string;
  name: string;
  category: string;
  typeName: string;
  jurisdiction: string;
  enforcementDate: string;
  promulgationDate: string;
  revision: string;
};

type Detail = Row & { body: string };

const TABS = [
  { code: "", label: "전체" },
  { code: "A01", label: "법률" },
  { code: "A02", label: "시행령" },
  { code: "A03", label: "시행규칙" },
];

export default function LatestLawsPage() {
  return (
    <AppShellClient>
      <LatestLaws />
    </AppShellClient>
  );
}

function LatestLaws() {
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [q, setQ] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function run(
    nextPage: number,
    next: { type?: string; category?: string; jurisdiction?: string; q?: string } = {},
  ) {
    const query = { type, category, jurisdiction, q, ...next };
    setLoading(true);
    setErr(null);
    setDetail(null);
    const sp = new URLSearchParams({
      type: query.type,
      category: query.category,
      jurisdiction: query.jurisdiction,
      q: query.q,
      page: String(nextPage),
    });
    try {
      const res = await fetch(`/api/laws/latest?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rows?: Row[];
        total?: number;
        page?: number;
        categories?: string[];
        jurisdictions?: string[];
        counts?: Record<string, number>;
      };
      if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? nextPage);
      setCategories(data.categories ?? []);
      setJurisdictions(data.jurisdictions ?? []);
      setCounts(data.counts ?? {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void run(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(1);
  }

  function resetForm() {
    setCategory("");
    setJurisdiction("");
    setQ("");
    void run(1, { category: "", jurisdiction: "", q: "" });
  }

  async function openDetail(id: string) {
    const res = await fetch(`/api/laws/latest?id=${encodeURIComponent(id)}`);
    const data = (await res.json()) as { ok?: boolean; error?: string; row?: Detail };
    if (!data.ok || !data.row) {
      setErr(data.error || "상세를 열 수 없습니다.");
      return;
    }
    setDetail(data.row);
  }

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="panel">
      <div className="panel-hd">최근개정법령</div>
      <div className="panel-bd case-page">
        <SearchToolbar variant="panel" onSubmit={onSubmit}>
          <label>
            분야
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">전체</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            소관부처
            <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
              <option value="">전체</option>
              {jurisdictions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            법령명
            <input value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <Button type="submit" action="lookup" />
          <Button type="button" action="reset" onClick={resetForm} />
        </SearchToolbar>
        <div className="case-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={type === tab.code ? "on" : ""}
              onClick={() => {
                setType(tab.code);
                void run(1, { type: tab.code });
              }}
            >
              {tab.label}
              {counts[tab.code] != null ? ` (${counts[tab.code].toLocaleString()})` : ""}
            </button>
          ))}
        </div>
        {err ? <p className="case-err">{err}</p> : null}
        {loading ? <p className="muted">조회 중…</p> : <p className="muted">총 {total.toLocaleString()}건</p>}
        <div className="table-scroll">
          <table className="answer-table case-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>법령명</th>
                <th>분야</th>
                <th>종류</th>
                <th>소관부처명</th>
                <th>시행일자</th>
                <th>공포일자</th>
                <th>제개정구분</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    {loading ? "" : "조회 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={row.id}>
                    <td>{(page - 1) * 20 + i + 1}</td>
                    <td className="wrap">
                      <button type="button" className="case-link" onClick={() => void openDetail(row.id)}>
                        {row.name}
                      </button>
                    </td>
                    <td>{row.category}</td>
                    <td>{row.typeName}</td>
                    <td>{row.jurisdiction}</td>
                    <td>{row.enforcementDate}</td>
                    <td>{row.promulgationDate}</td>
                    <td>{row.revision}</td>
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
        {detail ? (
          <section className="case-detail">
            <h3>{detail.name}</h3>
            <p className="muted">
              {detail.category} · {detail.typeName} · {detail.jurisdiction} · 시행 {detail.enforcementDate} · 공포{" "}
              {detail.promulgationDate} · {detail.revision}
            </p>
            <p className="pre">{detail.body || "본문이 없습니다."}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
