import {
  smartLawTableExists,
  withSmartLawDb,
} from "@/hanjoo/lib/smart-law-db";
import { getOriginCielPage, listOriginCielSections } from "@/hanjoo/lib/origin-ciel";

const CONTENT_TABLE: Record<string, string> = {
  ipr: "clip_ipr_content",
  "inter-korean": "clip_nk_trade_content",
  strategic: "clip_strategic_material_content",
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

export type GuideBody = {
  title: string;
  html: string;
  text: string;
  sourceUrl: string;
};

export async function getClearanceBody(slug: string): Promise<GuideBody | null> {
  const table = CONTENT_TABLE[slug];
  if (!table) return null;
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, table))) return null;
    const row = await db.get(
      `SELECT page_ttl, body_html, body_txt, src_url
         FROM ${table}
        ORDER BY rec_id DESC
        LIMIT 1`,
    );
    if (!row) return null;
    return {
      title: str(row.page_ttl),
      html: safeHtml(str(row.body_html)),
      text: str(row.body_txt),
      sourceUrl: str(row.src_url),
    };
  });
}

export type { OriginBlock, OriginChapter, OriginCielPage } from "@/hanjoo/lib/origin-ciel";
export { getOriginCielPage, listOriginCielSections } from "@/hanjoo/lib/origin-ciel";

export type OriginSection = { key: string; name: string };

export function listOriginSections(): OriginSection[] {
  return listOriginCielSections();
}

export function getOriginSection(key: string) {
  return getOriginCielPage(key);
}

export type OriginMarkingRow = {
  hs: string;
  target: string;
  method: string;
};

export async function searchOriginMarking(hs: string, name: string, page: number) {
  const pageSize = 20;
  const p = Math.max(1, page);
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "tariff_origin_marking"))) {
      return { rows: [] as OriginMarkingRow[], total: 0, page: 1 };
    }
    const where = ["year = 2026"];
    const params: unknown[] = [];
    const digits = hs.replace(/\D/g, "");
    if (digits) {
      where.push("hs_code LIKE ?");
      params.push(`${digits}%`);
    }
    const q = name.trim();
    if (q) {
      where.push("(origin_marking_target LIKE ? OR appropriate_marking_method LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;
    const total = num(
      (await db.get(`SELECT COUNT(*) AS n FROM tariff_origin_marking ${whereSql}`, params))?.n,
    );
    const rows = (
      await db.all(
        `SELECT hs_code, origin_marking_target, appropriate_marking_method
           FROM tariff_origin_marking
           ${whereSql}
          ORDER BY hs_code
          LIMIT ? OFFSET ?`,
        [...params, pageSize, (p - 1) * pageSize],
      )
    ).map((row) => ({
      hs: str(row.hs_code),
      target: str(row.origin_marking_target),
      method: str(row.appropriate_marking_method),
    }));
    return { rows, total, page: p };
  });
}

export type HsSpecRow = { hs: string; name: string; registeredAt: string };

export async function searchHsSpec(hs: string, name: string, page: number) {
  const pageSize = 20;
  const p = Math.max(1, page);
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "hs_import_declaration_guide"))) {
      return { rows: [] as HsSpecRow[], total: 0, page: 1 };
    }
    const where: string[] = [];
    const params: unknown[] = [];
    const digits = hs.replace(/\D/g, "");
    if (digits) {
      where.push("hs_code LIKE ?");
      params.push(`${digits}%`);
    }
    const q = name.trim();
    if (q) {
      where.push("product_name LIKE ?");
      params.push(`%${q}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = num(
      (await db.get(`SELECT COUNT(*) AS n FROM hs_import_declaration_guide ${whereSql}`, params))
        ?.n,
    );
    const rows = (
      await db.all(
        `SELECT hs_code, product_name, source_updated_at
           FROM hs_import_declaration_guide
           ${whereSql}
          ORDER BY hs_code
          LIMIT ? OFFSET ?`,
        [...params, pageSize, (p - 1) * pageSize],
      )
    ).map((r) => ({
      hs: str(r.hs_code),
      name: str(r.product_name),
      registeredAt: str(r.source_updated_at).slice(0, 10),
    }));
    return { rows, total, page: p };
  });
}

export type HsSpecDetail = HsSpecRow & {
  fields: { label: string; text: string }[];
};

const HS_FIELDS: { key: string; label: string }[] = [
  { key: "name_guidance", label: "품명 안내" },
  { key: "name_example", label: "품명 예시" },
  { key: "name_error_example", label: "품명 오류예시" },
  { key: "transaction_name_guidance", label: "거래품명 안내" },
  { key: "transaction_name_example", label: "거래품명 예시" },
  { key: "transaction_name_error_example", label: "거래품명 오류예시" },
  { key: "model_spec_guidance", label: "모델·규격 안내" },
  { key: "model_spec_example", label: "모델·규격 예시" },
  { key: "model_spec_error_example", label: "모델·규격 오류예시" },
  { key: "ingredient_guidance", label: "성분 안내" },
  { key: "ingredient_example", label: "성분 예시" },
  { key: "ingredient_error_example", label: "성분 오류예시" },
  { key: "import_requirement_guidance", label: "수입요건 안내" },
  { key: "import_requirement_example", label: "수입요건 예시" },
  { key: "import_requirement_error_example", label: "수입요건 오류예시" },
  { key: "declaration_caution", label: "신고 유의사항" },
  { key: "special_material", label: "특수재질" },
  { key: "remarks", label: "비고" },
];

export async function getHsSpec(hs: string): Promise<HsSpecDetail | null> {
  const digits = hs.replace(/\D/g, "");
  if (!digits) return null;
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "hs_import_declaration_guide"))) return null;
    const row = await db.get(`SELECT * FROM hs_import_declaration_guide WHERE hs_code = ?`, [
      digits,
    ]);
    if (!row) return null;
    return {
      hs: str(row.hs_code),
      name: str(row.product_name),
      registeredAt: str(row.source_updated_at).slice(0, 10),
      fields: HS_FIELDS.map((f) => ({ label: f.label, text: str(row[f.key]) })).filter(
        (f) => f.text,
      ),
    };
  });
}

export type StdCodeRow = {
  id: number;
  seq: number;
  stdCode: string;
  hs: string;
  itemName: string;
  stdName: string;
  spec: string;
};

export async function searchStdCodes(hs: string, name: string, page: number) {
  const pageSize = 20;
  const p = Math.max(1, page);
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "clip_standard_product_code"))) {
      return { rows: [] as StdCodeRow[], total: 0, page: 1 };
    }
    const where: string[] = [];
    const params: unknown[] = [];
    const code = hs.trim();
    if (code) {
      where.push("(hs_code LIKE ? OR std_code LIKE ?)");
      params.push(`${code}%`, `${code}%`);
    }
    const q = name.trim();
    if (q) {
      where.push("(item_name LIKE ? OR std_item_name LIKE ? OR std_spec LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = num(
      (await db.get(`SELECT COUNT(*) AS n FROM clip_standard_product_code ${whereSql}`, params))
        ?.n,
    );
    const rows = (
      await db.all(
        `SELECT id, seq_no, std_code, hs_code, item_name, std_item_name, std_spec
           FROM clip_standard_product_code
           ${whereSql}
          ORDER BY seq_no, id
          LIMIT ? OFFSET ?`,
        [...params, pageSize, (p - 1) * pageSize],
      )
    ).map((r) => ({
      id: num(r.id),
      seq: num(r.seq_no),
      stdCode: str(r.std_code),
      hs: str(r.hs_code),
      itemName: str(r.item_name),
      stdName: str(r.std_item_name),
      spec: str(r.std_spec),
    }));
    return { rows, total, page: p };
  });
}
