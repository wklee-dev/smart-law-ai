"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { FOREIGN_BUCKETS } from "@/hanjoo/lib/case-buckets";
import { FormEvent, useState } from "react";

type Row = {
  id: number;
  srno: string;
  country: string;
  country_code: string;
  enforce_date: string;
  ref_no: string;
  hs_code: string;
  image_count: number;
  preview: string;
};

type Detail = {
  id: number;
  base_year: string;
  country: string;
  country_code: string;
  ref_no: string;
  enforce_date: string;
  hs_code: string;
  goods_name: string;
  goods_desc: string;
  material: string;
  purpose: string;
  reason: string;
  issue_place: string;
  keyword: string;
  image_count: number;
  imageIds: number[];
};

const PAGE_SIZE = 10;

const DETAIL_FIELDS: { key: keyof Detail; label: string }[] = [
  { key: "base_year", label: "기준년도" },
  { key: "ref_no", label: "참조번호" },
  { key: "enforce_date", label: "등록일자" },
  { key: "hs_code", label: "결정세번" },
  { key: "goods_name", label: "품명" },
  { key: "goods_desc", label: "품명설명" },
  { key: "material", label: "재질성분" },
  { key: "purpose", label: "용도" },
  { key: "reason", label: "결정사유" },
  { key: "issue_place", label: "이슈장소" },
  { key: "keyword", label: "키워드" },
];

export default function ForeignCasesPage() {
  return (
    <AppShellClient>
      <ForeignCases />
    </AppShellClient>
  );
}

function ForeignCases() {
  const [bucket, setBucket] = useState("");
  const [ref, setRef] = useState("");
  const [hs, setHs] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [hint, setHint] = useState("");
  const [searched, setSearched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  async function run(
    nextPage: number,
    next: { bucket?: string; ref?: string; hs?: string; q?: string; from?: string; to?: string } = {},
  ) {
    const query = {
      bucket,
      ref,
      hs,
      q,
      from,
      to,
      ...next,
    };
    setLoading(true);
    setErr(null);
    setDetail(null);
    setSelectedId(null);
    const sp = new URLSearchParams({
      bucket: query.bucket,
      ref: query.ref,
      hs: query.hs,
      q: query.q,
      from: query.from,
      to: query.to,
      page: String(nextPage),
      pageSize: String(PAGE_SIZE),
    });
    try {
      const res = await fetch(`/api/cases/foreign?${sp}`);
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
      setSearched(true);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? nextPage);
      setHint(data.needQuery ? "시행일자, 참조번호, 결정세번, 검색어 중 하나 이상을 입력하세요." : "");
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
    setRef("");
    setHs("");
    setQ("");
    setFrom("");
    setTo("");
    setRows([]);
    setTotal(0);
    setPage(1);
    setDetail(null);
    setSelectedId(null);
    setErr(null);
    setHint("");
    setSearched(false);
  }

  function pickBucket(code: string) {
    setBucket(code);
    if (searched) void run(1, { bucket: code });
  }

  async function openDetail(id: number) {
    setErr(null);
    setSelectedId(id);
    const res = await fetch(`/api/cases/foreign?id=${id}`);
    const data = (await res.json()) as { ok?: boolean; error?: string; row?: Detail };
    if (!data.ok || !data.row) {
      setErr(data.error || "상세를 열 수 없습니다.");
      setDetail(null);
      return;
    }
    setDetail(data.row);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="panel">
      <div className="panel-hd">품목분류 외국사례</div>
      <div className="panel-bd case-page">
        <div className="foreign-tabs">
          <button type="button" className={bucket === "" ? "on" : ""} onClick={() => pickBucket("")}>
            전체
          </button>
          {FOREIGN_BUCKETS.map((b) => (
            <button
              key={b.code}
              type="button"
              className={bucket === b.code ? "on" : ""}
              onClick={() => pickBucket(b.code)}
            >
              {b.label}
            </button>
          ))}
        </div>
        <SearchToolbar variant="panel" onSubmit={onSubmit}>
          <label>
            시행일자
            <span className="sl-search-date-range">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="시행 시작일" />
              <em>~</em>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="시행 종료일" />
            </span>
          </label>
          <label>
            참조번호
            <input value={ref} onChange={(e) => setRef(e.target.value)} />
          </label>
          <label>
            결정세번
            <input value={hs} onChange={(e) => setHs(e.target.value)} />
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
        {searched && !hint && !loading ? (
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
                  <th>국가</th>
                  <th>등록일자</th>
                  <th>참조번호</th>
                  <th>결정세번</th>
                  <th>이미지건수</th>
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
                    <tr key={row.id} className={selectedId === row.id ? "on" : undefined}>
                      <td>{row.country || row.country_code || "—"}</td>
                      <td>{row.enforce_date || "—"}</td>
                      <td>
                        <button type="button" className="case-link" onClick={() => void openDetail(row.id)}>
                          {row.ref_no || "보기"}
                        </button>
                      </td>
                      <td>{row.hs_code || "—"}</td>
                      <td>{row.image_count}</td>
                      <td className="wrap">{row.preview || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
        {searched && total > PAGE_SIZE ? (
          <div className="case-pager">
            <Button type="button" action="prev" size="small" disabled={page <= 1} onClick={() => void run(page - 1)} />
            <span>
              {page} / {pages}
            </span>
            <Button type="button" action="next" size="small" disabled={page >= pages} onClick={() => void run(page + 1)} />
          </div>
        ) : null}
        {detail ? (
          <section className="case-detail foreign-case-detail">
            <h3>
              {detail.country || "사례"} · {detail.ref_no || "—"} · {detail.hs_code || ""}
            </h3>
            <table className="fta-mini fta-origin-detail-table foreign-detail-table">
              <tbody>
                {DETAIL_FIELDS.map(({ key, label }) => {
                  const value = String(detail[key] ?? "").trim();
                  if (!value) return null;
                  return (
                    <tr key={key}>
                      <td className="label">{label}</td>
                      <td className="content pre">{value}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="label">관련 이미지</td>
                  <td className="content">
                    {detail.imageIds.length ? (
                      <div className="case-images">
                        {detail.imageIds.map((imgId) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={imgId} src={`/api/cases/foreign-image?id=${imgId}`} alt="" />
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="fta-foot">
              ※ 외국 품목분류 사례는 참고용이며, 법적 효력이 있는 유권해석이 아닙니다.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
