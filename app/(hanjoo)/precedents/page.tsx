"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { FormEvent, useEffect, useState } from "react";

type Row = {
  id: string;
  caseNo: string;
  title: string;
  trialType: string;
  issueClass: string;
  decisionDate: string;
  agency: string;
};

type Detail = Row & {
  sections: { label: string; text: string }[];
  laws: { name: string; content: string }[];
  hs: { code: string; name: string }[];
};

const TABS = [
  { code: "", label: "전체" },
  { code: "과세전적부심사", label: "과세전적부심사" },
  { code: "심사청구", label: "심사청구" },
  { code: "심판청구", label: "심판청구" },
];

export default function PrecedentsPage() {
  return (
    <AppShellClient>
      <Precedents />
    </AppShellClient>
  );
}

function Precedents() {
  const [tab, setTab] = useState("");
  const [caseNo, setCaseNo] = useState("");
  const [title, setTitle] = useState("");
  const [issue, setIssue] = useState("");
  const [agency, setAgency] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [agencies, setAgencies] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function run(
    nextPage: number,
    next: { tab?: string; caseNo?: string; title?: string; issue?: string; agency?: string } = {},
  ) {
    const query = { tab, caseNo, title, issue, agency, ...next };
    setLoading(true);
    setErr(null);
    setDetail(null);
    const sp = new URLSearchParams({
      tab: query.tab,
      caseNo: query.caseNo,
      title: query.title,
      issue: query.issue,
      agency: query.agency,
      page: String(nextPage),
    });
    try {
      const res = await fetch(`/api/precedents?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rows?: Row[];
        total?: number;
        page?: number;
        issues?: string[];
        agencies?: string[];
        counts?: Record<string, number>;
      };
      if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? nextPage);
      setIssues(data.issues ?? []);
      setAgencies(data.agencies ?? []);
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
    setCaseNo("");
    setTitle("");
    setIssue("");
    setAgency("");
    void run(1, { caseNo: "", title: "", issue: "", agency: "" });
  }

  async function openDetail(id: string) {
    const res = await fetch(`/api/precedents?id=${encodeURIComponent(id)}`);
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
      <div className="panel-hd">판례·예규</div>
      <div className="panel-bd case-page">
        <SearchToolbar variant="panel" onSubmit={onSubmit}>
          <label>
            사건번호
            <input value={caseNo} onChange={(e) => setCaseNo(e.target.value)} placeholder="예: 관세청-적부심사-2025-45" />
          </label>
          <label>
            결정서제목
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="결정서 제목 키워드" />
          </label>
          <label>
            쟁점분류
            <select value={issue} onChange={(e) => setIssue(e.target.value)}>
              <option value="">전체</option>
              {issues.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            처분청
            <select value={agency} onChange={(e) => setAgency(e.target.value)}>
              <option value="">전체</option>
              {agencies.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" action="lookup" />
          <Button type="button" action="reset" onClick={resetForm} />
        </SearchToolbar>
        <div className="case-tabs">
          {TABS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={tab === item.code ? "on" : ""}
              onClick={() => {
                setTab(item.code);
                void run(1, { tab: item.code });
              }}
            >
              {item.label}
              {counts[item.code] != null ? ` (${counts[item.code].toLocaleString()})` : ""}
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
                <th>심판유형</th>
                <th>사건번호</th>
                <th>결정서제목</th>
                <th>쟁점분류</th>
                <th>결정일자</th>
                <th>처분청</th>
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
                rows.map((row, i) => (
                  <tr key={row.id}>
                    <td>{(page - 1) * 20 + i + 1}</td>
                    <td>{row.trialType}</td>
                    <td>
                      <button type="button" className="case-link" onClick={() => void openDetail(row.id)}>
                        {row.caseNo}
                      </button>
                    </td>
                    <td className="wrap">{row.title}</td>
                    <td>{row.issueClass}</td>
                    <td>{row.decisionDate}</td>
                    <td>{row.agency}</td>
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
            <h3>
              {detail.caseNo} · {detail.title}
            </h3>
            <p className="muted">
              {detail.trialType} · {detail.issueClass} · {detail.decisionDate} · {detail.agency}
            </p>
            {detail.sections.map((s) => (
              <div key={s.label}>
                <h4>{s.label}</h4>
                <p className="pre">{s.text}</p>
              </div>
            ))}
            {detail.laws.length ? (
              <div>
                <h4>관련법령</h4>
                {detail.laws.map((law) => (
                  <p key={law.name} className="pre">
                    {law.name}
                    {law.content ? `\n${law.content}` : ""}
                  </p>
                ))}
              </div>
            ) : null}
            {detail.hs.length ? (
              <div>
                <h4>관련 HS</h4>
                <ul className="panel-list">
                  {detail.hs.map((item) => (
                    <li key={`${item.code}-${item.name}`}>
                      {item.code} {item.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
