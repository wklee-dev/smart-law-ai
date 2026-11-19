"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { DOMESTIC_BUCKETS } from "@/hanjoo/lib/case-buckets";
import { FormEvent, useState } from "react";

type Row = {
  id: number;
  committee_name: string;
  reff_no: string;
  enfr_dt: string;
  cstm_nm: string;
  dtrm_hs_sgn: string;
  cmdt_nm: string;
  imge_cnt: number;
};

type Detail = Row & {
  cmdt_desc: string;
  dtrm_rsn_cn: string;
  imageIds: number[];
};

const TABS = [{ code: "", label: "전체" }, ...DOMESTIC_BUCKETS];
const PAGE_SIZE = 10;

export default function DomesticCasesPage() {
  return (
    <AppShellClient>
      <DomesticCases />
    </AppShellClient>
  );
}

function DomesticCases() {
  const [bucket, setBucket] = useState("");
  const [reff, setReff] = useState("");
  const [hs, setHs] = useState("");
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [hint, setHint] = useState("시행일, 참조번호, 결정세번, 품명, 검색어 중 하나 이상을 입력하세요.");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);

  async function run(nextPage: number, nextBucket = bucket) {
    setLoading(true);
    setErr(null);
    setDetail(null);
    const sp = new URLSearchParams({
      bucket: nextBucket,
      reff,
      hs,
      name,
      q,
      from,
      to,
      page: String(nextPage),
      pageSize: String(PAGE_SIZE),
    });
    try {
      const res = await fetch(`/api/cases/domestic?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        needQuery?: boolean;
        rows?: Row[];
        total?: number;
        page?: number;
        pageSize?: number;
      };
      if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? nextPage);
      setHint(
        data.needQuery ? "시행일, 참조번호, 결정세번, 품명, 검색어 중 하나 이상을 입력하세요." : "",
      );
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
    setReff("");
    setHs("");
    setName("");
    setQ("");
    setFrom("");
    setTo("");
    setRows([]);
    setTotal(0);
    setPage(1);
    setDetail(null);
    setHint("시행일, 참조번호, 결정세번, 품명, 검색어 중 하나 이상을 입력하세요.");
  }

  async function openDetail(id: number) {
    setErr(null);
    const res = await fetch(`/api/cases/domestic?id=${id}`);
    const data = (await res.json()) as { ok?: boolean; error?: string; row?: Detail };
    if (!data.ok || !data.row) {
      setErr(data.error || "상세를 열 수 없습니다.");
      return;
    }
    setDetail(data.row);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="panel">
      <div className="panel-hd">품목분류 국내사례</div>
      <div className="panel-bd case-page">
        <div className="case-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={bucket === tab.code ? "on" : ""}
              onClick={() => {
                setBucket(tab.code);
                if (reff || hs || name || q || from || to) void run(1, tab.code);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <SearchToolbar variant="panel" onSubmit={onSubmit}>
          <label>
            시행일
            <span className="sl-search-date-range">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="시행 시작일" />
              <em>~</em>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="시행 종료일" />
            </span>
          </label>
          <label>
            참조번호
            <input value={reff} onChange={(e) => setReff(e.target.value)} />
          </label>
          <label>
            결정세번
            <input value={hs} onChange={(e) => setHs(e.target.value)} placeholder="6106.20-1000" />
          </label>
          <label>
            품명
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            검색어
            <input value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <Button type="submit" action="lookup" />
          <Button type="button" action="reset" onClick={resetForm} />
        </SearchToolbar>
        {err ? <p className="case-err">{err}</p> : null}
        {hint ? <p className="muted">{hint}</p> : null}
        {loading ? <p className="muted">조회 중…</p> : null}
        {!hint && !loading ? (
          <p className="muted case-list-meta">
            <span>총 {total.toLocaleString()}건</span>
            <span>페이지당 {PAGE_SIZE}</span>
          </p>
        ) : null}
        <div className="table-scroll">
          <table className="answer-table case-table">
            <thead>
              <tr>
                <th>시행일자</th>
                <th>시행기관</th>
                <th>참조번호</th>
                <th>결정세번</th>
                <th>이미지</th>
                <th>품명</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    {hint ? "" : "조회 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.enfr_dt || "—"}</td>
                    <td>{row.cstm_nm || row.committee_name || "—"}</td>
                    <td>
                      <button type="button" className="case-link" onClick={() => void openDetail(row.id)}>
                        {row.reff_no || "보기"}
                      </button>
                    </td>
                    <td>{row.dtrm_hs_sgn || "—"}</td>
                    <td>{row.imge_cnt || 0}</td>
                    <td className="wrap">{row.cmdt_nm || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > PAGE_SIZE ? (
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
              {detail.reff_no || "사례"} · {detail.dtrm_hs_sgn}
            </h3>
            <p>
              {detail.committee_name} · {detail.enfr_dt} · {detail.cstm_nm}
            </p>
            <h4>품명</h4>
            <p className="pre">{detail.cmdt_nm}</p>
            <h4>물품설명</h4>
            <p className="pre">{detail.cmdt_desc || "—"}</p>
            <h4>결정사유</h4>
            <p className="pre">{detail.dtrm_rsn_cn || "—"}</p>
            {detail.imageIds.length ? (
              <div className="case-images">
                {detail.imageIds.map((id) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={id} src={`/api/tariff/domestic-image?id=${id}`} alt="" />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
