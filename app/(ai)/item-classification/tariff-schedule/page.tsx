"use client";

import { CasSearchButton } from "@/app/components/search-action-buttons";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HsExplanatoryDualPanes } from "@/app/components/hs-explanatory-dual-panes";
import { sectionCodeForChapterNumber } from "@/app/lib/hs-chapter-to-section";
import { normalizeHeadingCode, buildTariffHeadingHref, parseHsSearchInput, withTariffEmbedParam, isTariffEmbedContext } from "@/app/tariff/lib/tariff-hs-display";
import { lookupTariffHs, saveNavFromHsLookup, saveTariffScheduleNav } from "@/app/tariff/lib/tariff-schedule-nav";
import { formatSchedulePeriodLabel } from "@/app/tariff/lib/tariff-schedule-period";

type Country = { code: string; name: string };

type SectionChapterItem = {
  chapterUuid: string;
  section_code: string;
  chapter_code: string;
  chapter_name: string;
  chapter_name_en: string;
  section_name: string;
  section_name_en: string;
  sectionUuid: string;
};

type SectionRow = {
  section_code: string;
  section_name: string;
  section_name_en: string;
  record_uuid: string;
};

type HeadingRow = {
  record_uuid: string;
  heading_code: string;
  heading_name: string;
  heading_name_en: string;
};

type Pane = {
  titleKo: string;
  titleEn: string;
  bodyKo: string;
  bodyEn: string;
  other: string;
};

type DetailJson = {
  ok: boolean;
  error?: string;
  sourceLabel?: string;
  tongchim?: { available: boolean; message: string; panes: Pane };
  section?: Pane | null;
  chapter?: Pane | null;
  heading?: Pane | null;
};

type MainTab = "tongchim" | "section" | "chapter" | "heading";
type Lang = "ko" | "en" | "other";

/** 부·류 코드: DB·JSON에 1 / "1" / "01" 혼재 시 화면·API·비교를 맞춤 */
function canonicalHsCode(raw: unknown, digits: number): string {
  if (raw === null || raw === undefined) return "";
  const t = String(raw).trim();
  if (!t) return "";
  const d = t.replace(/\D/g, "");
  if (!d) return t;
  const n = parseInt(d, 10);
  return Number.isFinite(n)
    ? String(n).padStart(digits, "0")
    : t;
}

const FLAG_EMOJI: Record<string, string> = {
  KR: "🇰🇷",
  US: "🇺🇸",
  JP: "🇯🇵",
  CN: "🇨🇳",
  TW: "🇹🇼",
  AU: "🇦🇺",
  VN: "🇻🇳",
  TH: "🇹🇭",
  DE: "🇩🇪",
  GB: "🇬🇧",
  IN: "🇮🇳",
  CA: "🇨🇦",
  NZ: "🇳🇿",
  EU: "🇪🇺",
  MX: "🇲🇽",
  BR: "🇧🇷",
  RU: "🇷🇺",
  CH: "🇨🇭",
  NO: "🇳🇴",
  TR: "🇹🇷",
  CL: "🇨🇱",
  PE: "🇵🇪",
  CO: "🇨🇴",
  SG: "🇸🇬",
  MY: "🇲🇾",
  PH: "🇵🇭",
  ID: "🇮🇩",
  KH: "🇰🇭",
  MM: "🇲🇲",
  BN: "🇧🇳",
  LA: "🇱🇦",
  AE: "🇦🇪",
  SA: "🇸🇦",
};

function flagFor(code: string): string {
  return FLAG_EMOJI[code] ?? "🌐";
}

/**
 * 화면에 보이는 국가명(ISO 코드 생략). DB·JSON에 "KR 한국", "한국(KR)" 형태로 들어온 경우 정리.
 */
function displayCountryName(name: string | undefined, code: string): string {
  const raw = (name ?? "").trim();
  const c = code.trim().toUpperCase();
  if (!raw) return "";
  if (!c || c.length < 2) return raw;
  let s = raw;
  s = s.replace(new RegExp(`^${c}\\s*[-:／/]\\s*`, "i"), "");
  s = s.replace(new RegExp(`^${c}\\s+`, "i"), "");
  s = s.replace(new RegExp(`^\\[\\s*${c}\\s*\\]\\s*`, "i"), "");
  s = s.replace(new RegExp(`^\\(\\s*${c}\\s*\\)\\s*`, "i"), "");
  s = s.replace(new RegExp(`\\s*\\(\\s*${c}\\s*\\)\\s*$`, "i"), "");
  s = s.replace(new RegExp(`\\s*\\[\\s*${c}\\s*\\]\\s*$`, "i"), "");
  s = s.trim();
  return s || raw;
}

/**
 * 국기 표시:
 * 1) flagcdn.com PNG(ISO 3166-1 alpha-2, EU는 eu) — OS와 무관하게 비슷하게 보임
 * 2) 로드 실패 시 유니코드 리전 이모지(FLAG_EMOJI)
 * 3) 자체 자산: public/flags/{code}.svg 를 쓰려면 src만 바꾸면 됨
 */
function CountryFlag({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const c = code.trim().toUpperCase();
  const slug = c === "EU" ? "eu" : c.toLowerCase();
  const src = `https://flagcdn.com/24x18/${slug}.png`;

  if (broken) {
    return (
      <span
        className={`text-lg leading-none ${className ?? ""}`}
        aria-hidden
      >
        {flagFor(c)}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={24}
      height={18}
      className={`h-[18px] w-6 shrink-0 rounded-sm object-cover shadow-sm ring-1 ring-black/10 ${className ?? ""}`}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

type Screen = "home" | "section" | "chapter";

function groupBySection(items: SectionChapterItem[]) {
  const map = new Map<string, SectionChapterItem[]>();
  for (const it of items) {
    const k = canonicalHsCode(it.section_code, 2);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(it);
  }
  return Array.from(map.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true }),
  );
}

export default function TariffSchedulePage() {
  const router = useRouter();
  const [countries, setCountries] = useState<Country[]>([]);
  const [yearsByCountry, setYearsByCountry] = useState<
    Record<string, number[]>
  >({});
  const [countryCode, setCountryCode] = useState("KR");
  const [year, setYear] = useState(2026);
  const [searchQ, setSearchQ] = useState("");
  const [searchSubmit, setSearchSubmit] = useState("");
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [hsSearchLoading, setHsSearchLoading] = useState(false);

  const [screen, setScreen] = useState<Screen>("home");
  const [sectionCode, setSectionCode] = useState<string | null>(null);
  const [chapterCode, setChapterCode] = useState<string | null>(null);

  const [homeRows, setHomeRows] = useState<SectionChapterItem[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [sectionTableRows, setSectionTableRows] = useState<
    SectionChapterItem[]
  >([]);
  const [headings, setHeadings] = useState<HeadingRow[]>([]);
  const [chapterMeta, setChapterMeta] = useState<{
    chapter: { nameKr: string; nameEn: string; sectionCode: string } | null;
    section: { nameKr: string; nameEn: string; code: string } | null;
  } | null>(null);
  const [chapterSidebar, setChapterSidebar] = useState<SectionChapterItem[]>(
    [],
  );

  const [explanatoryDetail, setExplanatoryDetail] = useState<DetailJson | null>(
    null,
  );
  const [explanatoryLoading, setExplanatoryLoading] = useState(false);
  const [explanatoryErr, setExplanatoryErr] = useState<string | null>(null);

  /** 류 목록(부 선택) 화면용 HS 해설: 통칙·부 해설만 */
  const [sectionHsDetail, setSectionHsDetail] = useState<DetailJson | null>(
    null,
  );
  const [sectionHsLoading, setSectionHsLoading] = useState(false);
  const [sectionHsErr, setSectionHsErr] = useState<string | null>(null);
  const [sectionHsTab, setSectionHsTab] = useState<"tongchim" | "section">(
    "tongchim",
  );

  const [mainTab, setMainTab] = useState<MainTab>("tongchim");
  const [leftLang, setLeftLang] = useState<Lang>("ko");
  const [rightLang, setRightLang] = useState<Lang>("en");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 사이드바 국가-연도 트리: 펼쳐진 국가 코드 */
  const [expandedCountryCodes, setExpandedCountryCodes] = useState<string[]>(
    [],
  );

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/tariff/schedule/meta", { cache: "no-store" });
    const data = (await res.json()) as {
      ok: boolean;
      countries?: Country[];
      yearsByCountry?: Record<string, number[]>;
      allYears?: number[];
      error?: string;
    };
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "메타 로드 실패");
    }
    const list = data.countries ?? [];
    const ybc = data.yearsByCountry ?? {};
    const defaultCode =
      list.find((c) => c.code === "KR")?.code ?? list[0]?.code ?? "KR";
    setCountries(list);
    setYearsByCountry(ybc);
    setCountryCode((prev) =>
      list.some((c) => c.code === prev) ? prev : defaultCode,
    );
  }, []);

  useEffect(() => {
    void loadMeta().catch((e) => setErr(String(e)));
  }, [loadMeta]);

  const yearOptions = useMemo(() => {
    /** 국가별로 실제 데이터가 있는 연도만 표시 (KR 연도를 US 등에 그대로 쓰지 않음) */
    const raw = yearsByCountry[countryCode] ?? [];
    const nums = raw
      .map((y) => Number(y))
      .filter((y) => Number.isFinite(y) && y > 0);
    return [...new Set(nums)].sort((a, b) => b - a);
  }, [yearsByCountry, countryCode]);

  /** 선택 연도는 해당 국가 데이터 연도에 맞춤 */
  useEffect(() => {
    if (!yearOptions.length) return;
    setYear((y) => (yearOptions.includes(y) ? y : yearOptions[0]));
  }, [countryCode, yearOptions]);

  /** 속견표 등에서 `?chapterCode=` 로 들어오면 호(4자리) 목록 화면으로 바로 진입 */
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const chDigits = (sp.get("chapterCode") ?? "").replace(/\D/g, "");
    if (!chDigits) return;
    deepLinkApplied.current = true;
    const ch = chDigits.slice(0, 2).padStart(2, "0");
    const secDigits = (sp.get("sectionCode") ?? "").replace(/\D/g, "");
    const sec =
      secDigits.length > 0
        ? secDigits.slice(0, 2).padStart(2, "0")
        : sectionCodeForChapterNumber(Number(ch));
    const cc = (sp.get("countryCode") ?? "KR").trim().toUpperCase() || "KR";
    const yNum = Number(sp.get("year") ?? "");
    setCountryCode(cc);
    if (Number.isFinite(yNum) && yNum > 0) setYear(yNum);
    setSectionCode(sec);
    setChapterCode(ch);
    setScreen("chapter");
    saveTariffScheduleNav({
      countryCode: cc,
      year: Number.isFinite(yNum) && yNum > 0 ? yNum : 2026,
      sectionCode: sec,
      chapterCode: ch,
      headingCode: "",
    });
  }, []);

  const getYearsForSidebarCountry = useCallback(
    (code: string) => {
      const raw = yearsByCountry[code] ?? [];
      const nums = raw
        .map((y) => Number(y))
        .filter((y) => Number.isFinite(y) && y > 0);
      return [...new Set(nums)].sort((a, b) => b - a);
    },
    [yearsByCountry],
  );

  useEffect(() => {
    if (!countryCode.trim()) return;
    setExpandedCountryCodes((prev) =>
      prev.includes(countryCode) ? prev : [...prev, countryCode],
    );
  }, [countryCode]);

  const toggleSidebarCountry = useCallback((code: string) => {
    setExpandedCountryCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }, []);

  const fetchSectionChapters = useCallback(
    async (opts: { sectionFilter?: string; q?: string }) => {
      const params = new URLSearchParams({
        countryCode,
        year: String(year),
      });
      if (opts.sectionFilter) params.set("sectionCode", opts.sectionFilter);
      if (opts.q?.trim()) params.set("q", opts.q.trim());
      const res = await fetch(
        `/api/tariff/schedule/section-chapters?${params}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok: boolean;
        items?: SectionChapterItem[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "목록 로드 실패");
      }
      return data.items ?? [];
    },
    [countryCode, year],
  );

  const loadHome = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const items = await fetchSectionChapters({ q: searchSubmit });
      setHomeRows(items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setHomeRows([]);
    } finally {
      setLoading(false);
    }
  }, [fetchSectionChapters, searchSubmit]);

  useEffect(() => {
    if (screen !== "home") return;
    void loadHome();
  }, [screen, loadHome, countryCode, year]);

  const loadSectionScreen = useCallback(async () => {
    if (!sectionCode) return;
    setLoading(true);
    setErr(null);
    try {
      const secRes = await fetch(
        `/api/tariff/schedule/sections?countryCode=${encodeURIComponent(countryCode)}&year=${year}`,
        { cache: "no-store" },
      );
      const secJson = (await secRes.json()) as {
        ok: boolean;
        sections?: SectionRow[];
        error?: string;
      };
      if (!secRes.ok || !secJson.ok) {
        throw new Error(secJson.error || "부 목록 오류");
      }
      setSections(secJson.sections ?? []);
      const chRes = await fetchSectionChapters({
        sectionFilter: sectionCode,
        q: searchSubmit,
      });
      setSectionTableRows(chRes);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sectionCode, countryCode, year, fetchSectionChapters, searchSubmit]);

  useEffect(() => {
    if (screen !== "section" || !sectionCode) return;
    void loadSectionScreen();
  }, [screen, sectionCode, loadSectionScreen, countryCode, year]);

  const loadChapterScreen = useCallback(async () => {
    if (!chapterCode) return;
    const chCanon = canonicalHsCode(chapterCode, 2);
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({
        countryCode,
        year: String(year),
        chapterCode: chCanon,
      });
      const hdRes = await fetch(`/api/tariff/schedule/headings?${params}`, {
        cache: "no-store",
      });
      const hdJson = (await hdRes.json()) as {
        ok: boolean;
        headings?: HeadingRow[];
        chapter?: {
          nameKr: string;
          nameEn: string;
          sectionCode: string;
        } | null;
        section?: { nameKr: string; nameEn: string; code: string } | null;
        error?: string;
      };
      if (!hdRes.ok || !hdJson.ok) {
        throw new Error(hdJson.error || "호 목록 오류");
      }
      setHeadings(hdJson.headings ?? []);
      setChapterMeta({
        chapter: hdJson.chapter ?? null,
        section: hdJson.section ?? null,
      });
      const apiSec = hdJson.chapter?.sectionCode;
      if (!sectionCode && apiSec != null && String(apiSec).trim()) {
        setSectionCode(canonicalHsCode(apiSec, 2));
      }
      const side = await fetchSectionChapters({ q: searchSubmit });
      setChapterSidebar(side);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [chapterCode, countryCode, year, sectionCode, fetchSectionChapters]);

  useEffect(() => {
    if (screen !== "chapter" || !chapterCode) return;
    void loadChapterScreen();
  }, [screen, chapterCode, loadChapterScreen, countryCode, year]);

  const goHome = useCallback(() => {
    setScreen("home");
    setSectionCode(null);
    setChapterCode(null);
    setSections([]);
    setSectionTableRows([]);
    setHeadings([]);
    setChapterMeta(null);
    setChapterSidebar([]);
    setExplanatoryDetail(null);
    setExplanatoryErr(null);
    setSectionHsDetail(null);
    setSectionHsErr(null);
    setSectionHsTab("tongchim");
    setMainTab("tongchim");
  }, []);

  const pickCountryYear = useCallback(
    (code: string, yOpt: number) => {
      setCountryCode(code);
      setYear(yOpt);
      setExpandedCountryCodes((prev) =>
        prev.includes(code) ? prev : [...prev, code],
      );
      goHome();
    },
    [goHome],
  );

  const goSection = useCallback((code: string | number) => {
    setSectionCode(canonicalHsCode(code, 2));
    setChapterCode(null);
    setScreen("section");
    setHeadings([]);
    setChapterMeta(null);
    setSectionHsTab("tongchim");
  }, []);

  const goChapter = useCallback((sec: string | number, ch: string | number) => {
    setSectionCode(canonicalHsCode(sec, 2));
    setChapterCode(canonicalHsCode(ch, 2));
    setScreen("chapter");
  }, []);

  const goHeadingDetail = useCallback(
    (headingCode: string) => {
      const hCode = normalizeHeadingCode(headingCode);
      if (!hCode || !chapterCode) return;
      const q = withTariffEmbedParam(
        new URLSearchParams({
          countryCode,
          year: String(year),
          sectionCode:
            sectionCode ??
            chapterMeta?.section?.code ??
            canonicalHsCode(chapterMeta?.chapter?.sectionCode ?? "", 2),
          chapterCode: canonicalHsCode(chapterCode, 2),
          headingCode: hCode,
        }),
      );
      saveTariffScheduleNav({
        countryCode,
        year,
        sectionCode:
          sectionCode ??
          chapterMeta?.section?.code ??
          canonicalHsCode(chapterMeta?.chapter?.sectionCode ?? "", 2),
        chapterCode: canonicalHsCode(chapterCode, 2),
        headingCode: hCode,
      });
      router.push(
        `/item-classification/tariff-schedule/heading?${q.toString()}`,
      );
    },
    [
      chapterCode,
      chapterMeta?.chapter?.sectionCode,
      chapterMeta?.section?.code,
      countryCode,
      router,
      sectionCode,
      year,
    ],
  );

  const submitSearch = useCallback(async () => {
    const q = searchQ.trim();
    if (!q) return;

    if (parseHsSearchInput(q)) {
      setHsSearchLoading(true);
      setSearchErr(null);
      try {
        const lookup = await lookupTariffHs(countryCode, year, q);
        saveNavFromHsLookup(countryCode, year, lookup);
        router.push(
          buildTariffHeadingHref({
            countryCode,
            year,
            sectionCode: lookup.sectionCode,
            chapterCode: lookup.chapterCode,
            headingCode: lookup.headingCode,
            hsCode: lookup.matchedHsCode || lookup.hsCode,
            embed: isTariffEmbedContext(),
          }),
        );
      } catch (e) {
        setSearchErr(e instanceof Error ? e.message : String(e));
      } finally {
        setHsSearchLoading(false);
      }
      return;
    }

    setSearchErr(null);
    setSearchSubmit(q);
  }, [countryCode, router, searchQ, year]);

  const groupedHome = useMemo(() => groupBySection(homeRows), [homeRows]);

  const titleSuffix = useMemo(() => {
    if (screen === "home") return "부·류 목록";
    if (screen === "section")
      return `류 목록${sectionCode ? ` (제${sectionCode}부)` : ""}`;
    return `호 목록${chapterCode ? ` (제${chapterCode}류)` : ""}`;
  }, [screen, sectionCode, chapterCode]);

  const selectedCountry = useMemo(
    () => countries.find((c) => c.code === countryCode),
    [countries, countryCode],
  );
  const selectedCountryLabel = useMemo(() => {
    if (!selectedCountry) return "국가 선택";
    return (
      displayCountryName(selectedCountry.name, selectedCountry.code) ||
      selectedCountry.name
    );
  }, [selectedCountry]);

  const hsDivision = countryCode === "KR" ? "KR" : "WCO";
  /** 관세율표 HS 해설 `자료출처` 문구용 — 「○○년도 WCO 해설서」(detail API division) */
  const hsDetailSourceDivision = "WCO";

  const tabDefs = useMemo(() => {
    const all: { id: MainTab; label: string }[] = [
      { id: "tongchim", label: "통칙" },
      { id: "section", label: "부 해설" },
      { id: "chapter", label: "류 해설" },
    ];
    return all;
  }, []);

  const currentPane = useMemo((): Pane | null => {
    if (!explanatoryDetail?.ok) return null;
    if (mainTab === "tongchim") return explanatoryDetail.tongchim?.panes ?? null;
    if (mainTab === "section") return explanatoryDetail.section ?? null;
    return explanatoryDetail.chapter ?? null;
  }, [explanatoryDetail, mainTab]);

  /** 참조 화면: 같은 부 다음 순번 부로 이동 */
  const nextSectionNav = useMemo(() => {
    if (!sections.length || !sectionCode) return null;
    const canon = canonicalHsCode(sectionCode, 2);
    const sorted = [...sections].sort((a, b) =>
      canonicalHsCode(a.section_code, 2).localeCompare(
        canonicalHsCode(b.section_code, 2),
        undefined,
        { numeric: true },
      ),
    );
    const i = sorted.findIndex(
      (s) => canonicalHsCode(s.section_code, 2) === canon,
    );
    if (i < 0 || i >= sorted.length - 1) return null;
    const n = sorted[i + 1]!;
    return {
      code: canonicalHsCode(n.section_code, 2),
      label: (n.section_name ?? "").slice(0, 24),
    };
  }, [sections, sectionCode]);

  const sectionHsPanelRef = useRef<HTMLDivElement | null>(null);

  const sectionHsPane = useMemo((): Pane | null => {
    if (!sectionHsDetail?.ok) return null;
    if (sectionHsTab === "tongchim") {
      return sectionHsDetail.tongchim?.panes ?? null;
    }
    return sectionHsDetail.section ?? null;
  }, [sectionHsDetail, sectionHsTab]);

  useEffect(() => {
    const chCanon = canonicalHsCode(chapterCode, 2);
    if (screen !== "chapter" || !chCanon) {
      setExplanatoryDetail(null);
      setExplanatoryErr(null);
      setExplanatoryLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setExplanatoryLoading(true);
      setExplanatoryErr(null);
      setExplanatoryDetail(null);
      try {
        const ch2 = chCanon;
        const params = new URLSearchParams({
          division: hsDivision,
          scheduleYear: String(year),
          chapterCode: ch2,
        });
        params.set("preferLatestHsManual", "1");
        const r1 = await fetch(
          `/api/tariff/hs-explanatory/resolve-meta?${params.toString()}`,
          { cache: "no-store" },
        );
        const j1 = (await r1.json()) as {
          ok: boolean;
          id?: number;
          error?: string;
        };
        if (!r1.ok || !j1.ok || !j1.id) {
          throw new Error(j1.error || "HS 해설 메타 조회 실패");
        }
        const r2 = await fetch(
          `/api/tariff/hs-explanatory/detail?id=${j1.id}&division=${encodeURIComponent(hsDetailSourceDivision)}`,
          { cache: "no-store" },
        );
        const j2 = (await r2.json()) as DetailJson;
        if (!r2.ok || !j2.ok) {
          throw new Error(j2.error || "HS 해설 본문 로드 실패");
        }
        if (!cancelled) setExplanatoryDetail(j2);
      } catch (e) {
        if (!cancelled) {
          setExplanatoryErr(e instanceof Error ? e.message : String(e));
          setExplanatoryDetail(null);
        }
      } finally {
        if (!cancelled) setExplanatoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screen, chapterCode, year, hsDivision]);

  useEffect(() => {
    const sec = sectionCode ? canonicalHsCode(sectionCode, 2) : "";
    if (screen !== "section" || !sec) {
      setSectionHsDetail(null);
      setSectionHsErr(null);
      setSectionHsLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setSectionHsLoading(true);
      setSectionHsErr(null);
      setSectionHsDetail(null);
      try {
        const params = new URLSearchParams({
          division: hsDivision,
          scheduleYear: String(year),
          sectionCode: sec,
        });
        params.set("preferLatestHsManual", "1");
        const r1 = await fetch(
          `/api/tariff/hs-explanatory/resolve-meta?${params.toString()}`,
          { cache: "no-store" },
        );
        const j1 = (await r1.json()) as {
          ok: boolean;
          id?: number;
          error?: string;
        };
        if (!r1.ok || !j1.ok || !j1.id) {
          throw new Error(j1.error || "HS 해설(부 단위) 메타 조회 실패");
        }
        const r2 = await fetch(
          `/api/tariff/hs-explanatory/detail?id=${j1.id}&division=${encodeURIComponent(hsDetailSourceDivision)}`,
          { cache: "no-store" },
        );
        const j2 = (await r2.json()) as DetailJson;
        if (!r2.ok || !j2.ok) {
          throw new Error(j2.error || "HS 해설 본문 로드 실패");
        }
        if (!cancelled) setSectionHsDetail(j2);
      } catch (e) {
        if (!cancelled) {
          setSectionHsErr(e instanceof Error ? e.message : String(e));
          setSectionHsDetail(null);
        }
      } finally {
        if (!cancelled) setSectionHsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screen, sectionCode, year, hsDivision]);

  return (
    <div className="flex h-screen min-h-[640px] flex-col bg-[#eef5fb] text-slate-900">
      <header className="shrink-0 border-b border-slate-300 bg-white px-4 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 gap-y-2">
          <nav
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-base text-slate-800"
            aria-label="관세율표 위치"
          >
            <span className="shrink-0 font-semibold">관세율표</span>
            <span className="text-slate-400" aria-hidden>
              ›
            </span>
            <CountryFlag code={countryCode} />
            <strong className="min-w-0 truncate font-semibold">
              {selectedCountryLabel}
            </strong>
            <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-sm font-medium tabular-nums text-red-700">
              [{formatSchedulePeriodLabel(year)}]
            </span>
            <span className="hidden text-sm font-normal text-slate-600 sm:inline">
              · {titleSuffix}
            </span>
          </nav>
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              className="min-w-[10rem] max-w-[18rem] flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm sm:min-w-[12rem] sm:flex-initial"
              placeholder="검색 (HS·부·류 명칭)"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitSearch();
              }}
            />
            <CasSearchButton
              type="button"
              disabled={hsSearchLoading}
              onClick={() => void submitSearch()}
            >
              {hsSearchLoading ? "조회 중…" : "검색"}
            </CasSearchButton>
            {screen !== "home" ? (
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => {
                  if (screen === "chapter" && sectionCode) {
                    goSection(sectionCode);
                  } else {
                    goHome();
                  }
                }}
              >
                {screen === "chapter" ? "← 류 목록" : "← 부·류 목록"}
              </button>
            ) : null}
            </div>
            {searchErr ? (
              <p className="max-w-md text-right text-xs text-red-600">{searchErr}</p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-slate-300 bg-white">
          <div className="shrink-0 border-b border-slate-200 bg-slate-50/90 px-3 py-2">
            <div className="text-xs font-semibold text-slate-800">국가 · 연도</div>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              국가 이름을 펼친 뒤 연도를 선택하세요.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <ul className="space-y-1" role="tree" aria-label="국가별 관세율표 연도">
              {countries.map((c) => {
                const open = expandedCountryCodes.includes(c.code);
                const yearsSidebar = getYearsForSidebarCountry(c.code);
                const label = displayCountryName(c.name, c.code) || c.name;
                const activeCountry = countryCode === c.code;

                return (
                  <li
                    key={c.code}
                    className={`rounded-lg border px-1.5 py-1 ${
                      activeCountry
                        ? "border-blue-200 bg-blue-50/70"
                        : "border-transparent bg-transparent"
                    }`}
                    role="treeitem"
                    aria-expanded={open}
                    aria-selected={activeCountry}
                  >
                    <div className="flex items-stretch gap-0.5">
                      <button
                        type="button"
                        className={`flex w-8 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-white/90 hover:text-slate-800`}
                        aria-label={
                          open
                            ? `${label} 연도 목록 접기`
                            : `${label} 연도 목록 펼치기`
                        }
                        onClick={() => toggleSidebarCountry(c.code)}
                      >
                        <span
                          className={`inline-block select-none transition-transform duration-150 ${
                            open ? "" : "-rotate-90"
                          }`}
                          aria-hidden
                        >
                          ▼
                        </span>
                      </button>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 pl-0.5 pr-2 text-left text-sm hover:bg-white/70"
                        onClick={() => toggleSidebarCountry(c.code)}
                      >
                        <CountryFlag code={c.code} />
                        <span
                          className={`truncate ${
                            activeCountry ? "font-semibold text-blue-950" : "text-slate-800"
                          }`}
                        >
                          {label}
                        </span>
                      </button>
                    </div>

                    {open ? (
                      <ul
                        className="mb-1 ml-9 mt-0.5 max-h-[min(50vh,24rem)] space-y-0.5 overflow-y-auto border-l border-slate-200 pl-3"
                        role="group"
                      >
                        {yearsSidebar.length === 0 ? (
                          <li className="py-2 text-xs text-slate-500">
                            표시할 연도가 없습니다.
                          </li>
                        ) : (
                          yearsSidebar.map((yOpt) => (
                            <li key={yOpt}>
                              <button
                                type="button"
                                onClick={() => pickCountryYear(c.code, yOpt)}
                                className={`block w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                                  countryCode === c.code && year === yOpt
                                    ? "font-bold text-red-700 ring-1 ring-red-200/70 bg-white shadow-sm"
                                    : "text-slate-700 hover:bg-white/90"
                                }`}
                              >
                                {formatSchedulePeriodLabel(yOpt)}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-3">
          {err ? (
              <p className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {err}
              </p>
            ) : null}

            <p className="mb-3 text-xs text-slate-500 sm:hidden">{titleSuffix}</p>

            {screen === "home" ? (
              <div className="overflow-x-auto rounded border border-slate-300 bg-white shadow-sm">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-300 bg-slate-200 text-slate-800">
                      <th
                        className="border border-slate-300 px-2 py-2 text-center font-normal"
                        colSpan={2}
                      >
                        부
                      </th>
                      <th
                        className="border border-slate-300 px-2 py-2 text-center font-normal"
                        colSpan={2}
                      >
                        류
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="border border-slate-300 bg-white px-3 py-10 text-center text-slate-600"
                        >
                          불러오는 중…
                        </td>
                      </tr>
                    ) : groupedHome.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="border border-slate-300 bg-white px-3 py-10 text-center text-slate-600"
                        >
                          {yearOptions.length > 0 ? (
                            <>
                              <span className="block font-normal text-slate-800">
                                [{formatSchedulePeriodLabel(year)}] {selectedCountryLabel} — 부·류 데이터 없음
                              </span>
                              <span className="mt-2 block text-xs text-slate-600">
                                이 연도·국가 조합에는 등록된 관세율표가 없습니다.
                              </span>
                            </>
                          ) : (
                            "표시할 류가 없습니다. 국가·연도를 확인하세요."
                          )}
                        </td>
                      </tr>
                    ) : (
                      groupedHome.map(([sec, rows]) =>
                        rows.map((row, idx) => (
                          <tr
                            key={`${sec}-${row.chapter_code}`}
                            className="text-neutral-950"
                          >
                            {idx === 0 ? (
                              <>
                                <td
                                  className="w-11 border border-slate-300 bg-white px-1 py-0.5 text-center align-middle font-mono text-xs tabular-nums text-neutral-950"
                                  rowSpan={rows.length}
                                >
                                  {canonicalHsCode(row.section_code, 2)}
                                </td>
                                <td
                                  className="w-[11.5rem] max-w-[11.5rem] border border-slate-300 bg-white px-1.5 py-0.5 align-middle text-[13px] leading-snug font-normal text-neutral-950"
                                  rowSpan={rows.length}
                                >
                                  <button
                                    type="button"
                                    className="inline cursor-pointer border-0 bg-transparent p-0 text-left font-normal text-black no-underline outline-none hover:text-blue-700 hover:underline hover:underline-offset-2 focus-visible:text-blue-700 focus-visible:underline focus-visible:underline-offset-2"
                                    onClick={() => goSection(row.section_code)}
                                  >
                                    {row.section_name}
                                  </button>
                                  {row.section_name_en ? (
                                    <div className="mt-0 text-[11px] font-normal leading-snug text-neutral-600">
                                      {row.section_name_en}
                                    </div>
                                  ) : null}
                                </td>
                              </>
                            ) : null}
                            <td className="w-11 border border-slate-300 bg-white px-1.5 py-3 text-center align-middle font-mono text-sm tabular-nums text-neutral-950">
                              {row.chapter_code}
                            </td>
                            <td className="border border-slate-300 bg-white px-2.5 py-3 align-middle text-sm leading-relaxed text-neutral-950">
                              <button
                                type="button"
                                className="inline cursor-pointer border-0 bg-transparent p-0 text-left font-normal text-black no-underline outline-none hover:text-blue-700 hover:underline hover:underline-offset-2 focus-visible:text-blue-700 focus-visible:underline focus-visible:underline-offset-2"
                                onClick={() =>
                                  goChapter(row.section_code, row.chapter_code)
                                }
                              >
                                {row.chapter_name}
                              </button>
                            </td>
                          </tr>
                        )),
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}

            {screen === "section" ? (
              <div className="flex min-w-0 flex-1 gap-3">
                <div className="flex w-[26rem] min-w-[22rem] shrink-0 flex-col overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
                  <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600">
                    부
                  </div>
                  <ul className="max-h-[calc(100vh-12rem)] flex-1 overflow-y-auto p-1.5 text-sm">
                    {sections.map((s) => {
                      const canon = canonicalHsCode(s.section_code, 2);
                      const active =
                        canonicalHsCode(sectionCode, 2) === canon;
                      return (
                        <li key={s.section_code}>
                          <button
                            type="button"
                            onClick={() =>
                              setSectionCode(canonicalHsCode(s.section_code, 2))
                            }
                            className={`mb-0.5 w-full rounded border border-transparent px-1.5 py-1 text-left leading-snug transition-colors ${
                              active
                                ? "border-blue-200 bg-[#1e2f4f] text-white shadow-sm"
                                : "hover:border-slate-200 hover:bg-slate-50 text-slate-800"
                            }`}
                          >
                            <span
                              className={`block text-[11px] font-bold leading-tight ${active ? "text-white" : "text-slate-600"}`}
                            >
                              제{canon}부
                            </span>
                            <span
                              className={`mt-0 block whitespace-pre-wrap break-words text-[12px] font-medium leading-snug ${
                                active ? "text-blue-50" : "text-neutral-900"
                              }`}
                            >
                              {s.section_name || "—"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                  <div className="min-h-0 shrink-0 overflow-x-auto rounded border border-slate-300 bg-white shadow-sm">
                    <div className="flex flex-wrap items-center justify-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900">
                      <span>품명</span>
                      <span className="text-slate-600">[</span>
                      <CountryFlag code={countryCode} />
                      <span>{selectedCountryLabel}</span>
                      <span className="tabular-nums">{formatSchedulePeriodLabel(year)}</span>
                      <span className="text-slate-600">]</span>
                    </div>
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-100">
                          <th
                            rowSpan={2}
                            className="w-[4.25rem] border border-slate-200 px-2 py-2 text-center align-middle text-sm font-semibold text-slate-800"
                          >
                            류
                          </th>
                          <th
                            colSpan={2}
                            className="border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-800"
                          >
                            품명
                          </th>
                        </tr>
                        <tr className="border-b border-slate-200 bg-slate-100">
                          <th className="min-w-[16rem] border border-slate-200 px-3 py-1.5 text-center  text-sm font-semibold text-slate-800">
                            한글
                          </th>
                          <th className="min-w-[16rem] border border-slate-200 px-3 py-1.5 text-center text-sm font-semibold text-slate-800">
                            영문
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td
                              colSpan={3}
                              className="border border-slate-200 px-3 py-10 text-center text-slate-500"
                            >
                              불러오는 중…
                            </td>
                          </tr>
                        ) : sectionTableRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={3}
                              className="border border-slate-200 px-3 py-10 text-center text-slate-500"
                            >
                              표시할 류가 없습니다.
                            </td>
                          </tr>
                        ) : (
                          sectionTableRows.map((row) => {
                            const ch = canonicalHsCode(row.chapter_code, 2);
                            return (
                              <tr
                                key={row.chapter_code}
                                className="border-b border-slate-200 bg-white"
                              >
                                <td className="border border-slate-200 bg-white px-2 py-3.5 text-center align-middle font-mono text-sm tabular-nums text-neutral-950">
                                  {ch}
                                </td>
                                <td className="border border-slate-200 px-3 py-3.5 align-middle leading-relaxed text-neutral-950">
                                  <button
                                    type="button"
                                    className="inline cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-black no-underline outline-none hover:text-blue-700 hover:underline hover:underline-offset-2 focus-visible:text-blue-700 focus-visible:underline focus-visible:underline-offset-2"
                                    onClick={() =>
                                      goChapter(
                                        row.section_code,
                                        row.chapter_code,
                                      )
                                    }
                                  >
                                    {row.chapter_name}
                                  </button>
                                </td>
                                <td className="border border-slate-200 px-3 py-3.5 align-middle leading-relaxed text-neutral-950">
                                  {row.chapter_name_en || ""}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                    {nextSectionNav ? (
                      <div className="flex justify-end border-t border-slate-200 bg-slate-50/80 px-3 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSectionCode(nextSectionNav.code)
                          }
                          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
                          title={
                            nextSectionNav.label
                              ? `제${nextSectionNav.code}부 ${nextSectionNav.label}`
                              : `제${nextSectionNav.code}부`
                          }
                        >
                          제{nextSectionNav.code}부
                          <span className="ml-1 text-slate-500">›</span>
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div
                    ref={sectionHsPanelRef}
                    role="region"
                    aria-label="HS 해설 부·통칙"
                    className="flex min-h-[min(380px,38vh)] shrink-0 flex-col overflow-hidden rounded border border-slate-300 bg-white shadow-sm"
                  >
                    <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-3 py-2">
                      <h3 className="text-sm font-semibold text-slate-900">
                        HS 해설
                      </h3>
                      <p className="text-right text-xs text-slate-500">
                        자료출처 :{" "}
                        {sectionHsDetail?.ok
                          ? (sectionHsDetail.sourceLabel ?? "—")
                          : sectionCode
                            ? `부 ${canonicalHsCode(sectionCode, 2)} · WCO 해설서 참조 예정`
                            : "—"}
                      </p>
                    </div>
                    <div className="shrink-0 border-b border-slate-200 px-2 pt-2">
                      <div className="flex flex-wrap gap-1">
                        {(
                          [
                            ["tongchim", "통칙"],
                            ["section", "부 해설"],
                          ] as const
                        ).map(([id, lab]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setSectionHsTab(id)}
                            className={`rounded-t px-3 py-2 text-sm font-medium ${
                              sectionHsTab === id
                                ? "bg-[#1e2f4f] text-white"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                          >
                            {lab}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="min-h-[180px] flex-1 overflow-y-auto p-3">
                      {sectionHsLoading ? (
                        <p className="text-sm text-slate-500">
                          해설 불러오는 중…
                        </p>
                      ) : sectionHsErr ? (
                        <p className="text-sm leading-relaxed text-red-700">
                          {sectionHsErr}{" "}
                          <span className="block text-xs text-red-600/90">
                            (HS 해설 DB·적용연도·부 메타를 확인하세요.)
                          </span>
                        </p>
                      ) : !sectionHsDetail?.ok ? (
                        <p className="text-sm text-slate-500">
                          해설을 표시할 수 없습니다.
                        </p>
                      ) : (
                        <HsExplanatoryDualPanes
                          mainTab={sectionHsTab}
                          pane={sectionHsPane}
                          leftLang={leftLang}
                          rightLang={rightLang}
                          setLeftLang={setLeftLang}
                          setRightLang={setRightLang}
                          gridClassName="grid min-h-[140px] gap-3 lg:grid-cols-2"
                          innerScrollerClassName="min-h-[120px] flex-1 overflow-y-auto p-3 text-sm leading-relaxed text-slate-800"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {screen === "chapter" ? (
              <div className="flex gap-3">
                <div className="w-[24rem] min-w-[20rem] shrink-0 overflow-hidden rounded border border-slate-300 bg-white">
                  <ul className="max-h-[calc(100vh-12rem)] overflow-y-auto p-1 text-sm">
                    {chapterSidebar.map((row) => (
                      <li key={row.chapter_code}>
                        <button
                          type="button"
                          onClick={() =>
                            goChapter(row.section_code, row.chapter_code)
                          }
                          className={`mb-0.5 w-full rounded px-2 py-1.5 text-left leading-snug ${
                            canonicalHsCode(chapterCode, 2) ===
                            canonicalHsCode(row.chapter_code, 2)
                              ? "bg-[#1e2f4f] text-white"
                              : "hover:bg-slate-100"
                          }`}
                        >
                          <span className="font-mono">{row.chapter_code}</span>{" "}
                          <span className="whitespace-pre-wrap break-words">
                            {row.chapter_name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                    {chapterMeta?.section ? (
                      <div>
                        <span className="text-slate-500">부</span> 제
                        {chapterMeta.section.code}부{" "}
                        {chapterMeta.section.nameKr}
                      </div>
                    ) : null}
                    {chapterMeta?.chapter ? (
                      <div className="mt-1 font-medium text-slate-900">
                        제{chapterCode}류 {chapterMeta.chapter.nameKr}
                      </div>
                    ) : null}
                  </div>
                  <div className="overflow-x-auto rounded border border-slate-300 bg-white shadow-sm">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-3 py-2 font-medium">호</th>
                          <th className="px-3 py-2 font-medium">품명 (한글)</th>
                          <th className="px-3 py-2 font-medium">품명 (영문)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-3 py-10 text-center text-slate-500"
                            >
                              불러오는 중…
                            </td>
                          </tr>
                        ) : headings.length === 0 ? (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-3 py-8 text-center text-slate-500"
                            >
                              호 데이터가 없습니다.
                            </td>
                          </tr>
                        ) : (
                          headings.map((h) => {
                            const hCode = normalizeHeadingCode(h.heading_code);
                            return (
                              <tr
                                key={h.heading_code}
                                role="button"
                                tabIndex={0}
                                onClick={() => goHeadingDetail(hCode)}
                                onKeyDown={(ev) => {
                                  if (ev.key === "Enter" || ev.key === " ") {
                                    ev.preventDefault();
                                    goHeadingDetail(hCode);
                                  }
                                }}
                                className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-blue-50/80"
                              >
                                <td className="whitespace-nowrap px-3 py-2 font-mono">
                                  {h.heading_code}
                                </td>
                                <td className="px-3 py-2">{h.heading_name}</td>
                                <td className="px-3 py-2 text-slate-600">
                                  {h.heading_name_en}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-500">
                    호 품명을 클릭하면 국내관세율 상세목록 화면으로 이동합니다.
                  </p>

                  <section
                    className="flex min-h-[min(420px,40vh)] flex-col overflow-hidden rounded border border-slate-300 bg-white shadow-sm"
                    aria-label="HS 해설"
                  >
                    <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-3 py-2">
                      <h3 className="text-sm font-semibold text-slate-900">
                        HS 해설
                      </h3>
                      <p className="text-right text-xs text-slate-500">
                        자료출처 :{" "}
                        {explanatoryDetail?.ok
                          ? (explanatoryDetail.sourceLabel ?? "—")
                          : chapterCode
                            ? `류 ${chapterCode} · WCO 해설서 참조 예정`
                            : "—"}
                      </p>
                    </div>
                    <div className="shrink-0 border-b border-slate-200 px-2 pt-2">
                      <div className="flex flex-wrap gap-1">
                        {tabDefs.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setMainTab(t.id)}
                            className={`rounded-t px-3 py-2 text-sm font-medium ${
                              mainTab === t.id
                                ? "bg-[#1e2f4f] text-white"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="min-h-[200px] flex-1 overflow-y-auto p-3">
                      {explanatoryLoading ? (
                        <p className="text-sm text-slate-500">
                          해설 불러오는 중…
                        </p>
                      ) : explanatoryErr ? (
                        <p className="text-sm leading-relaxed text-red-700">
                          {explanatoryErr}{" "}
                          <span className="block text-xs text-red-600/90">
                            (HS 해설 DB 경로와 연도별 데이터 존재 여부를 확인하세요.
                            국선택이 한국이 아니면 WCO 해설 기준입니다.)
                          </span>
                        </p>
                      ) : !explanatoryDetail?.ok ? (
                        <p className="text-sm text-slate-500">
                          해설을 표시할 수 없습니다.
                        </p>
                      ) : (
                        <HsExplanatoryDualPanes
                          mainTab={mainTab}
                          pane={currentPane}
                          leftLang={leftLang}
                          rightLang={rightLang}
                          setLeftLang={setLeftLang}
                          setRightLang={setRightLang}
                          gridClassName="grid min-h-[160px] gap-3 lg:grid-cols-2"
                          innerScrollerClassName="min-h-[140px] flex-1 overflow-y-auto p-3 text-sm leading-relaxed text-slate-800"
                        />
                      )}
                    </div>
                  </section>
                </div>
              </div>
            ) : null}
        </main>
      </div>
    </div>
  );
}
