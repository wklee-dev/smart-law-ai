import {
  smartLawTableExists,
  withSmartLawDb,
  type SmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

/** cl_fta_nation.fta_cd → clip_fta_agreement_country.country_label */
const COUNTRY_KEYS: Record<string, string[]> = {
  FCL: ["칠레"],
  FSG: ["싱가포르"],
  FEF: ["유럽자유무역연합 회원국"],
  FAS: ["동남아시아국가연합"],
  FIN: ["인도"],
  FEU: ["유럽연합"],
  FGB: ["영국"],
  FPE: ["페루"],
  FUS: ["미국"],
  FTR: ["터키", "튀르키예"],
  FAU: ["호주"],
  FCA: ["캐나다"],
  FCO: ["콜롬비아"],
  FCN: ["중국"],
  FVN: ["베트남"],
  FNZ: ["뉴질랜드"],
  FCE: ["중미 5개국(코스타리카,엘사바도르,온두라스,니카라과,파나마)"],
  FIL: ["이스라엘"],
  FKH: ["캄보디아"],
  FID: ["인도네시아"],
  FPH: ["필리핀"],
  FAE: ["아랍에미리트"],
};

const SIDE_TEXT = /개정|교환각서|의정서|부속서|해석|추가의정서/;

export type FtaTreatyPart = { id: string; title: string; lang: string };

export type FtaTreatyView = {
  code: string;
  name: string;
  number: string;
  effect: string;
  lang: string;
  parts: FtaTreatyPart[];
  partId: string;
  body: string;
};

type TreatyHit = {
  srno: string;
  name: string;
  number: string;
  effect: string;
  korean: string;
};

type DocRow = { id: string; lang: string; fileName: string; len: number };

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function ymd(raw: string): string {
  const s = raw.replace(/\D/g, "");
  if (s.length >= 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return raw;
}

function partTitle(fileName: string): string {
  return fileName
    .replace(/^\d+\.\s*/, "")
    .replace(/\.(pdf|hwp)$/i, "")
    .replace(/_/g, " ")
    .trim();
}

function partOrder(fileName: string): number {
  const m = fileName.match(/^(\d+)/);
  return m ? Number(m[1]) : 9999;
}

async function findTreaty(db: SmartLawDb, code: string): Promise<TreatyHit | null> {
  const keys = COUNTRY_KEYS[code];
  if (!keys?.length) return null;
  if (
    !(await smartLawTableExists(db, "clip_treaties")) ||
    !(await smartLawTableExists(db, "clip_fta_agreement_country"))
  ) {
    return null;
  }
  const marks = keys.map(() => "?").join(",");
  const rows = await db.all(
    `SELECT DISTINCT t.trty_srno, t.treaty_name, t.treaty_number, t.effective_date, t.korean_content
       FROM clip_fta_agreement_country c
       JOIN clip_treaties t ON t.trty_srno = c.trty_srno
      WHERE c.is_primary = 1
        AND t.category_name = 'FTA협정'
        AND c.country_label IN (${marks})`,
    keys,
  );
  const hits = rows.map((row) => ({
    srno: str(row.trty_srno),
    name: str(row.treaty_name),
    number: str(row.treaty_number),
    effect: str(row.effective_date),
    korean: str(row.korean_content),
  }));
  const main = hits.filter((hit) => !SIDE_TEXT.test(hit.name));
  const pool = main.length ? main : hits;
  pool.sort((a, b) => a.name.length - b.name.length);
  return pool[0] ?? null;
}

async function listDocs(db: SmartLawDb, srno: string): Promise<DocRow[]> {
  if (!(await smartLawTableExists(db, "clip_fta_agreement_doc"))) return [];
  const rows = await db.all(
    `SELECT doc_id, lang, file_name, length(content_text) len
       FROM clip_fta_agreement_doc
      WHERE trty_srno = ? AND content_text IS NOT NULL AND length(content_text) > 80`,
    [srno],
  );
  const docs = rows.map((row) => ({
    id: str(row.doc_id),
    lang: str(row.lang),
    fileName: str(row.file_name),
    len: Number(row.len) || 0,
  }));
  const korean = docs.filter(
    (doc) => /[가-힣]/.test(doc.fileName) && !/영문|CHAPTER|ANNEX/i.test(doc.fileName),
  );
  const picked = korean.length ? korean : docs.filter((doc) => doc.lang === "KO");
  const use = picked.length ? picked : docs;
  return [...use].sort(
    (a, b) => partOrder(a.fileName) - partOrder(b.fileName) || a.fileName.localeCompare(b.fileName, "ko"),
  );
}

export async function ftaTreatyPath(db: SmartLawDb, code: string): Promise<string> {
  const hit = await findTreaty(db, code);
  return hit ? `/rates/fta/treaty?code=${encodeURIComponent(code)}` : "";
}

export async function loadFtaTreaty(
  code: string,
  partId: string,
): Promise<FtaTreatyView | null> {
  const key = code.trim();
  if (!key) return null;
  return withSmartLawDb(async (db) => {
    const hit = await findTreaty(db, key);
    if (!hit) return null;
    const docs = await listDocs(db, hit.srno);
    const picked = docs.find((doc) => doc.id === partId) ?? docs[0];
    let body = "";
    let lang = "KO";
    if (picked) {
      const row = await db.get(
        `SELECT content_text, lang FROM clip_fta_agreement_doc WHERE doc_id = ? AND trty_srno = ?`,
        [picked.id, hit.srno],
      );
      body = str(row?.content_text);
      lang = str(row?.lang) || picked.lang || "KO";
    }
    if (!body) {
      body = hit.korean;
      lang = "KO";
    }
    const number = hit.number ? `제${hit.number.replace(/^0+/, "")}호` : "";
    return {
      code: key,
      name: hit.name,
      number,
      effect: ymd(hit.effect),
      lang,
      parts: docs.map((doc) => ({
        id: doc.id,
        title: partTitle(doc.fileName) || hit.name,
        lang: doc.lang,
      })),
      partId: picked?.id ?? "",
      body,
    };
  });
}
