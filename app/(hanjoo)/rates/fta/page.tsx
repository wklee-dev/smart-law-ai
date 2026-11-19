"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { CoCodePanel } from "@/hanjoo/components/co-code-panel";
import { Button } from "@/hanjoo/components/ui/Button";
import { PageHeader } from "@/hanjoo/components/ui/PageHeader";
import type { CoForm } from "@/hanjoo/lib/fta-co-codes";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import {
  formatFtaGeneral,
  markerLabel,
  type GeneralView,
  type PrincipleItem,
} from "@/hanjoo/lib/fta-general-format";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Nation = { code: string; nameKo: string; nameEn: string; psrKey: string };
type Chapter = { code: string; nameKo: string; nameEn: string };
type OriginRow = {
  id: number;
  hs: string;
  division: string;
  nameKo: string;
  nameEn: string;
  ruleKo: string;
  ruleEn: string;
};
type RateRow = {
  hs: string;
  division: string;
  name: string;
  baseYear: string;
  baseRate: string;
  hasYears: boolean;
};
type YearRate = { year: string; rate: string };
type AgreementRow = {
  code: string;
  name: string;
  countries: string;
  certificate: string;
  criterion: string;
  effect: string;
  treatyUrl: string;
};

type Tab = "general" | "agreements" | "origin" | "rates" | "abbr";

/** 세율·원산지 탭. 다시 보이려면 true. */
const SHOW_FTA_DETAIL_TABS = false;

export default function FtaRatePage() {
  return (
    <AppShellClient>
      <Suspense>
        <FtaRates />
      </Suspense>
    </AppShellClient>
  );
}

function FtaRates() {
  const router = useRouter();
  const search = useSearchParams();
  const partner = search.get("code") ?? "";
  const [nations, setNations] = useState<Nation[]>([]);
  const [nation, setNation] = useState("");
  const [partners, setPartners] = useState<AgreementRow[]>([]);
  const [tab, setTab] = useState<Tab>("general");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapter, setChapter] = useState("");
  const [hs, setHs] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [originRows, setOriginRows] = useState<OriginRow[]>([]);
  const [rateRows, setRateRows] = useState<RateRow[]>([]);
  const [years, setYears] = useState<YearRate[]>([]);
  const [yearHs, setYearHs] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selected = nations.find((n) => n.code === nation);

  async function load(next: { nation?: string; tab?: Tab; chapter?: string; hs?: string; page?: number }) {
    const qNation = next.nation ?? nation;
    const qTab = next.tab ?? tab;
    const qChapter = next.chapter ?? chapter;
    const qHs = next.hs ?? hs;
    const qPage = next.page ?? 1;
    if (!qNation) return;
    setLoading(true);
    setErr(null);
    setYears([]);
    setYearHs("");
    const sp = new URLSearchParams({
      part: qTab,
      nation: qNation,
      chapter: qChapter,
      hs: qHs,
      page: String(qPage),
    });
    try {
      const res = await fetch(`/api/rates/fta?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        chapters?: Chapter[];
        rows?: OriginRow[] | RateRow[];
        total?: number;
        page?: number;
      };
      if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
      setChapters(data.chapters ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? qPage);
      if (qTab === "origin") {
        setOriginRows((data.rows as OriginRow[]) ?? []);
        setRateRows([]);
      } else {
        setRateRows((data.rows as RateRow[]) ?? []);
        setOriginRows([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const [nationRes, agreementRes] = await Promise.all([
          fetch("/api/rates/fta?part=nations"),
          fetch("/api/rates/fta?part=agreements"),
        ]);
        const data = (await nationRes.json()) as { ok?: boolean; error?: string; nations?: Nation[] };
        const agreements = (await agreementRes.json()) as { ok?: boolean; error?: string; rows?: AgreementRow[] };
        if (!data.ok) throw new Error(data.error || "국가 목록을 불러오지 못했습니다.");
        if (!agreements.ok) throw new Error(agreements.error || "협정국 목록을 불러오지 못했습니다.");
        setPartners(agreements.rows ?? []);
        const list = data.nations ?? [];
        setNations(list);
        const first = list.find((n) => n.code === "CL")?.code ?? list[0]?.code ?? "";
        setNation(first);
        setLoading(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickNation(code: string) {
    setNation(code);
    setChapter("");
    setHs("");
    void load({ nation: code, chapter: "", hs: "", page: 1 });
  }

  function openPartner(code: string) {
    router.push(`/rates/fta?code=${encodeURIComponent(code)}`);
  }

  function pickTab(next: Tab) {
    if (partner) router.push("/rates/fta");
    setTab(next);
    if (next === "abbr" || next === "agreements" || next === "general") return;
    setChapter("");
    void load({ tab: next, chapter: "", page: 1 });
  }

  function pickChapter(code: string) {
    setChapter(code);
    void load({ chapter: code, page: 1 });
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setChapter("");
    void load({ chapter: "", page: 1 });
  }

  async function openYears(row: RateRow) {
    if (yearHs === row.hs) {
      setYearHs("");
      setYears([]);
      return;
    }
    const res = await fetch(`/api/rates/fta?part=years&nation=${encodeURIComponent(nation)}&hs=${encodeURIComponent(row.hs)}`);
    const data = (await res.json()) as { ok?: boolean; years?: YearRate[] };
    setYearHs(row.hs);
    setYears(data.years ?? []);
  }

  const pages = Math.max(1, Math.ceil(total / 20));
  const showRows = Boolean(chapter || hs.replace(/\D/g, ""));
  const partnerName = partners.find((row) => row.code === partner)?.name ?? "";

  return (
    <div className="fta-rates-ui">
      <PageHeader
        variant="compact"
        title="FTA 협정관세"
        description={partner && partnerName ? partnerName : undefined}
      />

      {partner ? null : (
        <div className="case-tabs fta-list-tabs">
          <button type="button" className={tab === "general" ? "on" : ""} onClick={() => pickTab("general")}>
            일반원칙
          </button>
          <button type="button" className={tab === "agreements" ? "on" : ""} onClick={() => pickTab("agreements")}>
            협정별내용
          </button>
          {SHOW_FTA_DETAIL_TABS ? (
            <>
              <button type="button" className={tab === "rates" ? "on" : ""} onClick={() => pickTab("rates")}>
                협정별세율정보
              </button>
              <button type="button" className={tab === "origin" ? "on" : ""} onClick={() => pickTab("origin")}>
                협정별원산지결정기준
              </button>
              <button type="button" className={tab === "abbr" ? "on" : ""} onClick={() => pickTab("abbr")}>
                원산지결정기준
              </button>
            </>
          ) : null}
        </div>
      )}

      {partner ? (
        <FtaAgreementDetail code={partner} agreements={partners} onPick={openPartner} />
      ) : tab === "general" ? (
        <FtaGeneralPanel />
      ) : tab === "agreements" ? (
        <FtaAgreementPanel rows={partners} onSelect={openPartner} />
      ) : null}

      {SHOW_FTA_DETAIL_TABS && tab !== "abbr" && tab !== "agreements" && tab !== "general" ? (
        <div className="fta-nations">
          {nations.map((n) => (
            <button
              key={n.code}
              type="button"
              className={n.code === nation ? "on" : ""}
              onClick={() => pickNation(n.code)}
            >
              <strong>{n.nameKo}</strong>
              {n.nameEn ? <em>{n.nameEn}</em> : null}
            </button>
          ))}
        </div>
      ) : null}

      {SHOW_FTA_DETAIL_TABS && tab === "abbr" ? (
        <FtaAbbrPanel />
      ) : SHOW_FTA_DETAIL_TABS && (tab === "rates" || tab === "origin") ? (
        <>
          {selected ? (
            <p className="muted">
              {selected.nameKo}
              {selected.nameEn ? ` · ${selected.nameEn}` : ""} ·{" "}
              {tab === "origin" ? "원산지결정기준" : "협정세율"}
            </p>
          ) : null}

          <form className="case-form" onSubmit={onSearch}>
            <label>
              품목번호
              <input value={hs} onChange={(e) => setHs(e.target.value)} placeholder="HS코드" />
            </label>
            <Button type="submit" action="lookup" />
            {chapter || hs ? (
              <button
                type="button"
                className="fta-back"
                onClick={() => {
                  setChapter("");
                  setHs("");
                  void load({ chapter: "", hs: "", page: 1 });
                }}
              >
                류 목록
              </button>
            ) : null}
          </form>

          {err ? <p className="case-err">{err}</p> : null}
          {loading ? <p className="muted">조회 중…</p> : null}

          {!showRows ? (
            <div className="fta-chapters">
              {chapters.map((c) => (
                <button key={c.code} type="button" onClick={() => pickChapter(c.code)}>
                  <b>{c.code}</b>
                  <span>{c.nameKo}</span>
                  {c.nameEn ? <em>{c.nameEn}</em> : null}
                </button>
              ))}
            </div>
          ) : (
            <>
              {!loading ? <p className="muted">총 {total.toLocaleString()}건</p> : null}
              <div className="table-scroll">
                {tab === "origin" ? (
                  <table className="answer-table case-table">
                    <thead>
                      <tr>
                        <th>HS</th>
                        <th>구분</th>
                        <th>품명</th>
                        <th>결정기준</th>
                      </tr>
                    </thead>
                    <tbody>
                      {originRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="muted">
                            {loading ? "" : "조회 결과가 없습니다."}
                          </td>
                        </tr>
                      ) : (
                        originRows.map((row) => (
                          <tr key={row.id}>
                            <td>{row.hs}</td>
                            <td>{row.division}</td>
                            <td className="wrap">
                              {row.nameKo}
                              {row.nameEn ? <div className="muted">{row.nameEn}</div> : null}
                            </td>
                            <td className="wrap guide-clip" title={row.ruleKo}>
                              {row.ruleKo}
                              {row.ruleEn ? <div className="muted">{row.ruleEn}</div> : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="answer-table case-table">
                    <thead>
                      <tr>
                        <th>HS</th>
                        <th>구분</th>
                        <th>품명</th>
                        <th>협정세율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rateRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="muted">
                            {loading ? "" : "조회 결과가 없습니다."}
                          </td>
                        </tr>
                      ) : (
                        rateRows.map((row) => (
                          <tr key={`${row.hs}-${row.division}`}>
                            <td>{row.hs}</td>
                            <td>{row.division}</td>
                            <td className="wrap">{row.name}</td>
                            <td>
                              <button type="button" className="case-link" onClick={() => void openYears(row)}>
                                {row.baseYear ? `${row.baseYear}: ` : ""}
                                {row.baseRate || "연도별"}
                              </button>
                              {yearHs === row.hs && years.length ? (
                                <div className="fta-years">
                                  {years.map((y) => (
                                    <div key={y.year}>
                                      {y.year} {y.rate || "—"}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
              {total > 20 ? (
                <div className="case-pager">
                  <Button
                    type="button"
                    action="prev"
                    size="small"
                    disabled={page <= 1}
                    onClick={() => void load({ page: page - 1 })}
                  />
                  <span>
                    {page} / {pages}
                  </span>
                  <Button
                    type="button"
                    action="next"
                    size="small"
                    disabled={page >= pages}
                    onClick={() => void load({ page: page + 1 })}
                  />
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function FtaGeneralPanel() {
  const [sections, setSections] = useState<{ heading: string; content: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/rates/fta?part=general")
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          sections?: { heading: string; content: string }[];
        };
        if (!data.ok) throw new Error(data.error || "일반원칙을 불러오지 못했습니다.");
        setSections(data.sections ?? []);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">조회 중…</p>;
  if (err) return <p className="case-err">{err}</p>;
  if (sections.length === 0) return <p className="muted">일반원칙 내용이 없습니다.</p>;
  const views = sections.map((section) => formatFtaGeneral(section.heading, section.content));
  return (
    <div className="fta-principle">
      {views.map((view) => (
        <GeneralCard key={`${view.no}-${view.title}`} view={view} />
      ))}
    </div>
  );
}

function GeneralCard({ view }: { view: GeneralView }) {
  return (
    <article className="fta-card">
      <header>
        {view.no ? <span className="no">{view.no}</span> : null}
        <h3>{view.title}</h3>
        {view.kind === "articles" && view.basis ? <span className="basis">{view.basis}</span> : null}
      </header>
      {view.kind === "laws" ? (
        <ul className="fta-laws lines">
          {view.rows.map((row) => (
            <li key={`${row.name}-${row.cite}`}>
              <span>{row.name}</span>
              <em>{row.cite}</em>
            </li>
          ))}
        </ul>
      ) : null}
      {view.kind === "contact" ? (
        <p className="fta-contact">
          <span>{view.org}</span>
          <a href={`tel:${view.phone.replace(/-/g, "")}`}>{view.phone}</a>
        </p>
      ) : null}
      {view.kind === "articles" ? (
        <div className="fta-items">
          {view.items.map((item, index) => (
            <PrincipleNode key={`${item.level}-${item.marker}-${index}`} item={item} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function PrincipleNode({ item }: { item: PrincipleItem }) {
  const label = item.children.length > 0 && item.text.length > 0 && item.text.length <= 20 && !item.text.includes(" ");
  return (
    <div className={`fta-item lv${item.level}`}>
      <div className="fta-line">
        {item.marker ? <span className="fta-mk">{markerLabel(item)}</span> : null}
        <div className="fta-body">
          {item.text ? <ItemText text={item.text} label={label} /> : null}
          {item.cites.length > 0 || item.tags.length > 0 ? (
            <p className="fta-cites">
              {item.cites.map((cite) => (
                <span key={cite}>{cite}</span>
              ))}
              {item.tags.map((tag) => (
                <span className="fta-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </p>
          ) : null}
          {item.notes.map((note) => (
            <p className="fta-note" key={note.text}>
              <span>※</span>
              {richText(note.text)}
              {note.tags.map((tag) => (
                <span className="fta-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </p>
          ))}
          {item.stamp ? (
            <blockquote className="fta-stamp">
              <p>{item.stamp.body}</p>
              {item.stamp.sign ? <p className="sign">{item.stamp.sign}</p> : null}
            </blockquote>
          ) : null}
        </div>
      </div>
      {item.children.length > 0 ? (
        <div className="fta-kids">
          {item.children.map((child, index) => (
            <PrincipleNode key={`${child.level}-${child.marker}-${index}`} item={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ItemText({ text, label }: { text: string; label: boolean }) {
  const statutes = statuteParts(text);
  if (!statutes) {
    return <p className={label ? "fta-label" : undefined}>{richText(text)}</p>;
  }
  return (
    <>
      {statutes.lead ? <p>{richText(statutes.lead)}</p> : null}
      <ul className="fta-statutes">
        {statutes.items.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {statutes.tail ? <p>{richText(statutes.tail)}</p> : null}
    </>
  );
}

function statuteParts(text: string): { lead: string; items: string[]; tail: string } | null {
  const matched = text.match(/제\d+조(?:의\d+)?\([^)]+\)(?:(?:, | 및 )제\d+조(?:의\d+)?\([^)]+\)){2,}/);
  if (!matched || matched.index === undefined) return null;
  const items = matched[0].split(/, | 및 /).map((line) => line.trim()).filter(Boolean);
  if (items.length < 3) return null;
  if (matched[0].includes(" 및 ")) items[items.length - 1] = `및 ${items[items.length - 1]}`;
  return {
    lead: text.slice(0, matched.index).trim(),
    items,
    tail: text.slice(matched.index + matched[0].length).trim(),
  };
}

function richText(text: string) {
  const parts = text.split(/(\([가-힣]{2,3}\))/g);
  return parts.map((part, index) => {
    const chip = part.match(/^\(([가-힣]{2,3})\)$/);
    if (chip) {
      return (
        <span className="fta-chip" key={index}>
          {chip[1]}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

type AgreementDetail = {
  code: string;
  name: string;
  countries: string[];
  effect: string;
  baseYear: string;
  treatyUrl: string;
  certificate: string[];
  criterion: string[];
  sections: { heading: string; content: string }[];
  forms: { kind: string; name: string; url: string }[];
  rateCodes: { code: string; name: string; note: string }[];
  quotas: { item: string; hs: string; name: string; qty: string; agency: string; year: string }[];
  laws: { name: string; href: string }[];
  posts: { title: string; date: string; url: string }[];
};

function FtaAgreementPanel({ rows, onSelect }: { rows: AgreementRow[]; onSelect: (code: string) => void }) {
  return (
    <div className="fta-detail-page">
      <div className="fta-agree-wrap">
        <table className="fta-agree">
          <colgroup>
            <col className="name" />
            <col className="country" />
            <col className="cert" />
            <col className="rule" />
            <col className="date" />
            <col className="treaty" />
          </colgroup>
          <thead>
            <tr>
              <th>구분</th>
              <th>대상국가</th>
              <th>원산지증명서</th>
              <th>원산지결정기준</th>
              <th>발효일자</th>
              <th>협정문</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code}>
                <td>
                  <button type="button" className="fta-pick" onClick={() => onSelect(row.code)}>
                    {row.name}
                  </button>
                </td>
                <td className="country">{row.countries}</td>
                <td className="pre">{row.certificate}</td>
                <td className="pre">{row.criterion}</td>
                <td className="date">{row.effect}</td>
                <td className="treaty">
                  {row.treatyUrl ? <a href={row.treatyUrl}>참조</a> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function quotaSpans(rows: AgreementDetail["quotas"]): number[] {
  const spans = rows.map(() => 1);
  for (let i = 0; i < rows.length; ) {
    let end = i + 1;
    while (end < rows.length && rows[end].item === rows[i].item && rows[end].qty === rows[i].qty) end += 1;
    spans[i] = end - i;
    for (let k = i + 1; k < end; k += 1) spans[k] = 0;
    i = end;
  }
  return spans;
}

type DutyHit = { hs: string; name: string; rate: string; code: string };
type OriginHit = {
  hs: string;
  rule: string;
  detail?: { label: string; content: string }[];
  detailNote?: string;
  co?: CoForm;
};

function DutyLookup({
  code,
  agreements,
  onPick,
  host,
}: {
  code: string;
  agreements: { code: string; name: string }[];
  onPick: (code: string) => void;
  host: HTMLDivElement | null;
}) {
  const [hs, setHs] = useState("");
  const [rows, setRows] = useState<DutyHit[]>([]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const digits = hs.replace(/\D/g, "");
    if (digits.length !== 10) {
      window.alert("HS코드 10단위를 입력하시기 바랍니다.");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      const sp = new URLSearchParams({ part: "duty-item", code, hs: digits });
      const res = await fetch(`/api/rates/fta?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rows?: DutyHit[];
        note?: string;
        found?: boolean;
      };
      if (!data.ok) throw new Error(data.error || "세율을 불러오지 못했습니다.");
      setRows(data.rows ?? []);
      setNote(data.note ?? "");
      if (!data.found) setMsg("관세율표에 해당 세번이 없습니다.");
      else if ((data.rows ?? []).length === 0) setMsg("이 협정의 세율이 없습니다.");
      else setMsg("");
    } catch (err) {
      setRows([]);
      setNote("");
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setRows([]);
    setNote("");
    setMsg("");
  }, [code]);

  const form = (
    <SearchToolbar variant="compact" className="fta-lookup" onSubmit={(e) => void onSubmit(e)}>
      <select value={code} aria-label="협정국" onChange={(e) => onPick(e.target.value)}>
        {agreements.map((row) => (
          <option key={row.code} value={row.code}>
            {row.name}
          </option>
        ))}
      </select>
      <span>HSK</span>
      <input value={hs} onChange={(e) => setHs(e.target.value)} inputMode="numeric" aria-label="HS코드" placeholder="10자리" />
      <Button type="submit" action="lookup" />
    </SearchToolbar>
  );

  return (
    <>
      {host ? createPortal(form, host) : null}
      {loading || msg || rows.length > 0 ? (
        <article className="fta-card">
          {loading ? <p className="muted">조회 중…</p> : null}
          {msg ? <p className="muted">{msg}</p> : null}
          {rows.length > 0 ? (
            <>
              <table className="fta-mini fta-rate-result">
                <colgroup>
                  <col className="hs" />
                  <col className="name" />
                  <col className="rate" />
                  <col className="code" />
                </colgroup>
                <thead>
                  <tr>
                    <th>HS</th>
                    <th>품명</th>
                    <th>세율</th>
                    <th>부호</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.hs}-${row.code}`}>
                      <td className="hs">{row.hs}</td>
                      <td className="name">{row.name}</td>
                      <td className="rate">{row.rate}</td>
                      <td className="code">{row.code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {note ? <p className="fta-foot">※ {note}</p> : null}
            </>
          ) : null}
        </article>
      ) : null}
    </>
  );
}

function OriginLookup({
  code,
  agreements,
  onPick,
  host,
}: {
  code: string;
  agreements: { code: string; name: string }[];
  onPick: (code: string) => void;
  host: HTMLDivElement | null;
}) {
  const [hs, setHs] = useState("");
  const [rows, setRows] = useState<OriginHit[]>([]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<OriginHit | null>(null);

  function clearResult() {
    setRows([]);
    setNote("");
    setMsg("");
    setHs("");
    setPopup(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const digits = hs.replace(/\D/g, "");
    if (![2, 4, 6, 10].includes(digits.length)) {
      window.alert("HS코드는 2자리, 4자리, 6자리 또는 10자리로 입력하시기 바랍니다. (조회는 2자리 류 기준)");
      return;
    }
    setLoading(true);
    setMsg("");
    setPopup(null);
    try {
      const sp = new URLSearchParams({ part: "origin-item", code, hs: digits });
      const res = await fetch(`/api/rates/fta?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rows?: OriginHit[];
        note?: string;
      };
      if (!data.ok) throw new Error(data.error || "원산지결정기준을 불러오지 못했습니다.");
      const next = (data.rows ?? []).filter((row) => row.rule || (row.detail?.length ?? 0) > 0);
      setRows(next);
      setNote(data.note ?? "");
      setMsg(next.length === 0 ? "저장된 원산지결정기준이 없습니다." : "");
    } catch (err) {
      setRows([]);
      setNote("");
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    clearResult();
  }, [code]);

  useEffect(() => {
    if (!popup) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPopup(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup]);

  const form = (
    <SearchToolbar variant="compact" className="fta-lookup" onSubmit={(e) => void onSubmit(e)}>
      <select value={code} aria-label="협정국" onChange={(e) => onPick(e.target.value)}>
        {agreements.map((row) => (
          <option key={row.code} value={row.code}>
            {row.name}
          </option>
        ))}
      </select>
      <span>HSK</span>
      <input value={hs} onChange={(e) => setHs(e.target.value)} inputMode="numeric" aria-label="HS코드" placeholder="2자리(6·10도 가능)" />
      <Button type="submit" action="lookup" />
      {rows.length > 0 || msg ? (
        <Button type="button" action="reset" className="fta-lookup-clear" onClick={clearResult} />
      ) : null}
    </SearchToolbar>
  );

  return (
    <>
      {host ? createPortal(form, host) : null}
      {loading || msg || rows.length > 0 ? (
        <article className="fta-card">
          <header className="fta-result-hd">
            <h3>품목별 원산지결정기준</h3>
            <Button type="button" action="reset" className="fta-result-close" onClick={clearResult} />
          </header>
          {loading ? <p className="muted">조회 중…</p> : null}
          {msg ? <p className="muted">{msg}</p> : null}
          {rows.length > 0 ? (
            <>
              <table className="fta-mini fta-origin-result">
                <colgroup>
                  <col className="hs" />
                  <col className="rule" />
                </colgroup>
                <thead>
                  <tr>
                    <th>HS</th>
                    <th>품목별 원산지결정기준</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.hs}-${row.rule.slice(0, 24)}`}>
                      <td className="code hs">{row.hs}</td>
                      <td className="rule">
                        {row.rule}
                        {row.detail?.length ? (
                          <>
                            {" "}
                            <button type="button" className="fta-ref-link" onClick={() => setPopup(row)}>
                              [참조]
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {note ? <p className="fta-foot">{note.startsWith("※") ? note : `※ ${note}`}</p> : null}
            </>
          ) : null}
        </article>
      ) : null}
      {popup?.detail?.length ? (
        <div className="fta-dialog-back" role="presentation" onClick={() => setPopup(null)}>
          <div
            className="fta-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fta-origin-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2 id="fta-origin-dialog-title">원산지결정기준 — HS {popup.hs}</h2>
              <Button type="button" action="close" size="small" onClick={() => setPopup(null)} />
            </header>
            <table className="fta-mini fta-origin-detail-table">
              <thead>
                <tr>
                  <th>구분</th>
                  <th>내용</th>
                </tr>
              </thead>
              <tbody>
                {popup.detail.map((item, index) => (
                  <tr key={`${item.label}-${index}`}>
                    <td className="label">{item.label}</td>
                    <td className="content">{item.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {popup.detailNote ? <p className="fta-foot">※ {popup.detailNote}</p> : null}
            <CoCodePanel co={popup.co} rule={popup.rule} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function FtaAgreementDetail({
  code,
  agreements,
  onPick,
}: {
  code: string;
  agreements: { code: string; name: string }[];
  onPick: (code: string) => void;
}) {
  const [detail, setDetail] = useState<AgreementDetail | null>(null);
  const [pane, setPane] = useState<"duty" | "origin">("duty");
  const [lookupHost, setLookupHost] = useState<HTMLDivElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setErr(null);
    setDetail(null);
    void fetch(`/api/rates/fta?part=detail&code=${encodeURIComponent(code)}`)
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: string; detail?: AgreementDetail };
        if (cancel) return;
        if (!data.ok || !data.detail) throw new Error(data.error || "협정 정보를 불러오지 못했습니다.");
        setDetail(data.detail);
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
  }, [code]);

  if (loading) return <p className="muted">조회 중…</p>;
  if (err) return <p className="case-err">{err}</p>;
  if (!detail) return null;
  const choices = agreements.some((row) => row.code === detail.code)
    ? agreements
    : [{ code: detail.code, name: detail.name }, ...agreements];
  const agencies = [...new Set(detail.quotas.map((row) => row.agency).filter(Boolean))];
  const spans = quotaSpans(detail.quotas);
  return (
    <div className="fta-detail">
      <div className="fta-pane-bar">
        <div className="case-tabs">
          <button type="button" className={pane === "duty" ? "on" : ""} onClick={() => setPane("duty")}>
            협정관세율
          </button>
          <button type="button" className={pane === "origin" ? "on" : ""} onClick={() => setPane("origin")}>
            원산지결정기준
          </button>
        </div>
        <div className="fta-lookup-host" ref={setLookupHost} />
      </div>
      {pane === "duty" ? (
        <div className="fta-duty-pane">
          <DutyLookup code={detail.code} agreements={choices} onPick={onPick} host={lookupHost} />
          <article className="fta-card">
            <header>
              <h3>적용대상</h3>
            </header>
            <ul className="fta-laws pairs">
              <li>
                <span>협정</span>
                <em>{detail.name}</em>
              </li>
              <li>
                <span>대상국가</span>
                <em>{detail.countries.join(", ")}</em>
              </li>
              {detail.effect ? (
                <li>
                  <span>발효일</span>
                  <em>{detail.effect}</em>
                </li>
              ) : null}
              {detail.treatyUrl ? (
                <li>
                  <span>협정문</span>
                  <em>
                    <a href={detail.treatyUrl}>참조</a>
                  </em>
                </li>
              ) : null}
            </ul>
          </article>
          {detail.laws.length > 0 || detail.certificate.length > 0 || detail.forms.length > 0 ? (
            <div className="fta-duty-grid">
              {detail.laws.length > 0 ? (
                <article className="fta-card">
                  <header>
                    <h3>적용법령</h3>
                  </header>
                  <ul className="fta-laws">
                    {detail.laws.map((law) => (
                      <li key={law.name}>
                        <a href={law.href}>{law.name}</a>
                      </li>
                    ))}
                  </ul>
                </article>
              ) : null}
              {detail.certificate.length > 0 || detail.forms.length > 0 ? (
                <article className="fta-card">
                  <header>
                    <h3>원산지증명서</h3>
                  </header>
                  {detail.certificate.length > 0 ? (
                    <ul className="fta-bullets">
                      {detail.certificate.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  {detail.forms.length > 0 ? (
                    <ul className="fta-laws">
                      {detail.forms.map((form) => (
                        <li key={form.url}>
                          <span>{form.kind || "서식"}</span>
                          <em>
                            <a href={form.url} target="_blank" rel="noopener noreferrer">
                              {form.name || "파일"}
                            </a>
                          </em>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ) : null}
            </div>
          ) : null}
          {detail.rateCodes.length > 0 ? (
            <article className="fta-card">
              <header>
                <h3>세율부호</h3>
              </header>
              <div className="table-scroll">
                <table className="fta-mini">
                  <thead>
                    <tr>
                      <th>부호</th>
                      <th>내용</th>
                      <th>설명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.rateCodes.map((rate) => (
                      <tr key={rate.code}>
                        <td className="code">{rate.code}</td>
                        <td>{rate.name}</td>
                        <td>{rate.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}
          {detail.quotas.length > 0 ? (
            <article className="fta-card">
              <header>
                <h3>협정관세율 협정수량</h3>
                {agencies.length === 1 ? <span className="basis">{agencies[0]}</span> : null}
              </header>
              <div className="table-scroll">
                <table className="fta-mini">
                  <thead>
                    <tr>
                      <th>품목</th>
                      <th>HS</th>
                      <th>품명</th>
                      <th>적용물량</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.quotas.map((row, index) => (
                      <tr key={`${row.item}-${row.hs}`}>
                        {spans[index] > 0 ? <td rowSpan={spans[index]}>{row.item}</td> : null}
                        <td>{row.hs}</td>
                        <td>{row.name}</td>
                        {spans[index] > 0 ? <td rowSpan={spans[index]}>{row.qty}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}
          {detail.posts.length > 0 ? (
            <article className="fta-card">
              <header>
                <h3>관련 자료</h3>
              </header>
              <ul className="fta-laws">
                {detail.posts.map((post) => (
                  <li key={`${post.title}-${post.date}`}>
                    {post.url ? (
                      <a href={post.url} target="_blank" rel="noopener noreferrer">
                        {post.title}
                      </a>
                    ) : (
                      <span>{post.title}</span>
                    )}
                    {post.date ? <em>{post.date}</em> : null}
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      ) : (
        <div className="fta-origin-pane">
          <OriginLookup code={detail.code} agreements={choices} onPick={onPick} host={lookupHost} />
          <article className="fta-card">
            <header>
              <h3>원산지결정기준</h3>
            </header>
            {detail.criterion.length > 0 ? (
              <ul className="fta-bullets">
                {detail.criterion.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {detail.sections.map((section) => (
              <section key={section.heading} className="fta-stored">
                <h4>{section.heading}</h4>
                <p>{section.content}</p>
              </section>
            ))}
            {detail.criterion.length === 0 && detail.sections.length === 0 ? (
              <p className="muted">저장된 원산지결정기준이 없습니다.</p>
            ) : null}
          </article>
        </div>
      )}
    </div>
  );
}

type AbbrAgreement = { code: string; name: string };
type AbbrRow = {
  id: number;
  year: string;
  agreement: string;
  hs: string;
  name4: string;
  name6: string;
  rule: string;
  abbr: string;
};

function FtaAbbrPanel() {
  const [years, setYears] = useState<string[]>([]);
  const [agreements, setAgreements] = useState<AbbrAgreement[]>([]);
  const [year, setYear] = useState("");
  const [agreement, setAgreement] = useState("");
  const [hs, setHs] = useState("");
  const [recent, setRecent] = useState(true);
  const [suggest, setSuggest] = useState<string[]>([]);
  const [rows, setRows] = useState<AbbrRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetch("/api/rates/fta-abbr?part=meta")
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          years?: string[];
          agreements?: AbbrAgreement[];
        };
        if (!data.ok) throw new Error(data.error || "기준 정보를 불러오지 못했습니다.");
        setYears(data.years ?? []);
        setAgreements(data.agreements ?? []);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    const digits = hs.replace(/\D/g, "");
    if (digits.length < 2 || digits.length >= 6) {
      setSuggest([]);
      return;
    }
    const timer = setTimeout(() => {
      void fetch(`/api/rates/fta-abbr?part=suggest&q=${encodeURIComponent(digits)}`)
        .then(async (res) => {
          const data = (await res.json()) as { items?: string[] };
          setSuggest(data.items ?? []);
        })
        .catch(() => setSuggest([]));
    }, 150);
    return () => clearTimeout(timer);
  }, [hs]);

  async function run(nextPage: number) {
    setLoading(true);
    setErr(null);
    setSearched(true);
    const sp = new URLSearchParams({
      part: "search",
      year,
      agreement,
      hs,
      recent: recent ? "1" : "0",
      page: String(nextPage),
    });
    try {
      const res = await fetch(`/api/rates/fta-abbr?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rows?: AbbrRow[];
        total?: number;
        page?: number;
      };
      if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? nextPage);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(1);
  }

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <>
      <form className="case-form" onSubmit={onSubmit}>
        <label>
          기준년도
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">전체</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          적용협정
          <select value={agreement} onChange={(e) => setAgreement(e.target.value)}>
            <option value="">전체</option>
            {agreements.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="abbr-hs">
          세번
          <input
            value={hs}
            inputMode="numeric"
            maxLength={6}
            placeholder="2자리↑"
            onChange={(e) => setHs(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          {suggest.length > 0 && hs.replace(/\D/g, "").length < 6 ? (
            <ul className="abbr-suggest">
              {suggest.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => setHs(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </label>
        <label>
          <input type="checkbox" checked={recent} onChange={(e) => setRecent(e.target.checked)} />
          최근기준년도
        </label>
        <Button type="submit" action="lookup" />
      </form>
      {err ? <p className="case-err">{err}</p> : null}
      {loading ? <p className="muted">조회 중…</p> : searched ? <p className="muted">총 {total.toLocaleString()}건</p> : null}
      <div className="table-scroll">
        <table className="answer-table case-table">
          <thead>
            <tr>
              <th>번호</th>
              <th>기준년도</th>
              <th>적용협정</th>
              <th>세번</th>
              <th>4단위 품명</th>
              <th>6단위 품명</th>
              <th>품목별 기준</th>
              <th>확인서 약어표</th>
            </tr>
          </thead>
          <tbody>
            {!searched ? (
              <tr>
                <td colSpan={8} className="muted">
                  기준년도·적용협정·세번을 선택한 뒤 검색하세요.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  {loading ? "" : "검색 결과가 없습니다."}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.id}>
                  <td>{(page - 1) * 20 + i + 1}</td>
                  <td>{row.year}</td>
                  <td>{row.agreement}</td>
                  <td>{row.hs}</td>
                  <td className="wrap">{row.name4}</td>
                  <td className="wrap">{row.name6}</td>
                  <td className="wrap guide-clip">{row.rule}</td>
                  <td className="wrap">{row.abbr}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {searched && total > 20 ? (
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
