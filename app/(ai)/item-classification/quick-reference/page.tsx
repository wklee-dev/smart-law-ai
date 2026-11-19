"use client";

import { CasSearchButton } from "@/app/components/search-action-buttons";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sectionCodeForChapterNumber } from "@/app/lib/hs-chapter-to-section";
import { withTariffEmbedParam } from "@/app/tariff/lib/tariff-hs-display";
import { saveTariffScheduleNav } from "@/app/tariff/lib/tariff-schedule-nav";
import { formatSchedulePeriodLabel } from "@/app/tariff/lib/tariff-schedule-period";
import {
  chapterCodeFromGrid,
  HS_CHAPTER_SHORT_LABELS,
} from "./hs-chapter-short-labels";

const COLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const ROWS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90] as const;

function CountryFlag({ code }: { code: string }) {
  const c = code.trim().toLowerCase();
  if (!c || c.length !== 2) return null;
  return (
    <Image
      src={`https://flagcdn.com/w40/${c === "uk" ? "gb" : c}.png`}
      alt=""
      width={20}
      height={14}
      className="inline-block h-3.5 w-5 object-cover"
      unoptimized
    />
  );
}

function buildTariffScheduleHref(opts: {
  countryCode: string;
  year: number;
  sectionCode?: string;
  chapterCode?: string;
}): string {
  const q = withTariffEmbedParam(
    new URLSearchParams({
      countryCode: opts.countryCode,
      year: String(opts.year),
    }),
  );
  if (opts.sectionCode) q.set("sectionCode", opts.sectionCode);
  if (opts.chapterCode) q.set("chapterCode", opts.chapterCode);
  return `/item-classification/tariff-schedule?${q.toString()}`;
}

export default function HsQuickReferencePage() {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState("KR");
  const [countryName, setCountryName] = useState("한국");
  const [year, setYear] = useState(2026);
  const [yearOptions, setYearOptions] = useState<number[]>([2026]);
  const [searchQ, setSearchQ] = useState("");
  const [searchActive, setSearchActive] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/tariff/schedule/meta", {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          countries?: { code: string; name: string }[];
          yearsByCountry?: Record<string, number[]>;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "메타 로드 실패");
        }
        const kr =
          data.countries?.find((c) => c.code === "KR") ?? data.countries?.[0];
        const code = kr?.code ?? "KR";
        setCountryCode(code);
        setCountryName(kr?.name ?? "한국");
        const years = (data.yearsByCountry?.[code] ?? []).filter(
          (y) => Number.isFinite(y) && y > 0 && y < 100_000,
        );
        const opts = years.length ? years : [2026];
        setYearOptions(opts);
        setYear((prev) => (opts.includes(prev) ? prev : opts[0]));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const q = searchActive.trim().toLowerCase();

  const tariffHomeHref = useMemo(
    () => buildTariffScheduleHref({ countryCode, year }),
    [countryCode, year],
  );

  const hrefForChapter = useCallback(
    (chapterCode: string) => {
      const sectionCode = sectionCodeForChapterNumber(Number(chapterCode));
      return buildTariffScheduleHref({
        countryCode,
        year,
        sectionCode,
        chapterCode,
      });
    },
    [countryCode, year],
  );

  const openChapter = useCallback(
    (chapterCode: string) => {
      if (!HS_CHAPTER_SHORT_LABELS[chapterCode]) return;
      const sectionCode = sectionCodeForChapterNumber(Number(chapterCode));
      saveTariffScheduleNav({
        countryCode,
        year,
        sectionCode,
        chapterCode,
        headingCode: "",
      });
      router.push(hrefForChapter(chapterCode));
    },
    [countryCode, hrefForChapter, router, year],
  );

  const periodLabel = useMemo(() => formatSchedulePeriodLabel(year), [year]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#eef5fb] text-slate-900">
      <header className="shrink-0 border-b border-slate-300 bg-white px-4 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-base text-slate-800"
            aria-label="속견표 위치"
          >
            <span className="shrink-0 font-semibold">속견표</span>
            <span className="text-slate-400" aria-hidden>
              ›
            </span>
            <CountryFlag code={countryCode} />
            <strong className="min-w-0 truncate font-semibold">
              {countryName}
            </strong>
            <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-sm font-medium tabular-nums text-red-700">
              [ {periodLabel} ]
            </span>
            {yearOptions.length > 1 ? (
              <select
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="적용 연도"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {formatSchedulePeriodLabel(y)}
                  </option>
                ))}
              </select>
            ) : null}
            <Link
              href={tariffHomeHref}
              className="ml-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
              title="관세율표 부·류 목록"
            >
              관세율표
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <input
              className="min-w-[10rem] rounded border border-slate-300 bg-white px-2 py-1.5 text-sm sm:min-w-[14rem]"
              placeholder="검색"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSearchActive(searchQ);
              }}
              aria-label="속견표 검색"
            />
            <CasSearchButton type="button" onClick={() => setSearchActive(searchQ)}>
              검색
            </CasSearchButton>
          </div>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          류를 클릭하면 관세율표 호(4자리) 목록으로 이동합니다.
        </p>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
        {err ? (
          <p className="mb-2 shrink-0 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto rounded border border-slate-300 bg-white shadow-sm">
          <table className="h-full w-full table-fixed border-collapse text-center text-[11px] leading-tight text-slate-800">
            <colgroup>
              <col className="w-9" />
              {COLS.map((c) => (
                <col key={c} />
              ))}
            </colgroup>
            <thead>
              <tr className="h-8">
                <th className="border border-slate-300 bg-slate-100 px-0.5 py-1 font-semibold text-slate-700" />
                {COLS.map((c) => (
                  <th
                    key={c}
                    className="border border-slate-300 bg-slate-100 px-0.5 py-1 font-semibold tabular-nums text-slate-700"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((rowTens) => (
                <tr key={rowTens}>
                  <th className="border border-slate-300 bg-slate-100 px-0.5 py-1 font-semibold tabular-nums text-slate-700">
                    {rowTens}
                  </th>
                  {COLS.map((col) => {
                    const code = chapterCodeFromGrid(rowTens, col);
                    const label = HS_CHAPTER_SHORT_LABELS[code] ?? "";
                    const empty = !label;
                    const hit =
                      !empty &&
                      q.length > 0 &&
                      (label.toLowerCase().includes(q) ||
                        code.includes(q.replace(/\D/g, "")));
                    const dimmed = q.length > 0 && !empty && !hit;

                    return (
                      <td
                        key={code}
                        className="h-[9.2%] border border-slate-300 bg-white p-0 align-middle"
                      >
                        {empty ? (
                          <span className="block h-full min-h-[2.4rem]" />
                        ) : (
                          <Link
                            href={hrefForChapter(code)}
                            onClick={(e) => {
                              e.preventDefault();
                              openChapter(code);
                            }}
                            title={`제${Number(code)}류 ${label} → 호(4자리) 목록`}
                            className={`flex h-full min-h-[2.4rem] w-full items-center justify-center px-1 py-1 text-slate-800 no-underline transition-colors hover:bg-sky-50 hover:text-sky-900 ${
                              hit
                                ? "bg-amber-50 font-semibold text-amber-950 ring-1 ring-inset ring-amber-300"
                                : dimmed
                                  ? "opacity-35"
                                  : ""
                            }`}
                          >
                            <span className="line-clamp-2 break-keep">
                              {label}
                            </span>
                          </Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
