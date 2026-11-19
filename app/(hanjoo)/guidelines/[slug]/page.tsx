"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const PAGES: Record<string, { title: string; kind: "body" | "origin" | "guide" | "hs-spec" | "std-code" }> = {
  origin: { title: "원산지", kind: "origin" },
  ipr: { title: "지식재산권", kind: "body" },
  "inter-korean": { title: "남북한교역", kind: "guide" },
  strategic: { title: "전략물자", kind: "guide" },
  "des-guide": { title: "품명·규격 작성기준", kind: "guide" },
  "hs-spec": { title: "물품규격 적정기준", kind: "hs-spec" },
  "std-code": { title: "표준품명/규격코드", kind: "std-code" },
};

type Body = { title: string; html: string; text: string; sourceUrl: string };
type Section = { key: string; name: string };
type OriginBlock =
  | { kind: "p"; text: string }
  | { kind: "note"; text: string }
  | { kind: "list"; style?: "number" | "korean"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][]; rowSpans?: number[] };
type OriginChapter = { title: string; blocks: OriginBlock[] };
type OriginPage = {
  key: string;
  name: string;
  title: string;
  chapters: OriginChapter[];
  showMarkingSearch?: boolean;
};
type GuidePage = {
  slug: string;
  title: string;
  showSearch?: boolean;
  chapters: OriginChapter[];
};
type StrategicHit = { code: string; text: string };
type MarkingRow = { hs: string; target: string; method: string };
type HsRow = { hs: string; name: string; registeredAt: string };
type HsDetail = HsRow & { fields: { label: string; text: string }[] };
type StdRow = {
  id: number;
  seq: number;
  stdCode: string;
  hs: string;
  itemName: string;
  stdName: string;
  spec: string;
};

export default function GuidelineExtraPage() {
  return (
    <AppShellClient>
      <Extra />
    </AppShellClient>
  );
}

function Extra() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const page = PAGES[slug];
  if (!page) {
    return (
      <div className="panel">
        <div className="panel-hd">수출입요령</div>
        <div className="panel-bd">
          <p className="case-err">메뉴가 없습니다.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="panel-hd">{page.title}</div>
      <div className="panel-bd case-page">
        {page.kind === "body" ? <ContentView slug={slug} /> : null}
        {page.kind === "guide" ? <GuideView slug={slug} /> : null}
        {page.kind === "origin" ? <OriginView /> : null}
        {page.kind === "hs-spec" ? <HsSpecView /> : null}
        {page.kind === "std-code" ? <StdCodeView /> : null}
      </div>
    </div>
  );
}

function HtmlBody({ html, text }: { html?: string; text?: string }) {
  if (html) return <div className="notice-html" dangerouslySetInnerHTML={{ __html: html }} />;
  if (text) return <p className="pre">{text}</p>;
  return <p className="muted">내용이 없습니다.</p>;
}

function ContentView({ slug }: { slug: string }) {
  const [row, setRow] = useState<Body | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    void fetch(`/api/guidelines/extra?kind=body&slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: string; row?: Body };
        if (cancel) return;
        if (!data.ok || !data.row) throw new Error(data.error || "조회에 실패했습니다.");
        setRow(data.row);
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
  }, [slug]);

  if (loading) return <p className="muted">조회 중…</p>;
  if (err) return <p className="case-err">{err}</p>;
  return (
    <>
      {row?.sourceUrl ? (
        <p className="muted">
          <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">
            원본
          </a>
        </p>
      ) : null}
      <HtmlBody html={row?.html} text={row?.text} />
    </>
  );
}

function GuideView({ slug }: { slug: string }) {
  const [row, setRow] = useState<GuidePage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    void fetch(`/api/guidelines/extra?kind=guide&slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: string; row?: GuidePage };
        if (cancel) return;
        if (!data.ok || !data.row) throw new Error(data.error || "내용을 불러오지 못했습니다.");
        setRow(data.row);
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
  }, [slug]);

  if (loading) return <p className="muted">조회 중…</p>;
  if (err) return <p className="case-err">{err}</p>;
  if (!row) return null;
  return (
    <div className="approval-exemption origin-ciel-page">
      {row.showSearch ? <StrategicSearch /> : null}
      {row.chapters.map((chapter) => (
        <section key={chapter.title} className="approval-section">
          <h3>{chapter.title}</h3>
          {chapter.blocks.map((block, index) => (
            <OriginBlockView key={`${chapter.title}-${index}`} block={block} />
          ))}
        </section>
      ))}
    </div>
  );
}

function StrategicSearch() {
  const [field, setField] = useState("control");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<StrategicHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(nextField = field, nextQ = q) {
    const query = nextQ.trim();
    if (!query) {
      setRows(null);
      setTotal(0);
      return;
    }
    setLoading(true);
    setErr(null);
    const sp = new URLSearchParams({ kind: "strategic-search", field: nextField, q: query });
    try {
      const res = await fetch(`/api/guidelines/extra?${sp}`);
      const data = (await res.json()) as { ok?: boolean; error?: string; rows?: StrategicHit[]; total?: number };
      if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run();
  }

  return (
    <div className="strategic-search">
      <SearchToolbar variant="panel" onSubmit={onSubmit}>
        <label>
          검색
          <select value={field} onChange={(e) => setField(e.target.value)}>
            <option value="hs">HSK</option>
            <option value="control">통제번호</option>
            <option value="name">품명 및 규격</option>
          </select>
        </label>
        <label>
          검색어
          <input value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Button type="submit" action="lookup" />
      </SearchToolbar>
      {err ? <p className="case-err">{err}</p> : null}
      {loading ? <p className="muted">조회 중…</p> : null}
      {rows ? (
        <div className="table-scroll">
          <table className="answer-table case-table origin-ciel-table origin-strategic-table">
            <colgroup>
              <col className="code" />
              <col className="text" />
            </colgroup>
            <thead>
              <tr>
                <th>통제번호</th>
                <th>전략물자 (이중용도품목·군용물자품목)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((hit) => (
                  <tr key={hit.code}>
                    <td>
                      <button
                        type="button"
                        className="case-link"
                        onClick={() => {
                          setField("control");
                          setQ(hit.code);
                          void run("control", hit.code);
                        }}
                      >
                        {hit.code}
                      </button>
                    </td>
                    <td className="wrap">{hit.text}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="muted">
                    조회결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {total > rows.length ? (
            <p className="muted">
              {total.toLocaleString()}건 중 {rows.length.toLocaleString()}건을 표시합니다.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function OriginView() {
  const search = useSearchParams();
  const wanted = search.get("section") ?? "general";
  const [sections, setSections] = useState<Section[]>([]);
  const [key, setKey] = useState("");
  const [row, setRow] = useState<OriginPage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/guidelines/extra?kind=origin")
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: string; sections?: Section[] };
        if (!data.ok) throw new Error(data.error || "목록을 불러오지 못했습니다.");
        const list = data.sections ?? [];
        setSections(list);
        setKey(list.some((item) => item.key === wanted) ? wanted : (list[0]?.key ?? ""));
        if (list.length === 0) setLoading(false);
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, [wanted]);

  useEffect(() => {
    if (!key) return;
    let cancel = false;
    setLoading(true);
    setErr(null);
    void fetch(`/api/guidelines/extra?kind=origin&key=${encodeURIComponent(key)}`)
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: string; row?: OriginPage };
        if (cancel) return;
        if (!data.ok || !data.row) throw new Error(data.error || "내용을 불러오지 못했습니다.");
        setRow(data.row);
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
  }, [key]);

  return (
    <>
      <div className="case-tabs">
        {sections.map((s) => (
          <Link
            key={s.key}
            href={`/guidelines/origin?section=${encodeURIComponent(s.key)}`}
            className={s.key === key ? "on" : ""}
          >
            {s.name}
          </Link>
        ))}
      </div>
      {err ? <p className="case-err">{err}</p> : null}
      {loading ? <p className="muted">조회 중…</p> : row ? <OriginBody page={row} /> : null}
    </>
  );
}

function OriginBody({ page }: { page: OriginPage }) {
  return (
    <div className="approval-exemption origin-ciel-page">
      {page.chapters.map((chapter) => (
        <section key={chapter.title} className="approval-section">
          <h3>{chapter.title}</h3>
          {chapter.blocks.map((block, index) => (
            <OriginBlockView key={`${chapter.title}-${index}`} block={block} />
          ))}
        </section>
      ))}
      {page.showMarkingSearch ? <OriginMarkingSearch /> : null}
    </div>
  );
}

function OriginBlockView({ block }: { block: OriginBlock }) {
  if (block.kind === "p") return <p>{block.text}</p>;
  if (block.kind === "note") return <p className="origin-note">{block.text}</p>;
  if (block.kind === "list") {
    return (
      <ol className={block.style === "korean" ? "approval-korean" : "approval-numbered"}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }
  const certTable = block.headers[0] === "구분" && block.headers.length === 3;
  const agencyTable = block.headers[1] === "소관품목";
  const contactTable = block.headers[0] === "관련기관";
  const desGuideTable = block.headers[0] === "항목" && block.headers.includes("작성요령");
  const tableClass = certTable
    ? "answer-table case-table origin-ciel-table origin-cert-table"
    : agencyTable
      ? "answer-table case-table origin-ciel-table origin-agency-table"
      : contactTable
        ? "answer-table case-table origin-ciel-table origin-contact-table"
        : desGuideTable
          ? "answer-table case-table origin-ciel-table des-guide-table"
          : "answer-table case-table origin-ciel-table";
  return (
    <div className="table-scroll">
      <table className={tableClass}>
        {certTable ? (
          <colgroup>
            <col className="gubun" />
            <col className="agree" />
            <col className="form" />
          </colgroup>
        ) : null}
        {agencyTable ? (
          <colgroup>
            <col className="gubun" />
            <col className="item" />
            <col className="org" />
            <col className="org" />
          </colgroup>
        ) : null}
        {contactTable ? (
          <colgroup>
            <col className="org" />
            <col className="dept" />
            <col className="tel" />
            <col className="web" />
          </colgroup>
        ) : null}
        {desGuideTable ? (
          <colgroup>
            <col className="des-item" />
            <col className="des-how" />
            <col className="des-ex" />
          </colgroup>
        ) : null}
        <thead>
          <tr>
            {block.headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, col) => {
                const span = block.rowSpans?.[index] ?? 0;
                if (col === 0 && span === 0 && block.rowSpans) return null;
                return (
                  <td
                    key={`${col}-${cell}`}
                    rowSpan={col === 0 && span > 1 ? span : undefined}
                    className={(certTable || agencyTable) && col === 0 ? "origin-gubun" : "wrap"}
                  >
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OriginMarkingSearch() {
  const [hs, setHs] = useState("");
  const [name, setName] = useState("");
  const [applied, setApplied] = useState({ hs: "", name: "" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<MarkingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(nextPage: number, q = applied) {
    setLoading(true);
    setErr(null);
    const sp = new URLSearchParams({
      kind: "origin",
      marking: "1",
      hs: q.hs,
      name: q.name,
      page: String(nextPage),
    });
    try {
      const res = await fetch(`/api/guidelines/extra?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rows?: MarkingRow[];
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = { hs, name };
    setApplied(next);
    void run(1, next);
  }

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <section className="approval-section">
      <h3>물품별 적정표시방법</h3>
      <SearchToolbar variant="panel" onSubmit={onSubmit}>
        <label>
          HS
          <input value={hs} onChange={(e) => setHs(e.target.value)} />
        </label>
        <label>
          품명
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <Button type="submit" action="lookup" />
      </SearchToolbar>
      {err ? <p className="case-err">{err}</p> : null}
      {loading ? <p className="muted">조회 중…</p> : total > 0 ? <p className="muted">총 {total.toLocaleString()}건</p> : null}
      <div className="table-scroll">
        <table className="answer-table case-table">
          <thead>
            <tr>
              <th>HS</th>
              <th>표시대상</th>
              <th>적정표시방법</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted">
                  {loading ? "" : "HS 또는 품명을 입력한 뒤 조회하세요."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.hs}-${row.target}`}>
                  <td>{row.hs}</td>
                  <td className="wrap">{row.target}</td>
                  <td className="wrap">{row.method}</td>
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
    </section>
  );
}

function HsSpecView() {
  const [hs, setHs] = useState("");
  const [name, setName] = useState("");
  const [applied, setApplied] = useState({ hs: "", name: "" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<HsRow[]>([]);
  const [detail, setDetail] = useState<HsDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function run(nextPage: number, q = applied) {
    setLoading(true);
    setErr(null);
    setDetail(null);
    const sp = new URLSearchParams({ kind: "hs-spec", hs: q.hs, name: q.name, page: String(nextPage) });
    try {
      const res = await fetch(`/api/guidelines/extra?${sp}`);
      const data = (await res.json()) as { ok?: boolean; error?: string; rows?: HsRow[]; total?: number; page?: number };
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
    void run(1, { hs: "", name: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDetail(code: string) {
    const res = await fetch(`/api/guidelines/extra?kind=hs-spec&detail=1&hs=${encodeURIComponent(code)}`);
    const data = (await res.json()) as { ok?: boolean; error?: string; row?: HsDetail };
    if (!data.ok || !data.row) {
      setErr(data.error || "상세를 열 수 없습니다.");
      return;
    }
    setDetail(data.row);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = { hs, name };
    setApplied(next);
    void run(1, next);
  }

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <>
      <SearchToolbar variant="panel" onSubmit={onSubmit}>
        <label>
          HS
          <input value={hs} onChange={(e) => setHs(e.target.value)} />
        </label>
        <label>
          품명
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <Button type="submit" action="lookup" />
      </SearchToolbar>
      {err ? <p className="case-err">{err}</p> : null}
      {loading ? <p className="muted">조회 중…</p> : <p className="muted">총 {total.toLocaleString()}건</p>}
      <div className="table-scroll">
        <table className="answer-table case-table">
          <thead>
            <tr>
              <th>번호</th>
              <th>HS</th>
              <th>품명</th>
              <th>등록일자</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  {loading ? "" : "조회 결과가 없습니다."}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.hs}>
                  <td>{(page - 1) * 20 + i + 1}</td>
                  <td>
                    <button type="button" className="case-link" onClick={() => void openDetail(row.hs)}>
                      {row.hs}
                    </button>
                  </td>
                  <td className="wrap">{row.name}</td>
                  <td>{row.registeredAt}</td>
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
            {detail.hs} {detail.name}
          </h3>
          {detail.fields.map((f) => (
            <p key={f.label} className="pre">
              <strong>{f.label}</strong>
              {"\n"}
              {f.text}
            </p>
          ))}
        </section>
      ) : null}
    </>
  );
}

function StdCodeView() {
  const [hs, setHs] = useState("");
  const [name, setName] = useState("");
  const [applied, setApplied] = useState({ hs: "", name: "" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<StdRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function run(nextPage: number, q = applied) {
    if (!q.hs.trim() && !q.name.trim()) {
      setErr("HS 또는 품명을 입력하세요.");
      return;
    }
    setLoading(true);
    setErr(null);
    setSearched(true);
    const sp = new URLSearchParams({ kind: "std-code", hs: q.hs, name: q.name, page: String(nextPage) });
    try {
      const res = await fetch(`/api/guidelines/extra?${sp}`);
      const data = (await res.json()) as { ok?: boolean; error?: string; rows?: StdRow[]; total?: number; page?: number };
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = { hs, name };
    setApplied(next);
    void run(1, next);
  }

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <>
      <SearchToolbar variant="panel" onSubmit={onSubmit}>
        <label>
          HS·표준코드
          <input value={hs} onChange={(e) => setHs(e.target.value)} />
        </label>
        <label>
          품명
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <Button type="submit" action="lookup" />
      </SearchToolbar>
      {err ? <p className="case-err">{err}</p> : null}
      {loading ? <p className="muted">조회 중…</p> : searched ? <p className="muted">총 {total.toLocaleString()}건</p> : (
        <p className="muted">HS 또는 품명을 입력한 뒤 조회하세요.</p>
      )}
      <div className="table-scroll">
        <table className="answer-table case-table">
          <thead>
            <tr>
              <th>번호</th>
              <th>표준코드</th>
              <th>HS</th>
              <th>품명</th>
              <th>표준품명</th>
              <th>규격</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  {searched && !loading ? "조회 결과가 없습니다." : ""}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.id}>
                  <td>{row.seq || (page - 1) * 20 + i + 1}</td>
                  <td>{row.stdCode}</td>
                  <td>{row.hs}</td>
                  <td className="wrap">{row.itemName}</td>
                  <td className="wrap">{row.stdName}</td>
                  <td className="wrap">{row.spec}</td>
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
    </>
  );
}
