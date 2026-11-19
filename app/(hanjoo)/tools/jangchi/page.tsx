"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { FormEvent, useEffect, useState } from "react";

type Row = {
  code: string;
  name: string;
  customs: string;
  importDept: string;
  exportDept: string;
  extraTax: string;
  address: string;
};

export default function JangchiPage() {
  return (
    <AppShellClient>
      <Jangchi />
    </AppShellClient>
  );
}

function Jangchi() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [customs, setCustoms] = useState("");
  const [applied, setApplied] = useState({ code: "", name: "", customs: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const sp = new URLSearchParams({
      code: applied.code,
      name: applied.name,
      customs: applied.customs,
      page: String(page),
      pageSize: String(pageSize),
    });
    void fetch(`/api/tools/jangchi?${sp}`)
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: string; rows?: Row[]; total?: number; page?: number };
        if (cancel) return;
        if (!data.ok) throw new Error(data.error || "장치장부호를 불러오지 못했습니다.");
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
        setErr(null);
      })
      .catch((e: unknown) => {
        if (!cancel) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [applied, page, pageSize]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setApplied({ code: code.trim(), name: name.trim(), customs: customs.trim() });
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="panel">
      <div className="panel-hd">장치장부호</div>
      <div className="panel-bd case-page">
        <SearchToolbar variant="panel" onSubmit={onSubmit}>
          <label>
            부호
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label>
            장치장명
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            세관
            <input value={customs} onChange={(e) => setCustoms(e.target.value)} />
          </label>
          <Button type="submit" action="lookup" />
          <Button
            type="button"
            action="reset"
            onClick={() => {
              setCode("");
              setName("");
              setCustoms("");
              setApplied({ code: "", name: "", customs: "" });
              setPage(1);
            }}
          />
        </SearchToolbar>
        {err ? <p className="case-err">{err}</p> : null}
        <div className="stat-tools">
          <p className="muted">전체 {total.toLocaleString()}건</p>
          <select
            value={pageSize}
            aria-label="목록 개수"
            onChange={(e) => {
              setPage(1);
              setPageSize(Number(e.target.value));
            }}
          >
            {[20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table className="answer-table case-table">
            <thead>
              <tr>
                <th>부호</th>
                <th>장치장명</th>
                <th>세관</th>
                <th>수입과</th>
                <th>수출과</th>
                <th>가산세</th>
                <th>주소</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="muted">
                    조회 중…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    조회 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={`${row.code}-${row.name}`}>
                    <td>{row.code}</td>
                    <td className="wrap">{row.name}</td>
                    <td>{row.customs}</td>
                    <td>{row.importDept}</td>
                    <td>{row.exportDept}</td>
                    <td>{row.extraTax}</td>
                    <td className="wrap">{row.address}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 ? (
          <div className="case-pager">
            <Button type="button" action="prev" size="small" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} />
            <span>
              {page} / {pages}
            </span>
            <Button type="button" action="next" size="small" disabled={page >= pages} onClick={() => setPage((n) => n + 1)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
