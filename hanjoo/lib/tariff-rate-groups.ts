export type RateRow = {
  rate_code: string;
  rate_value: string;
  rate_name: string;
};

export type FtaRegionId = "europe" | "asia" | "mideast" | "rcep" | "america" | "other";

export type FtaLine = RateRow & {
  label: string;
  order: number;
};

export type FtaRegionBlock = {
  id: FtaRegionId;
  label: string;
  lines: FtaLine[];
};

export type GroupedRates = {
  general: RateRow[];
  fta: FtaRegionBlock[];
  domestic: RateRow[];
  dumping: RateRow[];
};

const REGION_LABEL: Record<FtaRegionId, string> = {
  europe: "유럽",
  asia: "아시아",
  mideast: "중동",
  rcep: "RCEP",
  america: "미주",
  other: "기타",
};

/** Longest prefix wins. Order is the CIEL column sequence inside a region. */
const PREFIXES: { prefix: string; region: FtaRegionId; label: string; order: number }[] = [
  { prefix: "FEFCH", region: "europe", label: "스위스", order: 40 },
  { prefix: "FEFIS", region: "europe", label: "아이슬란드", order: 50 },
  { prefix: "FEFNO", region: "europe", label: "노르웨이", order: 60 },
  { prefix: "FEU", region: "europe", label: "EU", order: 10 },
  { prefix: "FGB", region: "europe", label: "영국", order: 20 },
  { prefix: "FEF", region: "europe", label: "EFTA", order: 30 },

  { prefix: "FRCCN", region: "rcep", label: "중국", order: 10 },
  { prefix: "FRCJP", region: "rcep", label: "일본", order: 20 },
  { prefix: "FRCAS", region: "rcep", label: "아세안", order: 30 },
  { prefix: "FRCAU", region: "rcep", label: "호주", order: 40 },
  { prefix: "FRCNZ", region: "rcep", label: "뉴질랜드", order: 50 },

  { prefix: "FASID", region: "asia", label: "아세안(인도네시아)", order: 34 },
  { prefix: "FASPH", region: "asia", label: "아세안(필리핀)", order: 35 },
  { prefix: "FASTH", region: "asia", label: "아세안(태국)", order: 36 },
  { prefix: "FCN", region: "asia", label: "중국", order: 10 },
  { prefix: "FIN", region: "asia", label: "인도", order: 20 },
  { prefix: "FAS", region: "asia", label: "아세안", order: 30 },
  { prefix: "FVN", region: "asia", label: "베트남", order: 40 },
  { prefix: "FKH", region: "asia", label: "캄보디아", order: 50 },
  { prefix: "FPH", region: "asia", label: "필리핀", order: 60 },
  { prefix: "FSG", region: "asia", label: "싱가포르", order: 70 },
  { prefix: "FID", region: "asia", label: "인도네시아", order: 80 },
  { prefix: "FAU", region: "asia", label: "호주", order: 90 },
  { prefix: "FNZ", region: "asia", label: "뉴질랜드", order: 100 },
  { prefix: "E1", region: "asia", label: "아·태(일반)", order: 200 },
  { prefix: "E2", region: "asia", label: "아·태(방글라데시)", order: 210 },
  { prefix: "E3", region: "asia", label: "아·태(라오스)", order: 220 },

  { prefix: "FTR", region: "mideast", label: "터키", order: 10 },
  { prefix: "FIL", region: "mideast", label: "이스라엘", order: 20 },
  { prefix: "FAE", region: "mideast", label: "UAE", order: 30 },

  { prefix: "FCECR", region: "america", label: "코스타리카", order: 30 },
  { prefix: "FCESV", region: "america", label: "엘살바도르", order: 40 },
  { prefix: "FCEHN", region: "america", label: "온두라스", order: 50 },
  { prefix: "FCENI", region: "america", label: "니카라과", order: 60 },
  { prefix: "FCEPA", region: "america", label: "파나마", order: 70 },
  { prefix: "FCA", region: "america", label: "캐나다", order: 10 },
  { prefix: "FUS", region: "america", label: "미국", order: 20 },
  { prefix: "FCL", region: "america", label: "칠레", order: 80 },
  { prefix: "FCO", region: "america", label: "콜롬비아", order: 90 },
  { prefix: "FPE", region: "america", label: "페루", order: 100 },
];

const SORTED = [...PREFIXES].sort((a, b) => b.prefix.length - a.prefix.length);

const GENERAL_ORDER = ["A", "C", "D", "R", "U", "W", "T", "P", "L", "G", "F"];

const DOMESTIC = new Set(["구분", "세종부호", "농특세과세여부"]);

export type DomesticTaxKey =
  | "구분"
  | "내국세율"
  | "세종부호"
  | "개소세과세기준가격"
  | "농특세과세여부"
  | "기준일자";

const DOMESTIC_KEYS: DomesticTaxKey[] = [
  "구분",
  "내국세율",
  "세종부호",
  "개소세과세기준가격",
  "농특세과세여부",
  "기준일자",
];

/** crawl 행은 rate_code=왼쪽 값, rate_name=오른쪽 칸 이름 */
export function parseDomesticTax(rows: RateRow[]): Record<DomesticTaxKey, string> {
  const fields = Object.fromEntries(DOMESTIC_KEYS.map((k) => [k, ""])) as Record<
    DomesticTaxKey,
    string
  >;
  for (const r of rows) {
    const code = r.rate_code.trim() as DomesticTaxKey;
    if (code in fields) fields[code] = (r.rate_value ?? "").trim();
  }
  return fields;
}

function matchPrefix(code: string) {
  const c = code.toUpperCase();
  return SORTED.find((p) => c.startsWith(p.prefix));
}

function choiceNote(name: string): string {
  const m = name.match(/(선택\d+|추천|상호대응)/);
  if (!m) return "";
  if (m[1] === "선택1") return "";
  return m[1];
}

function generalRank(code: string): number {
  const c = code.toUpperCase();
  const i = GENERAL_ORDER.findIndex((g) => c === g || c.startsWith(g));
  return i < 0 ? 50 : i;
}

export function groupTariffRates(rates: RateRow[]): GroupedRates {
  const general: RateRow[] = [];
  const domestic: RateRow[] = [];
  const dumping: RateRow[] = [];
  const buckets = new Map<FtaRegionId, FtaLine[]>();

  for (const r of rates) {
    const code = r.rate_code.toUpperCase();
    if (DOMESTIC.has(r.rate_code) || DOMESTIC.has(code)) {
      domestic.push(r);
      continue;
    }
    if (code === "I") {
      dumping.push(r);
      continue;
    }
    if (code !== "F" && (code.startsWith("F") || code.startsWith("E"))) {
      const hit = matchPrefix(code) ?? {
        region: "other" as const,
        label: r.rate_name || code,
        order: 900,
      };
      const note = choiceNote(r.rate_name);
      const label = note ? `${hit.label} ${note}(${r.rate_code})` : `${hit.label}(${r.rate_code})`;
      const line: FtaLine = { ...r, label, order: hit.order };
      const arr = buckets.get(hit.region) ?? [];
      arr.push(line);
      buckets.set(hit.region, arr);
      continue;
    }
    general.push(r);
  }

  general.sort((a, b) => generalRank(a.rate_code) - generalRank(b.rate_code) || a.rate_code.localeCompare(b.rate_code));

  const fta: FtaRegionBlock[] = (Object.keys(REGION_LABEL) as FtaRegionId[])
    .map((id) => ({
      id,
      label: REGION_LABEL[id],
      lines: (buckets.get(id) ?? []).sort(
        (a, b) => a.order - b.order || a.rate_code.localeCompare(b.rate_code),
      ),
    }))
    .filter((b) => b.lines.length > 0);

  return { general, fta, domestic, dumping };
}
