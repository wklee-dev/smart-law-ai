"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { TariffRateSheet, type DomesticTaxRecord } from "@/hanjoo/components/tariff-rate-sheet";
import { TariffSteps } from "@/hanjoo/components/tariff-steps";
import { Button } from "@/hanjoo/components/ui/Button";
import { formatHs } from "@/hanjoo/lib/hs-format";
import { tariffCountry, tariffHref, tariffIndexHref } from "@/hanjoo/lib/tariff-links";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Rate = { rate_code: string; rate_value: string; rate_name: string };
type Req = { req_type: string; req_category: string; req_content: string };
type Strategic = {
  cls_no: string;
  item_name: string;
  ctrl_name: string;
  model_spec: string;
  ctrl_detail: string;
  manufacturer: string;
  remark: string;
};
type Node = {
  hs_code: string;
  suffix: string;
  depth: number;
  item_name: string;
  leaf: boolean;
  basic_rate: string;
};
type Item = {
  hs_code: string;
  item_name: string;
  item_name_en: string;
  basic_rate: string;
  origin: string;
  unit_weight: string;
  unit_qty: string;
  reduction: string;
  simple_refund: string;
  section_code: string;
  chapter_code: string;
  heading_code: string;
};

function ItemInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const hs = (sp.get("hs") ?? "").replace(/\D/g, "");
  const year = Number(sp.get("year") ?? "2026");
  const country = tariffCountry(sp.get("country"));
  const [item, setItem] = useState<Item | null>(null);
  const [rates, setRates] = useState<Rate[]>([]);
  const [domesticTax, setDomesticTax] = useState<DomesticTaxRecord[]>([]);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [strategic, setStrategic] = useState<Strategic[]>([]);
  const [tree, setTree] = useState<Node[]>([]);
  const [crumb, setCrumb] = useState<{
    section: string;
    chapter: string;
    heading: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hs) {
      setErr("HSK가 없습니다.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/tariff/item?hs=${encodeURIComponent(hs)}&year=${year}&country=${country}`,
        );
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          item?: Item;
          rates?: Rate[];
          domesticTax?: DomesticTaxRecord[];
          reqs?: Req[];
          strategic?: Strategic[];
          tree?: Node[];
          crumb?: { section: string; chapter: string; heading: string };
        };
        if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
        if (!cancelled) {
          setItem(data.item ?? null);
          setRates(data.rates ?? []);
          setDomesticTax(data.domesticTax ?? []);
          setReqs(data.reqs ?? []);
          setStrategic(data.strategic ?? []);
          setTree(data.tree ?? []);
          setCrumb(data.crumb ?? null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hs, year, country]);

  const importReqs = reqs.filter((r) => r.req_type === "수입");
  const exportReqs = reqs.filter((r) => r.req_type === "수출");
  const otherReqs = reqs.filter((r) => r.req_type === "기타");
  const chapter = (item?.chapter_code || hs.slice(0, 2)).padStart(2, "0");
  const heading = item?.heading_code || hs.slice(0, 4);

  return (
    <AppShellClient>
      <div className="tariff-ui">
      <div className="crumb">
        <Link href="/">HOME</Link> ›{" "}
        <Link href={tariffIndexHref(year, country)}>
          {country === "KR" ? "관세율표" : "해외관세율표"}
        </Link>{" "}
        › <Link href={tariffHref("/tariff/chapter", year, country, { hs: chapter })}>제{chapter}류</Link>{" "}
        ›{" "}
        <Link href={tariffHref("/tariff/heading", year, country, { hs: heading })}>제{heading}호</Link>{" "}
        › {item ? formatHs(item.hs_code) : hs}
      </div>
      <TariffSteps step={4} year={year} chapter={chapter} heading={heading} country={country} />
      {err ? <div className="err-box">{err}</div> : null}
      {loading ? <p className="muted">불러오는 중…</p> : null}

      {item ? (
        <div className="tariff-layout item-step">
          <aside className="panel hsk-panel">
            <div className="panel-hd">HSK 분류체계</div>
            <div className="panel-bd tree-list">
              <HskTree
                nodes={tree}
                current={item.hs_code.replace(/\D/g, "")}
                onOpen={(code) => router.push(tariffHref("/tariff/item", year, country, { hs: code }))}
              />
            </div>
          </aside>

          <section>
            <div className="detail-title">
              {formatHs(item.hs_code)} {item.item_name || ""}
            </div>
            <p className="path-line">
              제{item.section_code}부 {crumb?.section || ""} › 제{item.chapter_code}류{" "}
              {crumb?.chapter || ""} › 제{item.heading_code}호 {crumb?.heading || ""}
            </p>
            <TariffRateSheet item={item} rates={rates} domesticTax={domesticTax} />

            <ReqTable title="수입요건" rows={importReqs} extra={otherReqs} />
            <ReqTable
              title="수출요건"
              rows={exportReqs}
              categories={["수출입공고", "통합공고", "세관장확인"]}
            />
            <StrategicTable rows={strategic} />
            <EtcBlock text={exportReqs.find((r) => r.req_category === "기타")?.req_content ?? ""} />
            <DomesticPanel hs={item.hs_code} />
          </section>
        </div>
      ) : null}
      </div>
    </AppShellClient>
  );
}

type DomesticCase = {
  id: number;
  reff_no: string;
  enfr_dt: string;
  cmdt_nm: string;
};
type DomesticImage = { id: number; cmdt_nm: string };

function DomesticPanel({ hs }: { hs: string }) {
  const code = hs.replace(/\D/g, "");
  const [tab, setTab] = useState<"cases" | "images">("cases");
  const [cases, setCases] = useState<DomesticCase[]>([]);
  const [images, setImages] = useState<DomesticImage[]>([]);
  const [caseTotal, setCaseTotal] = useState(0);
  const [imageTotal, setImageTotal] = useState(0);
  const [caseLimit, setCaseLimit] = useState(15);
  const [imageLimit, setImageLimit] = useState(12);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<DomesticImage | null>(null);
  const [seen, setSeen] = useState(code);
  if (seen !== code) {
    setSeen(code);
    setTab("cases");
    setCaseLimit(15);
    setImageLimit(12);
    setPreview(null);
    setCases([]);
    setImages([]);
    setCaseTotal(0);
    setImageTotal(0);
  }

  useEffect(() => {
    if (code.length < 8) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/tariff/domestic?hs=${encodeURIComponent(code)}&part=cases&caseLimit=${caseLimit}`,
        );
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          cases?: DomesticCase[];
          caseTotal?: number;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
        if (!cancelled) {
          setCases(data.cases ?? []);
          setCaseTotal(data.caseTotal ?? 0);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "분류사례 조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, caseLimit]);

  useEffect(() => {
    if (code.length < 8 || tab !== "images") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/tariff/domestic?hs=${encodeURIComponent(code)}&part=images&imageLimit=${imageLimit}`,
        );
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          images?: DomesticImage[];
          imageTotal?: number;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
        if (!cancelled) {
          setImages(data.images ?? []);
          setImageTotal(data.imageTotal ?? 0);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "이미지 조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, tab, imageLimit]);

  if (code.length < 8) return null;

  return (
    <div className="domestic-panel">
      <div className="answer-tabs">
        <button type="button" className={tab === "cases" ? "on" : ""} onClick={() => setTab("cases")}>
          분류사례
        </button>
        <button type="button" className={tab === "images" ? "on" : ""} onClick={() => setTab("images")}>
          이미지
        </button>
      </div>
      {err ? <div className="err-box">{err}</div> : null}
      {loading && cases.length === 0 && images.length === 0 ? (
        <p className="muted case-wait">불러오는 중…</p>
      ) : null}
      {tab === "cases" ? (
        <>
          <ul className="case-list">
            {cases.map((row) => (
              <li key={row.id} title={row.reff_no || undefined}>
                <span className="case-mark" />
                <span className="case-name">{row.cmdt_nm || "품명 없음"}</span>
                <span className="case-meta">{row.enfr_dt}</span>
              </li>
            ))}
            {!loading && cases.length === 0 ? (
              <li>
                <span className="muted">결정세번이 일치하는 분류사례가 없습니다.</span>
              </li>
            ) : null}
          </ul>
          {caseTotal > cases.length ? (
            <div className="case-more">
              <Button type="button" size="small" variant="outline" icon="eye" onClick={() => setCaseLimit(1000)}>
                전체보기
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {loading && images.length === 0 ? (
            <p className="muted case-wait">불러오는 중…</p>
          ) : images.length === 0 ? (
            <p className="muted case-wait">결정세번이 일치하는 이미지가 없습니다.</p>
          ) : (
            <div className="image-grid">
              {images.map((img) => (
                <figure key={img.id}>
                  <Button
                    type="button"
                    className="image-open"
                    variant="ghost"
                    icon={false}
                    aria-label="상세보기"
                    title="상세보기"
                    onClick={() => setPreview(img)}
                  >
                    <img src={`/api/tariff/domestic-image?id=${img.id}`} alt={img.cmdt_nm || "분류사례 이미지"} />
                  </Button>
                  <figcaption>{img.cmdt_nm}</figcaption>
                </figure>
              ))}
            </div>
          )}
          {imageTotal > images.length && imageLimit < 80 ? (
            <div className="case-more">
              <Button
                type="button"
                size="small"
                variant="outline"
                icon="eye"
                onClick={() => setImageLimit((n) => Math.min(n + 24, 80))}
              >
                전체보기
              </Button>
            </div>
          ) : imageTotal > images.length ? (
            <div className="case-more">
              <span className="muted">최근 {images.length}건</span>
            </div>
          ) : null}
        </>
      )}
      {preview ? (
        <div className="image-pop" onClick={() => setPreview(null)} role="presentation">
          <div
            className="image-pop-frame"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={preview.cmdt_nm || "분류사례 이미지"}
          >
            <div className="image-pop-toolbar">
              <Button type="button" action="close" size="small" onClick={() => setPreview(null)} />
            </div>
            <img
              src={`/api/tariff/domestic-image?id=${preview.id}`}
              alt={preview.cmdt_nm || "분류사례 이미지"}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function shownCode(n: Node) {
  if (n.suffix.length === 1 && n.hs_code.length >= 10) return n.hs_code.slice(-2);
  return n.suffix;
}

function hskSpan(nodes: Node[], index: number) {
  const code = nodes[index].hs_code;
  let count = 1;
  for (let j = index + 1; j < nodes.length; j++) {
    const next = nodes[j].hs_code;
    if (next.startsWith(code) && next.length > code.length) count += 1;
    else break;
  }
  return count;
}

function HskTree({
  nodes,
  current,
  onOpen,
}: {
  nodes: Node[];
  current: string;
  onOpen: (code: string) => void;
}) {
  if (nodes.length === 0) return <p className="muted hsk-empty">세번이 없습니다.</p>;
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
  const cols = maxDepth + 2;
  return (
    <table className="hsk-tree">
      <tbody>
        {nodes.map((n, i) => {
          const span = hskSpan(nodes, i);
          const open = n.leaf || Boolean(n.basic_rate);
          const on = n.hs_code === current;
          return (
            <tr
              key={n.hs_code}
              className={`${open ? "can" : ""} ${on ? "on" : ""}`}
              onClick={() => {
                if (open) onOpen(n.hs_code);
              }}
            >
              <td className="code" rowSpan={span} title={formatHs(n.hs_code)}>
                {shownCode(n)}
              </td>
              <td className="name" colSpan={cols - n.depth - 1}>
                {n.item_name}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function strategicCode(row: Strategic) {
  if (row.cls_no && row.cls_no !== "전략물자") return row.cls_no;
  return row.remark;
}

function strategicNote(row: Strategic) {
  if (row.cls_no && row.cls_no !== "전략물자") return row.remark;
  return "";
}

function StrategicTable({ rows }: { rows: Strategic[] }) {
  return (
    <table className="detail-table req-block">
      <tbody>
        <tr>
          <th className="req-side">전략물자</th>
          <td className="req-panel">
            <table className="detail-table strategic-table">
              <thead>
                <tr>
                  <th>전략물자 분류번호</th>
                  <th>품명</th>
                  <th>전략물자 통제명</th>
                  <th>모델규격명</th>
                  <th>전략물자 통제상세내용</th>
                  <th>제조자상호</th>
                  <th>비고내용</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <p className="strategic-empty">조회결과가 존재하지 않습니다.</p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => (
                    <tr key={`${strategicCode(row)}-${i}`}>
                      <td>{strategicCode(row)}</td>
                      <td>{row.item_name}</td>
                      <td>{row.ctrl_name}</td>
                      <td>{row.model_spec}</td>
                      <td>{row.ctrl_detail}</td>
                      <td>{row.manufacturer}</td>
                      <td>{strategicNote(row)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <p className="strategic-note">
              * 전략물자 관련 정보는 단순 참고사항으로 전략물자 등 해당여부는 전략물자
              수출입고시(산업통상자원부) 별표1~별표4를 확인하시기 바랍니다.
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function EtcBlock({ text }: { text: string }) {
  const lines = splitReqLines(text);
  return (
    <table className="detail-table req-block">
      <tbody>
        <tr>
          <th className="req-side">기타</th>
          <td className="req-panel">
            {lines.length === 0 ? (
              <p className="strategic-empty">조회결과가 존재하지 않습니다.</p>
            ) : (
              <ul className="req-lines">
                {lines.map((line, n) => (
                  <li key={n}>{line}</li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚";

function splitReqLines(text: string): string[] {
  const marked = text
    .replace(/\s*\^(\d{1,2})\s*/g, "\n$1. ")
    .replace(new RegExp(`\\s*([${CIRCLED}])\\s*`, "g"), "\n$1 ")
    .replace(/\s*●\s*/g, "\n● ")
    .replace(/\s*·\s*/g, "\n· ")
    .replace(/\s+\.\s+/g, "\n")
    .replace(/(^|\n)\s*(\d{1,2})\.\s+/g, "\n$2. ");
  return marked
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const REQ_CATEGORIES = ["수출입공고", "통합공고", "세관장확인", "기타"] as const;

function ReqTable({
  title,
  rows,
  extra = [],
  categories = REQ_CATEGORIES,
}: {
  title: string;
  rows: Req[];
  extra?: Req[];
  categories?: readonly string[];
}) {
  const byCategory = new Map<string, string>();
  for (const r of rows) {
    const prev = byCategory.get(r.req_category) ?? "";
    const next = [prev, r.req_content].filter(Boolean).join("\n");
    byCategory.set(r.req_category, next);
  }
  const extraText = extra
    .map((r) => [r.req_category, r.req_content].filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n");
  if (extraText) {
    byCategory.set("기타", [byCategory.get("기타") ?? "", extraText].filter(Boolean).join("\n"));
  }

  return (
    <table className="detail-table req-block">
      <tbody>
        {categories.map((category, i) => {
          const lines = splitReqLines(byCategory.get(category) ?? "");
          return (
            <tr key={category}>
              {i === 0 ? (
                <th className="req-side" rowSpan={categories.length}>
                  {title}
                </th>
              ) : null}
              <th className="req-cat">{category}</th>
              <td>
                {lines.length === 0 ? (
                  <span className="req-blank"> </span>
                ) : (
                  <ul className="req-lines">
                    {lines.map((line, n) => (
                      <li key={n}>{line}</li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function TariffItemPage() {
  return (
    <Suspense fallback={<div className="site-main muted">불러오는 중…</div>}>
      <ItemInner />
    </Suspense>
  );
}
