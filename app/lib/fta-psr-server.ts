/**
 * FTA 협정별 원산지결정기준 — SmartLawDb (Postgres 우선 / SQLite 폴백)
 * 테이블: fta_psr_item, fta_psr_category, fta_psr_hs_guide
 */
import {
  getSmartLawDbLabel,
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";

export function getFtaPsrDbPath(): string {
  return getSmartLawDbLabel();
}

export async function openFtaPsrDb(): Promise<SmartLawDb> {
  return openSmartLawDb(true);
}

/** 원본 FTA 포털 버튼 순서 */
export const FTA_AGREEMENT_ORDER: {
  key: string;
  nameKo: string;
  nameEn: string;
}[] = [
  { key: "cl", nameKo: "칠레", nameEn: "Chile" },
  { key: "sg", nameKo: "싱가포르", nameEn: "Singapore" },
  { key: "ch", nameKo: "유럽자유무역연합", nameEn: "EFTA" },
  { key: "as2", nameKo: "아세안", nameEn: "ASEAN 2022" },
  { key: "in", nameKo: "인도", nameEn: "India" },
  { key: "eu", nameKo: "유럽연합", nameEn: "EU" },
  { key: "pe", nameKo: "페루", nameEn: "Peru" },
  { key: "us", nameKo: "미국", nameEn: "USA" },
  { key: "tr", nameKo: "튀르키예", nameEn: "Turkiye" },
  { key: "au", nameKo: "호주", nameEn: "Australia" },
  { key: "ca", nameKo: "캐나다", nameEn: "Canada" },
  { key: "cn", nameKo: "중국", nameEn: "China" },
  { key: "nz", nameKo: "뉴질랜드", nameEn: "New Zealand" },
  { key: "vn", nameKo: "베트남", nameEn: "Vietnam" },
  { key: "co", nameKo: "콜롬비아", nameEn: "Colombia" },
  { key: "ni", nameKo: "중미", nameEn: "Central America" },
  { key: "gb", nameKo: "영국", nameEn: "Great Britain" },
  { key: "rc", nameKo: "RCEP", nameEn: "RCEP" },
  { key: "il", nameKo: "이스라엘", nameEn: "Israel" },
  { key: "kh", nameKo: "캄보디아", nameEn: "Cambodia" },
  { key: "id", nameKo: "인도네시아", nameEn: "Indonesia" },
  { key: "ph", nameKo: "필리핀", nameEn: "Philippines" },
  { key: "ae", nameKo: "아랍에미리트연합국", nameEn: "UAE" },
];

export type FtaAgreement = {
  key: string;
  name: string;
  nameKo: string;
  nameEn: string;
  itemCount: number;
};

export type FtaCategory = {
  categoryCode: string;
  itemNameKo: string;
  itemNameEn: string;
};

export type FtaPsrItem = {
  id: number;
  agreementKey: string;
  agreementName: string;
  categoryCode: string;
  hsCode: string;
  division: string;
  itemNameKo: string;
  itemNameEn: string;
  preferenceCriterionKo: string;
  preferenceCriterionEn: string;
  sourceUrl: string;
  retrievedAt: string;
};

export type FtaHsGuideRow = {
  agreementKey: string;
  agreementName: string;
  hsVersion: string;
  guideLabel: string;
  guideValue: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

export async function listFtaAgreements(): Promise<FtaAgreement[]> {
  const db = await openFtaPsrDb();
  try {
    if (!(await smartLawTableExists(db, "fta_psr_item"))) {
      throw new Error("fta_psr_item 테이블이 없습니다.");
    }
    const rows = await db.all(
      `SELECT agreement_key AS k,
              MAX(agreement_name) AS name,
              COUNT(*) AS n
       FROM fta_psr_item
       GROUP BY agreement_key`,
    );
    const byKey = new Map(
      rows.map((r) => [
        str(r.k),
        { name: str(r.name), n: Number(r.n) || 0 },
      ]),
    );
    const ordered: FtaAgreement[] = [];
    for (const meta of FTA_AGREEMENT_ORDER) {
      const hit = byKey.get(meta.key);
      if (!hit) continue;
      ordered.push({
        key: meta.key,
        name: hit.name || meta.nameKo,
        nameKo: meta.nameKo,
        nameEn: meta.nameEn,
        itemCount: hit.n,
      });
      byKey.delete(meta.key);
    }
    for (const [key, hit] of byKey) {
      ordered.push({
        key,
        name: hit.name,
        nameKo: hit.name,
        nameEn: "",
        itemCount: hit.n,
      });
    }
    return ordered;
  } finally {
    await db.close();
  }
}

export async function listFtaCategories(
  agreementKey: string,
): Promise<FtaCategory[]> {
  const key = agreementKey.trim();
  if (!key) return [];
  const db = await openFtaPsrDb();
  try {
    if (!(await smartLawTableExists(db, "fta_psr_category"))) return [];
    const rows = await db.all(
      `SELECT category_code, item_name_ko, item_name_en
       FROM fta_psr_category
       WHERE agreement_key = ?
       ORDER BY category_code`,
      [key],
    );
    return rows.map((r) => ({
      categoryCode: str(r.category_code).padStart(2, "0").slice(-2),
      itemNameKo: str(r.item_name_ko),
      itemNameEn: str(r.item_name_en),
    }));
  } finally {
    await db.close();
  }
}

export async function listFtaHsGuide(
  agreementKey?: string,
): Promise<FtaHsGuideRow[]> {
  const db = await openFtaPsrDb();
  try {
    if (!(await smartLawTableExists(db, "fta_psr_hs_guide"))) return [];
    const key = (agreementKey ?? "").trim();
    const rows = key
      ? await db.all(
          `SELECT agreement_key, agreement_name, hs_version, guide_label, guide_value
           FROM fta_psr_hs_guide
           WHERE agreement_key = ?
           ORDER BY agreement_key, id`,
          [key],
        )
      : await db.all(
          `SELECT agreement_key, agreement_name, hs_version, guide_label, guide_value
           FROM fta_psr_hs_guide
           ORDER BY agreement_key, id`,
        );
    return rows.map((r) => ({
      agreementKey: str(r.agreement_key),
      agreementName: str(r.agreement_name),
      hsVersion: str(r.hs_version),
      guideLabel: str(r.guide_label),
      guideValue: str(r.guide_value),
    }));
  } finally {
    await db.close();
  }
}

export type FtaPsrQuery = {
  agreementKey?: string;
  hsCode?: string;
  itemNameKo?: string;
  itemNameEn?: string;
  itemName?: string;
  criterion?: string;
  categoryCode?: string;
  page?: number;
  pageSize?: number;
};

export type FtaPsrQueryResult = {
  items: FtaPsrItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export async function queryFtaPsrItems(
  q: FtaPsrQuery,
): Promise<FtaPsrQueryResult> {
  const agreementKey = (q.agreementKey ?? "").trim();
  const hsCode = (q.hsCode ?? "").replace(/\D/g, "");
  const itemNameKo = (q.itemNameKo ?? "").trim();
  const itemNameEn = (q.itemNameEn ?? "").trim();
  const itemName = (q.itemName ?? "").trim();
  const criterion = (q.criterion ?? "").trim();
  const categoryCode = (q.categoryCode ?? "").replace(/\D/g, "").slice(0, 2);
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 50));
  const page = Math.max(1, Number(q.page) || 1);

  const hasDetail =
    Boolean(hsCode) ||
    Boolean(itemNameKo) ||
    Boolean(itemNameEn) ||
    Boolean(itemName) ||
    Boolean(criterion) ||
    Boolean(categoryCode);

  if (!agreementKey && !hasDetail) {
    throw new Error(
      "검색조건을 한 가지 이상 입력하세요. (협정 선택 또는 HS코드·품목명·품목분류)",
    );
  }

  const db = await openFtaPsrDb();
  try {
    if (!(await smartLawTableExists(db, "fta_psr_item"))) {
      throw new Error("fta_psr_item 테이블이 없습니다.");
    }

    const where: string[] = [];
    const params: unknown[] = [];

    if (agreementKey) {
      where.push("agreement_key = ?");
      params.push(agreementKey);
    }
    if (hsCode) {
      where.push("hs_code LIKE ?");
      params.push(`${hsCode}%`);
    }
    if (categoryCode) {
      where.push("category_code = ?");
      params.push(categoryCode.padStart(2, "0"));
    }
    if (itemNameKo) {
      where.push("item_name_ko LIKE ?");
      params.push(`%${itemNameKo}%`);
    }
    if (itemNameEn) {
      where.push("item_name_en LIKE ?");
      params.push(`%${itemNameEn}%`);
    }
    if (itemName) {
      where.push("(item_name_ko LIKE ? OR item_name_en LIKE ?)");
      params.push(`%${itemName}%`, `%${itemName}%`);
    }
    if (criterion) {
      where.push(
        "(preference_criterion_ko LIKE ? OR preference_criterion_en LIKE ?)",
      );
      params.push(`%${criterion}%`, `%${criterion}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalRow = await db.get(
      `SELECT COUNT(*) AS n FROM fta_psr_item ${whereSql}`,
      params,
    );
    const total = Number(totalRow?.n) || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;

    const rows = await db.all(
      `SELECT id, agreement_key, agreement_name, category_code, hs_code, division,
              item_name_ko, item_name_en, preference_criterion_ko, preference_criterion_en,
              source_url, retrieved_at
       FROM fta_psr_item
       ${whereSql}
       ORDER BY agreement_key, hs_code, category_code
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    const items: FtaPsrItem[] = rows.map((r) => ({
      id: Number(r.id) || 0,
      agreementKey: str(r.agreement_key),
      agreementName: str(r.agreement_name),
      categoryCode: str(r.category_code),
      hsCode: str(r.hs_code),
      division: str(r.division),
      itemNameKo: str(r.item_name_ko),
      itemNameEn: str(r.item_name_en),
      preferenceCriterionKo: str(r.preference_criterion_ko),
      preferenceCriterionEn: str(r.preference_criterion_en),
      sourceUrl: str(r.source_url),
      retrievedAt: str(r.retrieved_at),
    }));

    return { items, page, pageSize, total, totalPages };
  } finally {
    await db.close();
  }
}

export type FtaHsHierarchyLevel = {
  code: string;
  level: "chapter" | "heading";
  nameKo: string;
  nameEn: string;
};

/**
 * HS 검색 시 상위 류(2자리)·호(4자리) 계층.
 * 류명: fta_psr_category / 호명: tariff_heading(KR)
 */
export async function getFtaHsHierarchy(
  agreementKey: string,
  hsRaw: string,
): Promise<FtaHsHierarchyLevel[]> {
  const digits = hsRaw.replace(/\D/g, "");
  if (digits.length < 2) return [];

  const chapter = digits.slice(0, 2).padStart(2, "0");
  const heading = digits.length >= 4 ? digits.slice(0, 4) : "";
  const levels: FtaHsHierarchyLevel[] = [];

  let key = agreementKey.trim();
  const db = await openFtaPsrDb();
  try {
    if (!key) {
      const hit = await db.get(
        `SELECT agreement_key AS k FROM fta_psr_item
         WHERE hs_code LIKE ? LIMIT 1`,
        [`${digits}%`],
      );
      key = str(hit?.k);
    }

    let chapterKo = "";
    let chapterEn = "";
    if (key && (await smartLawTableExists(db, "fta_psr_category"))) {
      const cat = await db.get(
        `SELECT item_name_ko, item_name_en FROM fta_psr_category
         WHERE agreement_key = ? AND category_code = ? LIMIT 1`,
        [key, chapter],
      );
      chapterKo = str(cat?.item_name_ko);
      chapterEn = str(cat?.item_name_en);
    }
    levels.push({
      code: chapter,
      level: "chapter",
      nameKo: chapterKo,
      nameEn: chapterEn,
    });

    if (heading && heading !== chapter) {
      let nameKo = "";
      let nameEn = "";
      try {
        if (await smartLawTableExists(db, "tariff_heading")) {
          const row = await db.get(
            `SELECT heading_name, heading_name_en
             FROM tariff_heading
             WHERE country_code = 'KR'
               AND CAST(year AS INTEGER) = (
                 SELECT MAX(CAST(year AS INTEGER)) FROM tariff_heading
                 WHERE country_code = 'KR' AND CAST(year AS INTEGER) < 100000
               )
               AND heading_code = ?
             LIMIT 1`,
            [heading],
          );
          nameKo = str(row?.heading_name);
          nameEn = str(row?.heading_name_en);
        }
      } catch {
        /* tariff 보강 실패 시 코드만 */
      }
      levels.push({
        code: heading,
        level: "heading",
        nameKo,
        nameEn,
      });
    }
  } finally {
    await db.close();
  }

  return levels;
}
