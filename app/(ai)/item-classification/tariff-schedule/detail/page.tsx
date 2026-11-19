"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TariffDomesticTaxSection,
  TariffItemSummaryPanel,
  TariffRatesTable,
} from "@/app/components/tariff-item-detail-panels";
import {
  TariffOtherMattersSection,
  TariffReqConditionsSection,
  TariffStrategicSection,
  type TariffReqRow,
  type TariffStrategicRow,
} from "@/app/components/tariff-item-detail-sections";
import { splitTariffRates } from "@/app/tariff/lib/tariff-domestic-tax";
import {
  type TariffItemRow,
  formatHsCodeDotted,
  formatHsCodeSpaced,
  normalizeHeadingCode,
  normalizeHsDigits,
  sortTariffItemsByHsCode,
  withTariffEmbedParam,
} from "@/app/tariff/lib/tariff-hs-display";

type RateRow = {
  rate_code: string;
  rate_value: string;
  rate_name: string;
};

type ReqRow = TariffReqRow;

type StrategicRow = TariffStrategicRow;

type ItemDetailJson = {
  ok: boolean;
  error?: string;
  countryCode?: string;
  year?: number;
  hsCode?: string;
  item?: {
    hs_code: string;
    item_name: string;
    item_name_en: string;
    basic_rate: string;
    elastic_rate: string;
    heading_code: string;
    chapter_code: string;
    section_code: string;
    country_name: string;
    unit?: string;
    simplified_drawback?: string;
    exemption?: string;
    origin?: string;
  };
  rates?: RateRow[];
  reqByType?: Record<string, ReqRow[]>;
  strategic?: StrategicRow[];
};

type HeadingRow = {
  record_uuid: string;
  heading_code: string;
  heading_name: string;
  heading_name_en: string;
};

const FLAG_EMOJI: Record<string, string> = { KR: "🇰🇷" };

function normalizeTwoCode(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d.length) return "";
  return d.slice(0, 2).padStart(2, "0");
}

export default function TariffItemDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const countryCode = (searchParams.get("countryCode") ?? "KR").toUpperCase();
  const year = Number(searchParams.get("year") ?? "2026");
  const hsCode = normalizeHsDigits(searchParams.get("hsCode") ?? "");
  const sectionCode = normalizeTwoCode(searchParams.get("sectionCode") ?? "");
  const chapterCode = normalizeTwoCode(searchParams.get("chapterCode") ?? "");
  const headingCode = normalizeHeadingCode(searchParams.get("headingCode") ?? "");

  const [detail, setDetail] = useState<ItemDetailJson | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  const [headingItems, setHeadingItems] = useState<TariffItemRow[]>([]);
  const [headings, setHeadings] = useState<HeadingRow[]>([]);
  const [meta, setMeta] = useState<{
    section?: { nameKr: string; code: string };
    chapter?: { nameKr: string };
    heading?: { nameKr: string };
  } | null>(null);

  const effectiveHeading =
    headingCode ||
    normalizeHeadingCode(detail?.item?.heading_code ?? hsCode.slice(0, 4));

  const loadDetail = useCallback(async () => {
    if (!hsCode || hsCode.length < 10) {
      setDetailErr("HS 코드(10자리)가 필요합니다.");
      return;
    }
    setDetailLoading(true);
    setDetailErr(null);
    try {
      const q = new URLSearchParams({
        countryCode,
        year: String(year),
        hsCode,
      });
      const res = await fetch(`/api/tariff/schedule/item-detail?${q}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ItemDetailJson;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "품목 상세 로드 실패");
      }
      setDetail(data);
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : String(e));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [countryCode, hsCode, year]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    const ch = chapterCode || normalizeTwoCode(detail?.item?.chapter_code ?? "");
    if (!ch || !effectiveHeading) return;
    let cancelled = false;
    void (async () => {
      try {
        const hq = new URLSearchParams({
          countryCode,
          year: String(year),
          chapterCode: ch,
        });
        const hres = await fetch(`/api/tariff/schedule/headings?${hq}`, {
          cache: "no-store",
        });
        const hjson = (await hres.json()) as {
          ok: boolean;
          headings?: HeadingRow[];
          section?: { nameKr: string; code: string };
          chapter?: { nameKr: string };
          error?: string;
        };
        if (hres.ok && hjson.ok) {
          if (!cancelled) {
            setHeadings(hjson.headings ?? []);
            const h = hjson.headings?.find(
              (x) => normalizeHeadingCode(x.heading_code) === effectiveHeading,
            );
            setMeta({
              section: hjson.section
                ? { nameKr: hjson.section.nameKr, code: hjson.section.code }
                : undefined,
              chapter: hjson.chapter
                ? { nameKr: hjson.chapter.nameKr }
                : undefined,
              heading: h ? { nameKr: h.heading_name } : undefined,
            });
          }
        }
        const iq = new URLSearchParams({
          countryCode,
          year: String(year),
          headingCode: effectiveHeading,
        });
        const ires = await fetch(`/api/tariff/schedule/items?${iq}`, {
          cache: "no-store",
        });
        const ijson = (await ires.json()) as {
          ok: boolean;
          items?: TariffItemRow[];
        };
        if (!cancelled && ires.ok && ijson.ok) {
          setHeadingItems(sortTariffItemsByHsCode(ijson.items ?? []));
        }
      } catch {
        /* sidebar 보조 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterCode, countryCode, detail?.item?.chapter_code, effectiveHeading, year]);

  const reqByType = detail?.reqByType ?? {};
  const { tariffRates, domesticRows } = useMemo(
    () => splitTariffRates(detail?.rates ?? []),
    [detail?.rates],
  );
  const strategic = detail?.strategic ?? [];
  const item = detail?.item;

  const backHref = useMemo(() => {
    const q = withTariffEmbedParam(
      new URLSearchParams({
        countryCode,
        year: String(year),
        sectionCode: sectionCode || item?.section_code || "",
        chapterCode: chapterCode || item?.chapter_code || "",
        headingCode: effectiveHeading,
      }),
    );
    return `/item-classification/tariff-schedule/heading?${q.toString()}`;
  }, [
    chapterCode,
    countryCode,
    effectiveHeading,
    item?.chapter_code,
    item?.section_code,
    sectionCode,
    year,
  ]);

  const selectHs = (code: string) => {
    const d = normalizeHsDigits(code);
    if (d.length < 10) return;
    const q = withTariffEmbedParam(new URLSearchParams(searchParams.toString()));
    q.set("hsCode", d);
    router.push(`/item-classification/tariff-schedule/detail?${q.toString()}`);
  };

  return (
    <div className="flex h-screen min-h-[640px] flex-col bg-[#eef5fb] p-3 text-slate-900">
      <div className="mx-auto mb-2 flex w-full max-w-6xl flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold text-slate-900">
          국내관세율상세
        </h1>
        <div className="flex gap-2">
          <Link
            href={backHref}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            상세목록
          </Link>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            이전
          </button>
        </div>
      </div>

      <div className="mx-auto mb-2 w-full max-w-6xl rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
        {meta?.section ? (
          <span>
            부 제{meta.section.code}부 {meta.section.nameKr}
          </span>
        ) : null}
        {meta?.chapter ? (
          <span className="ml-2">
            › 류 {chapterCode} {meta.chapter.nameKr}
          </span>
        ) : null}
        {meta?.heading || effectiveHeading ? (
          <span className="ml-2">
            › 호 {effectiveHeading} {meta?.heading?.nameKr ?? ""}
          </span>
        ) : null}
        {hsCode ? (
          <span className="ml-2 font-mono text-slate-900">
            › {formatHsCodeDotted(hsCode)}
          </span>
        ) : null}
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 gap-3">
        <aside className="w-[22rem] min-w-[20rem] max-w-[28rem] shrink-0 overflow-y-auto rounded border border-slate-300 bg-white p-2 shadow-sm">
          <p className="mb-2 text-sm font-medium text-slate-600">품목 계층</p>
          <ul className="space-y-1 text-sm">
            {headingItems.map((row, idx) => {
              const d = normalizeHsDigits(row.hs_code);
              const active = d === hsCode;
              const isLeaf = d.length >= 10;
              return (
                <li key={`${row.hs_code}-${idx}`}>
                  <button
                    type="button"
                    disabled={!isLeaf}
                    onClick={() => selectHs(row.hs_code)}
                    className={`w-full rounded px-2 py-2 text-left leading-snug ${
                      active
                        ? "bg-[#1e2f4f] text-white"
                        : isLeaf
                          ? "text-blue-800 hover:bg-blue-50"
                          : "cursor-default text-slate-700"
                    }`}
                  >
                    <span className="block font-mono text-sm tabular-nums">
                      {formatHsCodeSpaced(row.hs_code)}
                    </span>
                    {row.item_name ? (
                      <span
                        className={`mt-1 block font-sans text-sm leading-snug ${
                          active ? "text-white/95" : "text-slate-800"
                        }`}
                      >
                        {row.item_name}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="min-w-0 max-w-[44rem] flex-1 space-y-3 overflow-y-auto">
          {detailLoading ? (
            <p className="text-sm text-slate-500">불러오는 중…</p>
          ) : null}
          {detailErr ? (
            <p className="text-sm text-red-700">{detailErr}</p>
          ) : null}

          {item ? (
            <>
              <TariffItemSummaryPanel
                item={item}
                countryCode={countryCode}
                year={year}
                flagEmoji={FLAG_EMOJI[countryCode] ?? "🌐"}
              />

              <TariffRatesTable rates={tariffRates} year={year} />

              <TariffDomesticTaxSection rows={domesticRows} />

              <TariffReqConditionsSection reqByType={reqByType} />

              <TariffStrategicSection rows={strategic} />

              <TariffOtherMattersSection />
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
