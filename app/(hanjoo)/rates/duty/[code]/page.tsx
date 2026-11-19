"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { PageHeader } from "@/hanjoo/components/ui/PageHeader";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { SectionCard } from "@/hanjoo/components/ui/SectionCard";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type Source = { name: string; url: string; db: "있음" | "없음" | "참고"; detail: string };
type KindRow = {
  group: string;
  name: string;
  detail: string;
  condition: string;
  symbol: string;
  law: string;
  href: string;
  missing: boolean;
};
type View = {
  title: string;
  sources: Source[];
  columns: string[];
  rows: Record<string, string>[];
  total: number;
  page: number;
  pageSize: number;
  lawText: string;
  kinds?: KindRow[];
  notes?: { heading: string; text: string }[];
  flexIntro?: string;
  sections?: {
    title: string;
    lines: string[];
    table?: { columns: string[]; rows: string[][] };
    afterLines?: string[];
    formulas?: {
      id?: string;
      kind: "fraction";
      numerator: string;
      denominator:
        | string
        | { kind: "one-plus-fraction"; prefix: string; numerator: string; denominator: string };
      note?: string;
      afterLinePrefix?: string;
    }[];
  }[];
  tailSections?: {
    title: string;
    lines: string[];
    table?: { columns: string[]; rows: string[][] };
    afterLines?: string[];
  }[];
  reductionLinks?: {
    law: string;
    name: string;
    href: string;
    related: { name: string; href: string }[];
  }[];
  tableKind?: "provisional";
  hsQuery?: string;
  searchHs?: boolean;
};

export default function DutyRatePage() {
  return (
    <AppShellClient>
      <DutyRate />
    </AppShellClient>
  );
}

function formulaPlain(
  formula: NonNullable<NonNullable<View["sections"]>[number]["formulas"]>[number],
): string {
  const den = formula.denominator;
  if (typeof den === "string") {
    return `(${formula.numerator}) ÷ ${den}`;
  }
  return `(${formula.numerator}) ÷ [ ${den.prefix} (${den.numerator} ÷ ${den.denominator}) ]`;
}

/** JSP fraction 마크업과 동일: .formula > .fraction > .numerator / .denominator */
function DutyFractionVisual({
  formula,
}: {
  formula: NonNullable<NonNullable<View["sections"]>[number]["formulas"]>[number];
}) {
  const den = formula.denominator;
  return (
    <div className="formula">
      <span className="fraction">
        <span className="numerator">{formula.numerator}</span>
        <span className="denominator">
          {typeof den === "string" ? (
            den
          ) : (
            <>
              {`${den.prefix} `}
              <span className="fraction">
                <span className="numerator">{den.numerator}</span>
                <span className="denominator">{den.denominator}</span>
              </span>
            </>
          )}
        </span>
      </span>
    </div>
  );
}

function DutyFormulaBlock({
  formula,
}: {
  formula: NonNullable<NonNullable<View["sections"]>[number]["formulas"]>[number];
}) {
  return (
    <div className="duty-frac-wrap">
      <table className="duty-frac-table" aria-label="산식">
        <tbody>
          <tr>
            <td className="duty-frac-td-frac">
              <DutyFractionVisual formula={formula} />
            </td>
            <td className="duty-frac-td-plain">{formulaPlain(formula)}</td>
          </tr>
        </tbody>
      </table>
      {formula.note ? <p className="duty-frac-note">{formula.note}</p> : null}
    </div>
  );
}

function SectionBody({
  section,
}: {
  section: NonNullable<View["sections"]>[number];
}) {
  const formulas = section.formulas ?? [];
  if (!formulas.length) {
    return section.lines.length ? <div className="pre">{section.lines.join("\n")}</div> : null;
  }
  const used = new Set<string>();
  return (
    <div className="duty-section-body">
      {section.lines.map((line, index) => {
        const match = formulas.find(
          (f) => f.afterLinePrefix && line.startsWith(f.afterLinePrefix) && !used.has(f.id ?? f.afterLinePrefix),
        );
        if (match) used.add(match.id ?? match.afterLinePrefix ?? String(index));
        return (
          <div key={`${section.title}-L${index}`}>
            <div className="pre">{line}</div>
            {match ? <DutyFormulaBlock formula={match} /> : null}
          </div>
        );
      })}
      {formulas
        .filter((f) => !(f.id ? used.has(f.id) : f.afterLinePrefix && used.has(f.afterLinePrefix)))
        .map((f, i) => (
          <DutyFormulaBlock key={f.id ?? `extra-${i}`} formula={f} />
        ))}
    </div>
  );
}

function DutySectionBlock({
  sections,
}: {
  sections: NonNullable<View["sections"]>;
}) {
  if (!sections.length) return null;
  return (
    <div className="duty-explanation duty-ssg">
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <SectionBody section={section} />
          {section.table ? (
            <div className="table-scroll duty-section-table">
              <table
                className={
                  section.table.columns[0] === "감면물품"
                    ? "answer-table case-table duty-exempt-table"
                    : section.table.columns[0] === "세종"
                      ? "answer-table case-table duty-domestic-table"
                      : section.table.columns[0] === "과세대상" &&
                          section.table.columns.includes("세종부호")
                        ? "answer-table case-table duty-spc-table"
                        : section.table.columns.includes("관련조항") &&
                            section.table.columns.includes("감면부호")
                          ? "answer-table case-table duty-spc-exempt-table"
                          : section.table.columns[0] === "과세표준" &&
                              section.table.columns.includes("기본세율")
                            ? "answer-table case-table duty-tra-table"
                            : section.table.columns[0] === "번호" || section.table.columns[0] === "세번"
                              ? "answer-table case-table duty-simple-rate-table"
                              : section.table.columns[0] === "가족수"
                                ? "answer-table case-table duty-move-qty"
                                : section.table.columns[0] === "구분" &&
                                    section.table.columns.includes("부호") &&
                                    section.table.columns.includes("참조")
                                  ? "answer-table case-table duty-ref-wide"
                                  : section.table.columns[0] === "지역" || section.table.columns[0] === "부호"
                                                    ? "answer-table case-table duty-narrow-first"
                                    : section.table.columns[0] === "분할납부대상"
                                      ? "answer-table case-table duty-installment-pay"
                                      : section.table.columns[0] === "연번" &&
                                          section.table.columns.includes("규격")
                                        ? "answer-table case-table duty-spec-table"
                                        : section.table.columns[0] === "산식"
                                          ? "answer-table case-table duty-formula-table"
                                          : "answer-table case-table"
                }
              >
                {section.table.columns[0] === "감면물품" ? (
                  <colgroup>
                    <col className="ex-item" />
                    <col className="ex-rate" />
                    <col className="ex-code" />
                    <col className="ex-vat" />
                    <col className="ex-agr" />
                    <col className="ex-post" />
                  </colgroup>
                ) : section.table.columns[0] === "세종" ? (
                  <colgroup>
                    <col className="dm-tax" />
                    <col className="dm-base" />
                    <col className="dm-etc" />
                  </colgroup>
                ) : section.table.columns[0] === "과세대상" &&
                  section.table.columns.includes("세종부호") ? (
                  <colgroup>
                    <col className="spc-cat" />
                    <col className="spc-desc" />
                    <col className="spc-rate" />
                    <col className="spc-agr" />
                    <col className="spc-edu" />
                    <col className="spc-code" />
                  </colgroup>
                ) : section.table.columns.includes("관련조항") &&
                  section.table.columns.includes("감면부호") ? (
                  <colgroup>
                    <col className="spe-gubun" />
                    <col className="spe-law" />
                    <col className="spe-item" />
                    <col className="spe-code" />
                  </colgroup>
                ) : section.table.columns[0] === "과세표준" &&
                  section.table.columns.includes("기본세율") ? (
                  <colgroup>
                    <col className="tra-base" />
                    <col className="tra-rate" />
                    <col className="tra-flex" />
                    <col className="tra-agr" />
                    <col className="tra-edu" />
                    <col className="tra-code" />
                  </colgroup>
                ) : section.table.columns[0] === "번호" || section.table.columns[0] === "세번" ? (
                  <colgroup>
                    <col className="sr-no" />
                    <col className="sr-name" />
                    <col className="sr-rate" />
                  </colgroup>
                ) : section.table.columns[0] === "가족수" ? (
                  <colgroup>
                    <col className="mq-family" />
                    <col className="mq-qty" />
                  </colgroup>
                ) : section.table.columns[0] === "분할납부대상" ||
                  (section.table.columns[0] === "연번" && section.table.columns.includes("규격")) ? (
                  <colgroup>
                    {section.table.columns[0] === "연번" ? (
                      <>
                        <col className="sp-no" />
                        <col className="sp-hs" />
                        <col className="sp-name" />
                        <col className="sp-spec" />
                      </>
                    ) : (
                      <>
                        <col className="inst-target" />
                        <col className="inst-pay" />
                      </>
                    )}
                  </colgroup>
                ) : null}
                <thead>
                  <tr>
                    {section.table.columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const cols = section.table!.columns;
                    const useMerge =
                      cols[0] === "세종" ||
                      cols[0] === "번호" ||
                      cols[0] === "세번" ||
                      cols[0] === "과세대상" ||
                      cols[0] === "과세물품" ||
                      cols[0] === "납세의무자" ||
                      cols[0] === "면세내용" ||
                      cols[0] === "과세표준" ||
                      (cols[0] === "구분" && cols.includes("사후관리대상 물품")) ||
                      (cols[0] === "구분" && cols.includes("관련조항"));
                    const asRows = section.table!.rows.map((r) => {
                      const item: Record<string, string> = {};
                      cols.forEach((c, i) => {
                        item[c] = r[i] ?? "";
                      });
                      return item;
                    });
                    const { spans, skip } = useMerge
                      ? buildExemptRowSpans(asRows, cols)
                      : {
                          spans: asRows.map(() => ({}) as Record<string, number>),
                          skip: asRows.map(() => ({}) as Record<string, boolean>),
                        };
                    return asRows.map((row, index) => {
                      const mergeGubun = cols[0] === "구분" && cols.includes("부호");
                      const gubun = section.table!.rows[index]?.[0] ?? "";
                      let gubunSpan = 1;
                      if (mergeGubun) {
                        if (gubun === section.table!.rows[index - 1]?.[0]) gubunSpan = 0;
                        else {
                          while (
                            index + gubunSpan < section.table!.rows.length &&
                            section.table!.rows[index + gubunSpan][0] === gubun
                          ) {
                            gubunSpan += 1;
                          }
                        }
                      }
                      return (
                        <tr key={`${section.title}-${index}`}>
                          {cols.map((head, col) => {
                            const cell = row[head] ?? "";
                            if (useMerge && skip[index]?.[head]) return null;
                            if (mergeGubun && col === 0) {
                              if (gubunSpan <= 0) return null;
                              return (
                                <td
                                  key={`${col}-${cell.slice(0, 12)}`}
                                  className="narrow-col gubun-merge"
                                  rowSpan={gubunSpan}
                                >
                                  {cell}
                                </td>
                              );
                            }
                            const isSpc =
                              cols[0] === "과세대상" && cols.includes("세종부호");
                            const isSpcExempt =
                              cols.includes("관련조항") && cols.includes("감면부호");
                            const isTra =
                              cols[0] === "과세표준" && cols.includes("기본세율");
                            const cls =
                              head === "감면물품"
                                ? "wrap ex-item"
                                : head === "세종"
                                  ? "center dm-tax-cell"
                                  : head === "번호" || head === "세번"
                                    ? "center sr-no-cell"
                                    : isSpc && head === "과세대상"
                                      ? "center spc-cat-cell"
                                      : isSpc && (head === "" || head === "내용" || col === 1)
                                        ? "wrap spc-desc-cell"
                                        : isSpc &&
                                            (head === "세율" ||
                                              head === "농특세" ||
                                              head === "교육세" ||
                                              head === "세종부호")
                                          ? "center spc-num-cell"
                                          : isSpcExempt && (head === "구분" || col === 0)
                                            ? "center spe-gubun-cell"
                                            : isSpcExempt && head === "관련조항"
                                              ? "center spe-law-cell"
                                              : isSpcExempt && head === "감면부호"
                                                ? "center spe-code-cell"
                                                : isSpcExempt
                                                  ? "wrap spe-item-cell"
                                                  : isTra && head === "과세표준"
                                                    ? "wrap tra-base-cell"
                                                    : isTra
                                                      ? "center tra-num-cell"
                                                      : head === "세율" || head === "간이세율"
                                                        ? "center sr-rate-cell"
                                                        : head === "가족수" || head === "이사물품 인정 수량"
                                                          ? "center"
                                                          : head === "감면율" ||
                                                              head === "감면부호" ||
                                                              head === "부가세" ||
                                                              head === "농특세" ||
                                                              head === "사후관리" ||
                                                              head === "부호" ||
                                                              head === "구분" ||
                                                              head === "지역"
                                                            ? "narrow-col center"
                                                            : "wrap";
                            return (
                              <td
                                key={`${col}-${cell.slice(0, 12)}`}
                                className={cls}
                                rowSpan={
                                  useMerge && spans[index]?.[head] > 1 ? spans[index][head] : undefined
                                }
                              >
                                {cell}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          ) : null}
          {section.afterLines?.length ? (
            <div className="pre">{section.afterLines.join("\n")}</div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/** Compact page list: 1 … 4 5 [6] 7 8 … 58 */
function pagerNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current]);
  for (let d = 1; d <= 2; d += 1) {
    set.add(current - d);
    set.add(current + d);
  }
  const sorted = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("…");
    out.push(sorted[i]);
  }
  return out;
}

/** CIEL-style rowspan: empty cells under a filled starter row merge upward. */
function buildExemptRowSpans(rows: Record<string, string>[], columns: string[]) {
  const mergeCols = new Set([
    "감면물품",
    "감면율",
    "부가세",
    "농특세",
    "사후관리",
    "구분",
    "적용국가",
    "세종",
    "기타",
    "번호",
    "세번",
    "세율",
    "간이세율",
    "과세대상",
    "과세물품",
    "납세의무자",
    "면세내용",
    "과세표준",
    "농특세",
    "교육세",
    "세종부호",
  ]);
  const spans: Record<string, number>[] = rows.map(() => ({}));
  const skip: Record<string, boolean>[] = rows.map(() => ({}));
  for (const col of columns) {
    if (!mergeCols.has(col)) continue;
    let i = 0;
    while (i < rows.length) {
      const value = String(rows[i][col] ?? "").trim();
      if (!value) {
        i += 1;
        continue;
      }
      let span = 1;
      while (i + span < rows.length && !String(rows[i + span][col] ?? "").trim()) span += 1;
      spans[i][col] = span;
      for (let k = 1; k < span; k += 1) skip[i + k][col] = true;
      i += span;
    }
  }
  return { spans, skip };
}

type LawArticleBlock = {
  id: string;
  label: string;
  heading: string;
  enforce: string;
  body: string;
};

/** Split existing lawText blocks (`\n\n`) — do not invent article boundaries. */
function parseLawArticles(lawText: string): LawArticleBlock[] {
  return lawText
    .split("\n\n")
    .map((block) => block.trimEnd())
    .filter((block) => block.trim().length > 0)
    .map((block, index) => {
      const lines = block.split("\n");
      const heading = lines[0] ?? "";
      const body = lines.slice(1).join("\n");
      const label = heading.match(/제\d+조(?:의\d+)?/)?.[0] ?? `조문${index + 1}`;
      const enforce = heading.match(/\(시행\s*([^)]+)\)/)?.[1]?.trim() ?? "";
      const idKey = label.replace(/[^0-9의]/g, "") || String(index + 1);
      return {
        id: `duty-law-${idKey}`,
        label,
        heading,
        enforce,
        body,
      };
    });
}

function DutyLawDocumentViewer({
  lawText,
  sources,
}: {
  lawText: string;
  sources: Source[];
}) {
  const articles = parseLawArticles(lawText);
  const [activeId, setActiveId] = useState(articles[0]?.id ?? "");
  const lawSource = sources.find((s) => s.name === "법령 원문");
  const enforceDates = [...new Set(articles.map((a) => a.enforce).filter(Boolean))];

  function jumpTo(id: string) {
    setActiveId(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="duty-law-layout">
      <aside className="duty-law-toc" aria-label="관련 조문">
        <div className="duty-law-toc-hd">관련 조문</div>
        <nav className="duty-law-toc-list">
          {articles.map((art) => (
            <button
              key={art.id}
              type="button"
              className={art.id === activeId ? "on" : undefined}
              onClick={() => jumpTo(art.id)}
            >
              {art.label}
            </button>
          ))}
        </nav>
        {lawSource?.url ? (
          <a className="duty-law-toc-link" href={lawSource.url} target="_blank" rel="noreferrer">
            법령 원문 보기
          </a>
        ) : null}
      </aside>
      <div className="duty-law-doc">
        <div className="duty-law-doc-hd">
          <strong>관세법</strong>
          {enforceDates.length === 1 ? (
            <span className="duty-law-meta">시행 {enforceDates[0]}</span>
          ) : null}
          {articles.length ? (
            <span className="duty-law-meta">
              {articles.map((a) => a.label).join(" · ")}
            </span>
          ) : null}
        </div>
        <div className="duty-law-doc-bd">
          {articles.map((art) => (
            <section key={art.id} id={art.id} className="duty-law-article">
              <h3 className="duty-law-article-hd">{art.heading}</h3>
              <div className="duty-law-article-body">{art.body || art.heading}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function DutyRate() {
  const params = useParams<{ code: string }>();
  const code = params.code ?? "";
  const [page, setPage] = useState(1);
  const [hsInput, setHsInput] = useState("");
  const [hs, setHs] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    setHsInput("");
    setHs("");
  }, [code]);

  useEffect(() => {
    let cancel = false;
    const qs = new URLSearchParams({
      code,
      page: String(page),
    });
    if (hs) qs.set("hs", hs);
    void fetch(`/api/rates/duty?${qs.toString()}`)
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: string } & View;
        if (cancel) return;
        if (!data.ok) throw new Error(data.error || "조회하지 못했습니다.");
        setView(data);
        setErr(null);
        if (data.page && data.page !== page) setPage(data.page);
      })
      .catch((e: unknown) => {
        if (!cancel) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancel = true;
    };
  }, [code, page, hs]);

  const pages = Math.max(1, Math.ceil((view?.total ?? 0) / (view?.pageSize || 30)));
  const modernMode =
    code === "priority"
      ? "priority"
      : code === "kinds"
        ? "kinds"
        : code === "dumping"
          ? "dumping"
          : null;

  function submitHs(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setHs(hsInput.replace(/\D/g, ""));
  }

  const dumpingArticles = view?.lawText && modernMode === "dumping" ? parseLawArticles(view.lawText) : [];
  const dumpingEnforce = [
    ...new Set(dumpingArticles.map((a) => a.enforce).filter(Boolean)),
  ];

  return (
    <div
      className={
        modernMode === "priority"
          ? "duty-modern-ui duty-priority-ui"
          : modernMode === "kinds"
            ? "duty-modern-ui duty-kinds-ui"
            : modernMode === "dumping"
              ? "duty-modern-ui duty-dumping-ui"
              : "panel"
      }
    >
      {modernMode ? (
        <PageHeader
          variant="compact"
          title={
            view?.title ||
            (modernMode === "priority"
              ? "세율적용의 우선순위"
              : modernMode === "kinds"
                ? "관세의종류"
                : "덤핑방지관세")
          }
        >
          {modernMode === "dumping" ? (
            <div className="duty-dumping-meta">
              <span className="duty-dumping-badge">관세법</span>
              {dumpingEnforce.length === 1 ? (
                <span className="duty-dumping-chip">시행 {dumpingEnforce[0]}</span>
              ) : null}
              {dumpingArticles.length ? (
                <span className="duty-dumping-chip">
                  관련조문 {dumpingArticles.map((a) => a.label).join(", ")}
                </span>
              ) : null}
            </div>
          ) : null}
        </PageHeader>
      ) : (
        <div className="panel-hd">{view?.title || "세율"}</div>
      )}
      <div className={modernMode ? undefined : "panel-bd case-page"}>
        {err ? (
          <p className={modernMode ? "duty-modern-err" : "case-err"}>{err}</p>
        ) : null}
        {view ? (
          <>
            {view.flexIntro ? (
              <div className="duty-explanation">
                {view.flexIntro.split("\n\n").map((article, index) => {
                  const [heading, ...body] = article.split("\n");
                  return (
                    <section key={`${heading}-${index}`}>
                      <h3>{heading || "개요"}</h3>
                      <div className="pre">{body.join("\n") || heading}</div>
                    </section>
                  );
                })}
              </div>
            ) : null}
            {view.lawText ? (
              modernMode === "dumping" ? (
                <DutyLawDocumentViewer lawText={view.lawText} sources={view.sources} />
              ) : (
                <div className="duty-explanation">
                  {view.lawText.split("\n\n").map((article, index) => {
                    const [heading, ...body] = article.split("\n");
                    return (
                      <section key={`${heading}-${index}`}>
                        <h3>{heading}</h3>
                        <div>{body.join("\n")}</div>
                      </section>
                    );
                  })}
                </div>
              )
            ) : null}
            {view.sections?.length ? <DutySectionBlock sections={view.sections} /> : null}
            {view.reductionLinks && view.reductionLinks.length > 0 ? (
              <div className="table-scroll">
                <table className="answer-table case-table duty-reduction-kinds">
                  <colgroup>
                    <col className="rd-law" />
                    <col className="rd-name" />
                    <col className="rd-rel" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>근거법령</th>
                      <th>관세감면</th>
                      <th>관련사항</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.reductionLinks.map((link, index, list) => {
                      const span =
                        link.law !== list[index - 1]?.law
                          ? list.filter((item) => item.law === link.law).length
                          : 0;
                      return (
                        <tr key={`${link.href}-${link.name}`}>
                          {span > 0 ? (
                            <td className="kind-group" rowSpan={span}>
                              {link.law}
                            </td>
                          ) : null}
                          <td>
                            <Link href={link.href} className="case-link">
                              {link.name}
                            </Link>
                          </td>
                          <td className="wrap">
                            {link.related.length
                              ? link.related.map((rel, i) => (
                                  <span key={rel.href}>
                                    {i > 0 ? <br /> : null}
                                    <Link href={rel.href} className="case-link">
                                      {rel.name}
                                    </Link>
                                  </span>
                                ))
                              : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {view.kinds && view.kinds.length > 0 ? (
              modernMode === "kinds" ? (
                <SectionCard title="관세의 종류">
                  <div className="table-scroll">
                    <table className="answer-table case-table duty-kinds">
                      <colgroup>
                        <col className="kind-g" />
                        <col className="kind-n" />
                        <col className="kind-d" />
                        <col className="kind-c" />
                        <col className="kind-s" />
                        <col className="kind-l" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>구분</th>
                          <th>관세</th>
                          <th>세부구분</th>
                          <th>적용</th>
                          <th>부호</th>
                          <th>관련법령</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.kinds.map((row, index, list) => {
                          const span =
                            row.group !== list[index - 1]?.group
                              ? list.filter((item) => item.group === row.group).length
                              : 0;
                          return (
                            <tr key={`${row.group}-${row.name}-${row.symbol}-${index}`}>
                              {span > 0 ? (
                                <td className="kind-group" rowSpan={span}>
                                  {row.group}
                                </td>
                              ) : null}
                              <td>
                                {row.href && view.title === "탄력관세" ? (
                                  <Link href={row.href} className="case-link">
                                    {row.name}
                                  </Link>
                                ) : (
                                  row.name
                                )}
                              </td>
                              <td className="wrap">{row.detail}</td>
                              <td className="wrap">{row.condition}</td>
                              <td
                                className={
                                  row.missing ? "duty-missing kind-symbol" : "kind-symbol"
                                }
                              >
                                {row.symbol}
                              </td>
                              <td className="kind-law">{row.law}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              ) : (
              <div className="table-scroll">
                <table className="answer-table case-table duty-kinds">
                  <colgroup>
                    <col className="kind-g" />
                    <col className="kind-n" />
                    <col className="kind-d" />
                    <col className="kind-c" />
                    <col className="kind-s" />
                    <col className="kind-l" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th>관세</th>
                      <th>세부구분</th>
                      <th>적용</th>
                      <th>부호</th>
                      <th>관련법령</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.kinds.map((row, index, list) => {
                      const span = row.group !== list[index - 1]?.group ? list.filter((item) => item.group === row.group).length : 0;
                      return (
                        <tr key={`${row.group}-${row.name}-${row.symbol}-${index}`}>
                          {span > 0 ? (
                            <td className="kind-group" rowSpan={span}>
                              {row.group}
                            </td>
                          ) : null}
                          <td>
                            {row.href && view.title === "탄력관세" ? (
                              <Link href={row.href} className="case-link">
                                {row.name}
                              </Link>
                            ) : (
                              row.name
                            )}
                          </td>
                          <td>{row.detail}</td>
                          <td>{row.condition}</td>
                          <td className={row.missing ? "duty-missing kind-symbol" : "kind-symbol"}>{row.symbol}</td>
                          <td className="kind-law">{row.law}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )
            ) : view.rows.length > 0 || view.searchHs ? (
              <>
                {view.searchHs ? (
                  <SearchToolbar variant="compact" className="duty-hs-search" onSubmit={submitHs}>
                    <label>
                      <select aria-label="조회구분" defaultValue="HSK" disabled>
                        <option value="HSK">HSK</option>
                      </select>
                    </label>
                    <label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={12}
                        placeholder="HS 입력"
                        value={hsInput}
                        onChange={(ev) => setHsInput(ev.target.value)}
                      />
                    </label>
                    <Button type="submit" action="lookup" />
                    {hs ? (
                      <Button
                        type="button"
                        action="reset"
                        onClick={() => {
                          setHsInput("");
                          setHs("");
                          setPage(1);
                        }}
                      />
                    ) : null}
                    {hs ? (
                      <span className="duty-hs-hint">
                        HS {hs} · {view.total.toLocaleString()}건
                      </span>
                    ) : null}
                  </SearchToolbar>
                ) : null}
                {view.rows.length > 0 ? (
                  <>
                    {modernMode === "priority" && view.columns[0] === "순위" ? (
                      <SectionCard title="세율적용 우선순위">
                        <div className="table-scroll">
                          <table className="answer-table case-table duty-priority">
                            <thead>
                              <tr>
                                {view.columns.map((col) => (
                                  <th key={col}>{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {view.rows.map((row, index) => (
                                <tr key={`${row.순위}-${index}`}>
                                  {view.columns.map((col) => (
                                    <td
                                      key={col}
                                      className={
                                        col === "순위"
                                          ? "center"
                                          : col === "세율" || col === "적용"
                                            ? "wrap"
                                            : undefined
                                      }
                                    >
                                      {col === "순위" ? (
                                        <span className="duty-rank-badge">{row[col]}</span>
                                      ) : (
                                        row[col]
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </SectionCard>
                    ) : (
                    <div className={`table-scroll${view.tableKind === "provisional" ? " duty-provisional-wrap" : ""}`}>
                      {view.tableKind === "provisional" ? (
                        <table className="answer-table case-table duty-provisional">
                          <colgroup>
                            <col className="pv-hs1" />
                            <col className="pv-hs2" />
                            <col className="pv-hs3" />
                            <col className="pv-name" />
                            <col className="pv-rate" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th colSpan={3}>HSK</th>
                              <th>품명</th>
                              <th>세율</th>
                            </tr>
                          </thead>
                          <tbody>
                            {view.rows.map((row, index) => (
                              <tr key={`${row.HSK}-${index}`}>
                                <td className="pv-hs">{row.hs1}</td>
                                <td className="pv-hs">{row.hs2}</td>
                                <td className="pv-hs">{row.hs3}</td>
                                <td className="pv-name">{row.품명}</td>
                                <td className="pv-rate">{row.세율}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <table
                          className={
                            view.columns[0] === "순위"
                              ? "answer-table case-table duty-priority"
                              : view.columns[0] === "HSK" && view.columns.includes("기준발동물량")
                                ? "answer-table case-table duty-ssg-table"
                                : view.columns[0] === "감면물품"
                                  ? "answer-table case-table duty-exempt-table"
                                  : view.columns[0] === "구분" && view.columns.includes("적용국가")
                                    ? "answer-table case-table duty-fta-table"
                                    : view.columns[0] === "구분" &&
                                        view.columns.includes("이사자") &&
                                        view.columns.includes("단기체류자")
                                      ? "answer-table case-table duty-move-table"
                                      : view.columns[0] === "종류" && view.columns.includes("비고")
                                        ? "answer-table case-table duty-selfuse-table"
                                        : view.columns[0] === "연번" && view.columns.includes("규격")
                                          ? "answer-table case-table duty-spec-table"
                                          : view.columns[0] === "HS" && view.columns.includes("부호")
                                            ? "answer-table case-table duty-item-table"
                                            : view.columns[0] === "HS" &&
                                                view.columns.includes("용도") &&
                                                view.columns.includes("세율") &&
                                                view.columns.includes("사후관리")
                                              ? "answer-table case-table duty-usage-table"
                                              : view.columns[0] === "HS" &&
                                                  view.columns.includes("간이정액환급")
                                                ? "answer-table case-table duty-simple-refund-table"
                                                : "answer-table case-table"
                          }
                        >
                          {view.columns[0] === "감면물품" ? (
                            <colgroup>
                              <col className="ex-item" />
                              <col className="ex-rate" />
                              <col className="ex-code" />
                              <col className="ex-vat" />
                              <col className="ex-agr" />
                              <col className="ex-post" />
                            </colgroup>
                          ) : view.columns[0] === "구분" && view.columns.includes("적용국가") ? (
                            <colgroup>
                              <col className="fta-gubun" />
                              <col className="fta-desc" />
                              <col className="fta-nation" />
                            </colgroup>
                          ) : view.columns[0] === "구분" &&
                            view.columns.includes("이사자") &&
                            view.columns.includes("단기체류자") ? (
                            <colgroup>
                              <col className="mv-gubun" />
                              <col className="mv-mover" />
                              <col className="mv-short" />
                            </colgroup>
                          ) : view.columns[0] === "종류" && view.columns.includes("비고") ? (
                            <colgroup>
                              <col className="su-kind" />
                              <col className="su-name" />
                              <col className="su-std" />
                              <col className="su-note" />
                            </colgroup>
                          ) : view.columns[0] === "연번" && view.columns.includes("규격") ? (
                            <colgroup>
                              <col className="sp-no" />
                              <col className="sp-hs" />
                              <col className="sp-name" />
                              <col className="sp-spec" />
                            </colgroup>
                          ) : view.columns[0] === "HS" && view.columns.includes("부호") ? (
                            <colgroup>
                              <col className="di-hs" />
                              <col className="di-name" />
                              <col className="di-sym" />
                              <col className="di-rate" />
                              <col className="di-date" />
                              <col className="di-date" />
                            </colgroup>
                          ) : view.columns[0] === "HS" &&
                            view.columns.includes("용도") &&
                            view.columns.includes("세율") &&
                            view.columns.includes("사후관리") ? (
                            <colgroup>
                              <col className="ug-hs" />
                              <col className="ug-name" />
                              <col className="ug-usage" />
                              <col className="ug-rate" />
                              <col className="ug-post" />
                            </colgroup>
                          ) : view.columns[0] === "HS" && view.columns.includes("간이정액환급") ? (
                            <colgroup>
                              <col style={{ width: "132px" }} />
                              <col />
                              <col style={{ width: "220px" }} />
                            </colgroup>
                          ) : null}
                          <thead>
                            <tr>
                              {view.columns.map((col) => (
                                <th key={col}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const useSpan =
                                view.columns[0] === "감면물품" ||
                                (view.columns[0] === "구분" && view.columns.includes("적용국가"));
                              const { spans, skip } = useSpan
                                ? buildExemptRowSpans(view.rows, view.columns)
                                : {
                                    spans: view.rows.map(() => ({}) as Record<string, number>),
                                    skip: view.rows.map(() => ({}) as Record<string, boolean>),
                                  };
                              return view.rows.map((row, index) => (
                                <tr key={`${row.HSK ?? row.HS ?? row.부호 ?? row.감면물품 ?? index}-${index}`}>
                                  {view.columns.map((col) => {
                                    if (skip[index]?.[col]) return null;
                                    const exemptCenter =
                                      col === "감면율" ||
                                      col === "감면부호" ||
                                      col === "부가세" ||
                                      col === "농특세" ||
                                      col === "사후관리" ||
                                      col === "연번" ||
                                      col === "자가사용인정기준";
                                    const moveGubun = col === "구분" && view.columns.includes("이사자");
                                    const ftaGubun = col === "구분" && view.columns.includes("적용국가");
                                    const center =
                                      exemptCenter ||
                                      moveGubun ||
                                      ftaGubun ||
                                      col === "HS" ||
                                      col === "부호" ||
                                      col === "세율" ||
                                      col === "적용시작" ||
                                      col === "적용종료" ||
                                      col === "종류" ||
                                      col === "사후관리" ||
                                      col === "용도";
                                    const wrap =
                                      col === "감면물품" ||
                                      col === "감면율" ||
                                      col === "설명" ||
                                      col === "적용국가" ||
                                      col === "이사자" ||
                                      col === "단기체류자" ||
                                      col === "품명" ||
                                      col === "세율" ||
                                      col === "세율명" ||
                                      col === "적용" ||
                                      col === "규격" ||
                                      col === "비고" ||
                                      col === "종류";
                                    const rateWrap = col === "감면율";
                                    return (
                                      <td
                                        key={col}
                                        rowSpan={spans[index]?.[col] > 1 ? spans[index][col] : undefined}
                                        className={
                                          [
                                            center && col !== "종류" ? "center" : "",
                                            wrap ? "wrap" : "",
                                            col === "감면물품" ? "ex-item" : "",
                                            exemptCenter && !rateWrap ? "narrow-col" : "",
                                            rateWrap ? "ex-rate" : "",
                                            moveGubun ? "mv-gubun-cell" : "",
                                            ftaGubun ? "fta-gubun-cell" : "",
                                            col === "종류" ? "su-kind-cell" : "",
                                            col === "HS" ? "ug-hs-cell" : "",
                                            col === "품명" ? "ug-name-cell" : "",
                                            col === "용도" ? "ug-usage-cell" : "",
                                            col === "세율" ? "ug-rate-cell" : "",
                                            col === "사후관리" ? "ug-post-cell" : "",
                                          ]
                                            .filter(Boolean)
                                            .join(" ") || undefined
                                        }
                                      >
                                        {row[col]}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      )}
                    </div>
                    )}
                    {pages > 1 ? (
                      <div className="case-pager">
                        <Button
                          type="button"
                          action="prev"
                          size="small"
                          disabled={page <= 1}
                          onClick={() => setPage((n) => n - 1)}
                        />
                        <div className="case-pager-nums" aria-label="페이지">
                          {pagerNumbers(page, pages).map((n, i) =>
                            n === "…" ? (
                              <span key={`e-${i}`} className="case-pager-ellipsis">
                                …
                              </span>
                            ) : (
                              <button
                                key={n}
                                type="button"
                                className={n === page ? "is-active" : undefined}
                                aria-current={n === page ? "page" : undefined}
                                onClick={() => setPage(n)}
                              >
                                {n}
                              </button>
                            ),
                          )}
                        </div>
                        <span className="case-pager-meta">
                          {page} / {pages}
                          {view.pageSize ? ` · ${view.pageSize}건` : ""}
                        </span>
                        <Button
                          type="button"
                          action="next"
                          size="small"
                          disabled={page >= pages}
                          onClick={() => setPage((n) => n + 1)}
                        />
                      </div>
                    ) : null}
                  </>
                ) : hs ? (
                  <p className="muted">검색 결과가 없습니다.</p>
                ) : null}
              </>
            ) : null}
            {view.tailSections?.length ? <DutySectionBlock sections={view.tailSections} /> : null}
            {view.notes && view.notes.length > 0 ? (
              modernMode === "priority" ? (
                <SectionCard title="참조 조문" className="duty-notes-card">
                  <ol className="duty-notes-list">
                    {view.notes.map((note, index) => (
                      <li key={`${note.heading}-${note.text.slice(0, 12)}-${index}`}>
                        <span className="duty-note-idx" aria-hidden>
                          {index + 1}
                        </span>
                        <span className="duty-note-hd">{note.heading}</span>
                        <p className="duty-note-text">{note.text}</p>
                      </li>
                    ))}
                  </ol>
                </SectionCard>
              ) : (
                <div className="duty-notes">
                  <h3>참조</h3>
                  {view.notes.map((note) => (
                    <p key={`${note.heading}-${note.text.slice(0, 12)}`}>
                      <strong>{note.heading}</strong> {note.text}
                    </p>
                  ))}
                </div>
              )
            ) : null}
          </>
        ) : err ? null : (
          <p className={modernMode ? "duty-modern-loading" : "muted"}>조회 중…</p>
        )}
      </div>
    </div>
  );
}
