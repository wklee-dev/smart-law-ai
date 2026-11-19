"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { FormEvent, useState } from "react";

type Row = {
  id: number;
  userId: string;
  userName: string;
  success: boolean;
  via: string;
  reason: string;
  ip: string;
  userAgent: string;
  createdAt: string;
};

const PAGE_SIZE = 20;

export default function LoginHistoryPage() {
  return (
    <AppShellClient>
      <LoginHistory />
    </AppShellClient>
  );
}

function LoginHistory() {
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [success, setSuccess] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function run(nextPage: number) {
    setLoading(true);
    setErr(null);
    const sp = new URLSearchParams({
      userId,
      userName,
      from,
      to,
      success,
      page: String(nextPage),
      pageSize: String(PAGE_SIZE),
    });
    try {
      const res = await fetch(`/api/admin/login-history?${sp}`);
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
      setSearched(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(1);
  }

  function resetForm() {
    setUserId("");
    setUserName("");
    setFrom("");
    setTo("");
    setSuccess("");
    setRows([]);
    setTotal(0);
    setPage(1);
    setSearched(false);
    setErr(null);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="panel">
      <div className="panel-hd">로그인 기록</div>
      <div className="panel-bd case-page">
        <SearchToolbar variant="panel" onSubmit={onSubmit}>
          <label>
            일시
            <span className="sl-search-date-range">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="시작일" />
              <em>~</em>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="종료일" />
            </span>
          </label>
          <label>
            사용자 ID
            <input value={userId} onChange={(e) => setUserId(e.target.value)} />
          </label>
          <label>
            사용자명
            <input value={userName} onChange={(e) => setUserName(e.target.value)} />
          </label>
          <label>
            결과
            <select value={success} onChange={(e) => setSuccess(e.target.value)} aria-label="로그인 결과">
              <option value="">전체</option>
              <option value="1">성공</option>
              <option value="0">실패</option>
            </select>
          </label>
          <Button type="submit" action="lookup" />
          <Button type="button" action="reset" onClick={resetForm} />
        </SearchToolbar>

        {err ? <p className="case-err">{err}</p> : null}
        {loading ? <p className="muted">조회 중…</p> : null}
        {searched && !loading ? (
          <p className="muted case-list-meta">
            <span>총 {total.toLocaleString()}건</span>
            <span>페이지당 {PAGE_SIZE}</span>
          </p>
        ) : null}

        {searched ? (
          <div className="table-scroll">
            <table className="answer-table case-table">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>사용자 ID</th>
                  <th>사용자명</th>
                  <th>결과</th>
                  <th>방식</th>
                  <th>IP</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      조회 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="nowrap">{row.createdAt}</td>
                      <td>{row.userId}</td>
                      <td>{row.userName || "—"}</td>
                      <td>{row.success ? "성공" : "실패"}</td>
                      <td>{row.via || "—"}</td>
                      <td>{row.ip || "—"}</td>
                      <td className="wrap">{row.reason || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">조건을 입력한 뒤 조회하세요. 조건 없이 조회하면 최근 기록이 표시됩니다.</p>
        )}

        {searched && total > PAGE_SIZE ? (
          <div className="case-pager">
            <Button type="button" action="prev" size="small" disabled={page <= 1} onClick={() => void run(page - 1)} />
            <span>
              {page} / {pages}
            </span>
            <Button
              type="button"
              action="next"
              size="small"
              disabled={page >= pages}
              onClick={() => void run(page + 1)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
