"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { FormEvent, useState } from "react";

type Row = {
  id: number;
  userId: string;
  userName: string;
  menuLabel: string;
  menuPath: string;
  href: string;
  source: string;
  ip: string;
  createdAt: string;
};

const PAGE_SIZE = 20;

export default function MenuAccessHistoryPage() {
  return (
    <AppShellClient>
      <MenuAccessHistory />
    </AppShellClient>
  );
}

function MenuAccessHistory() {
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [label, setLabel] = useState("");
  const [path, setPath] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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
      label,
      path,
      from,
      to,
      page: String(nextPage),
      pageSize: String(PAGE_SIZE),
    });
    try {
      const res = await fetch(`/api/admin/menu-access-history?${sp}`);
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
    setLabel("");
    setPath("");
    setFrom("");
    setTo("");
    setRows([]);
    setTotal(0);
    setPage(1);
    setSearched(false);
    setErr(null);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="panel">
      <div className="panel-hd">메뉴 접속기록</div>
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
            메뉴명
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label>
            경로
            <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/rates/fta" />
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
                  <th>메뉴명</th>
                  <th>경로</th>
                  <th>구분</th>
                  <th>IP</th>
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
                      <td>{row.menuLabel || "—"}</td>
                      <td className="wrap">{row.menuPath || row.href || "—"}</td>
                      <td>{row.source === "page" ? "화면이동" : "메뉴클릭"}</td>
                      <td>{row.ip || "—"}</td>
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
