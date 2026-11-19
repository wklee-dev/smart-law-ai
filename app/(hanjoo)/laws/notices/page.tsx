"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { FormEvent, useEffect, useState } from "react";

type Row = {
  id: string;
  no: string;
  title: string;
  department: string;
  writtenDate: string;
  files: number;
};

type FileItem = { id: number; name: string; size: number };

type Detail = Row & {
  html: string;
  text: string;
  sourceUrl: string;
  publication: string;
  attachments: FileItem[];
};

function fileSize(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminNoticesPage() {
  return (
    <AppShellClient>
      <AdminNotices />
    </AppShellClient>
  );
}

function AdminNotices() {
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function run(nextPage: number, keyword = applied) {
    setLoading(true);
    setErr(null);
    const sp = new URLSearchParams({ q: keyword, page: String(nextPage) });
    try {
      const res = await fetch(`/api/laws/notices?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rows?: Row[];
        total?: number;
        page?: number;
      };
      if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
      const list = data.rows ?? [];
      setRows(list);
      setTotal(data.total ?? 0);
      setPage(data.page ?? nextPage);
      const keep = list.some((r) => r.id === selected) ? selected : list[0]?.id ?? "";
      setSelected(keep);
      if (!keep) setDetail(null);
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

  useEffect(() => {
    if (!selected) return;
    let cancel = false;
    void fetch(`/api/laws/notices?id=${encodeURIComponent(selected)}`)
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: string; row?: Detail };
        if (cancel) return;
        if (!data.ok || !data.row) throw new Error(data.error || "본문을 열 수 없습니다.");
        setDetail(data.row);
      })
      .catch((e: unknown) => {
        if (!cancel) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancel = true;
    };
  }, [selected]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setApplied(q);
    void run(1, q);
  }

  const pages = Math.max(1, Math.ceil(total / 10));

  return (
    <div className="panel">
      <div className="panel-hd">행정예고</div>
      <div className="panel-bd case-page">
        <SearchToolbar variant="panel" onSubmit={onSubmit}>
          <label>
            제목
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목, 담당부서, 본문" />
          </label>
          <Button type="submit" action="lookup" />
          <Button
            type="button"
            action="reset"
            onClick={() => {
              setQ("");
              setApplied("");
              void run(1, "");
            }}
          />
        </SearchToolbar>
        {err ? <p className="case-err">{err}</p> : null}
        {loading ? <p className="muted">조회 중…</p> : <p className="muted">총 {total.toLocaleString()}건</p>}
        <div className="table-scroll">
          <table className="answer-table case-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>제목</th>
                <th>담당부서</th>
                <th>작성일시</th>
                <th>첨부</th>
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
                rows.map((row) => (
                  <tr key={row.id} className={row.id === selected ? "on" : ""}>
                    <td>{row.no}</td>
                    <td className="wrap">
                      <button type="button" className="case-link" onClick={() => setSelected(row.id)}>
                        {row.title}
                      </button>
                    </td>
                    <td>{row.department}</td>
                    <td>{row.writtenDate}</td>
                    <td>{row.files}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > 10 ? (
          <div className="case-pager">
            <Button type="button" action="prev" size="small" disabled={page <= 1} onClick={() => void run(page - 1)} />
            <span>
              {page} / {pages}
            </span>
            <Button type="button" action="next" size="small" disabled={page >= pages} onClick={() => void run(page + 1)} />
          </div>
        ) : null}
        <section className="case-detail">
          <h3>{detail?.title || "게시글 본문"}</h3>
          {detail ? (
            <p className="muted">
              {[detail.department, detail.writtenDate, detail.publication ? `공고 ${detail.publication}` : ""]
                .filter(Boolean)
                .join(" · ")}
              {detail.sourceUrl ? (
                <>
                  {" · "}
                  <a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">
                    원본
                  </a>
                </>
              ) : null}
            </p>
          ) : (
            <p className="muted">게시글을 선택하세요.</p>
          )}
          {detail?.html ? (
            <div className="notice-html" dangerouslySetInnerHTML={{ __html: detail.html }} />
          ) : detail?.text ? (
            <p className="pre">{detail.text}</p>
          ) : null}
          {detail?.attachments.length ? (
            <ul className="notice-files">
              {detail.attachments.map((f) => (
                <li key={f.id}>
                  <a href={`/api/laws/notices/file?id=${f.id}`}>{f.name}</a>
                  {f.size ? <span className="muted"> {fileSize(f.size)}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </div>
  );
}
