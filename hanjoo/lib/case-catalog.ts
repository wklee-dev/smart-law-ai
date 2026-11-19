import { FOREIGN_BUCKETS } from "@/hanjoo/lib/case-buckets";
import { withSmartLawDb, type SmartLawDb } from "@/hanjoo/lib/smart-law-db";

const FOREIGN_BUCKET_SQL = `UPPER(TRIM(COALESCE(NULLIF(TRIM(tab_country_code), ''), country_code)))`;

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function likeEsc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function bindLike(clauses: string[], params: unknown[], column: string, value: string) {
  const t = value.trim();
  if (!t) return;
  clauses.push(`${column} LIKE '%' || ? || '%' ESCAPE '\\' COLLATE NOCASE`);
  params.push(likeEsc(t));
}

export type DomesticListRow = {
  id: number;
  committee_type: string;
  committee_name: string;
  reff_no: string;
  enfr_dt: string;
  cstm_nm: string;
  dtrm_hs_sgn: string;
  cmdt_nm: string;
  imge_cnt: number;
};

export type ForeignListRow = {
  id: number;
  srno: string;
  country: string;
  country_code: string;
  enforce_date: string;
  ref_no: string;
  hs_code: string;
  image_count: number;
  preview: string;
};

async function withDb<T>(fn: (db: SmartLawDb) => Promise<T>): Promise<T> {
  return withSmartLawDb(fn);
}

export async function searchDomesticCases(input: {
  bucket?: string;
  reff?: string;
  hs?: string;
  name?: string;
  keyword?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: DomesticListRow[]; total: number; page: number; pageSize: number; needQuery: boolean }> {
  const reff = str(input.reff);
  const hs = str(input.hs);
  const name = str(input.name);
  const keyword = str(input.keyword);
  const from = str(input.from);
  const to = str(input.to);
  const pageSize = Math.min(Math.max(Number(input.pageSize) || 10, 1), 50);
  const page = Math.max(Number(input.page) || 1, 1);
  if (!reff && !hs && !name && !keyword && !from && !to) {
    return { rows: [], total: 0, page, pageSize, needQuery: true };
  }
  const bucket = str(input.bucket).toUpperCase();
  return withDb(async (db) => {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (bucket === "A" || bucket === "B" || bucket === "C") {
      clauses.push("committee_type = ?");
      params.push(bucket);
    }
    bindLike(clauses, params, "reff_no", reff);
    bindLike(clauses, params, "dtrm_hs_sgn", hs);
    bindLike(clauses, params, "cmdt_nm", name);
    if (from) {
      clauses.push("(enfr_dt IS NOT NULL AND replace(enfr_dt, '-', '') >= replace(?, '-', ''))");
      params.push(from);
    }
    if (to) {
      clauses.push("(enfr_dt IS NOT NULL AND replace(enfr_dt, '-', '') <= replace(?, '-', ''))");
      params.push(to);
    }
    if (keyword) {
      const esc = likeEsc(keyword);
      clauses.push(
        `(reff_no LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE
          OR rrdc_no LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE
          OR dtrm_hs_sgn LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE
          OR cmdt_nm LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE
          OR cmdt_desc LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE
          OR dtrm_rsn_cn LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE)`,
      );
      for (let i = 0; i < 6; i++) params.push(esc);
    }
    const where = clauses.join(" AND ");
    const total = Number(
      (
        await db.get(
          `SELECT COUNT(*) AS c FROM (
               SELECT TRIM(rrdc_no) FROM classification_cases WHERE ${where} GROUP BY TRIM(rrdc_no)
             )`,
          params,
        )
      )?.c ?? 0,
    );
    const rows = (
      await db.all(
        `SELECT id, committee_type, committee_name, reff_no, enfr_dt, cstm_nm, dtrm_hs_sgn, cmdt_nm, imge_cnt
             FROM classification_cases
            WHERE id IN (
              SELECT MAX(id) FROM classification_cases WHERE ${where} GROUP BY TRIM(rrdc_no)
            )
            ORDER BY (CASE WHEN enfr_dt IS NULL OR enfr_dt = '' THEN 1 ELSE 0 END), enfr_dt DESC, id DESC
            LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize],
      )
    ).map((r) => ({
      id: Number(r.id) || 0,
      committee_type: str(r.committee_type),
      committee_name: str(r.committee_name),
      reff_no: str(r.reff_no),
      enfr_dt: str(r.enfr_dt),
      cstm_nm: str(r.cstm_nm),
      dtrm_hs_sgn: str(r.dtrm_hs_sgn),
      cmdt_nm: str(r.cmdt_nm),
      imge_cnt: Number(r.imge_cnt) || 0,
    }));
    return { rows, total, page, pageSize, needQuery: false };
  });
}

export async function getDomesticCase(id: number) {
  if (!Number.isFinite(id) || id <= 0) return null;
  return withDb(async (db) => {
    const row = await db.get(
      `SELECT id, committee_name, reff_no, enfr_dt, cstm_nm, dtrm_hs_sgn, cmdt_nm, cmdt_desc, dtrm_rsn_cn, imge_cnt
           FROM classification_cases WHERE id = ?`,
      [id],
    );
    if (!row) return null;
    const images = (
      await db.all(
        `SELECT MIN(id) AS id
             FROM case_images
            WHERE case_id = ? AND COALESCE(image_size, 0) > 0
            GROUP BY image_seq
            ORDER BY image_seq
            LIMIT 12`,
        [id],
      )
    ).map((r) => Number(r.id) || 0);
    return {
      id: Number(row.id) || 0,
      committee_name: str(row.committee_name),
      reff_no: str(row.reff_no),
      enfr_dt: str(row.enfr_dt),
      cstm_nm: str(row.cstm_nm),
      dtrm_hs_sgn: str(row.dtrm_hs_sgn),
      cmdt_nm: str(row.cmdt_nm),
      cmdt_desc: str(row.cmdt_desc),
      dtrm_rsn_cn: str(row.dtrm_rsn_cn),
      imge_cnt: Number(row.imge_cnt) || 0,
      imageIds: images.filter((n) => n > 0),
    };
  });
}

export async function searchForeignCases(input: {
  bucket?: string;
  ref?: string;
  hs?: string;
  keyword?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: ForeignListRow[]; total: number; page: number; pageSize: number; needQuery: boolean }> {
  const ref = str(input.ref);
  const hs = str(input.hs);
  const keyword = str(input.keyword);
  const from = str(input.from);
  const to = str(input.to);
  const pageSize = Math.min(Math.max(Number(input.pageSize) || 10, 1), 50);
  const page = Math.max(Number(input.page) || 1, 1);
  const bucket = str(input.bucket).toUpperCase();
  const known = FOREIGN_BUCKETS.some((b) => b.code === bucket);
  if (!ref && !hs && !keyword && !from && !to) {
    return { rows: [], total: 0, page, pageSize, needQuery: true };
  }
  return withDb(async (db) => {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (known) {
      clauses.push(`${FOREIGN_BUCKET_SQL} = ?`);
      params.push(bucket);
    }
    bindLike(clauses, params, "ref_no", ref);
    bindLike(clauses, params, "hs_code", hs);
    if (from) {
      clauses.push("(enforce_date IS NOT NULL AND replace(enforce_date, '-', '') >= replace(?, '-', ''))");
      params.push(from);
    }
    if (to) {
      clauses.push("(enforce_date IS NOT NULL AND replace(enforce_date, '-', '') <= replace(?, '-', ''))");
      params.push(to);
    }
    if (keyword) {
      const esc = likeEsc(keyword);
      const cols = [
        "ref_no",
        "hs_code",
        "goods_name",
        "goods_desc_org",
        "goods_desc_kor",
        "goods_desc_eng",
        "reply_org",
        "reply_kor",
        "keyword",
      ];
      clauses.push(`(${cols.map((c) => `${c} LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE`).join(" OR ")})`);
      for (let i = 0; i < cols.length; i++) params.push(esc);
    }
    const where = clauses.join(" AND ");
    const total = Number(
      (
        await db.get(
          `SELECT COUNT(*) AS c FROM (
               SELECT TRIM(prlst_clsf_srno) FROM foreign_cases WHERE ${where} GROUP BY TRIM(prlst_clsf_srno)
             )`,
          params,
        )
      )?.c ?? 0,
    );
    const rows = (
      await db.all(
        `SELECT id, prlst_clsf_srno, country, ${FOREIGN_BUCKET_SQL} AS bucket_code,
                  enforce_date, ref_no, hs_code, CAST(COALESCE(image_count, 0) AS INTEGER) AS image_count,
                  substr(trim(COALESCE(NULLIF(goods_name,''), NULLIF(goods_desc_kor,''), NULLIF(goods_desc_org,''), '')), 1, 180) AS preview
             FROM foreign_cases
            WHERE id IN (
              SELECT MAX(id) FROM foreign_cases WHERE ${where} GROUP BY TRIM(prlst_clsf_srno)
            )
            ORDER BY (CASE WHEN enforce_date IS NULL OR enforce_date = '' THEN 1 ELSE 0 END), enforce_date DESC, id DESC
            LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize],
      )
    ).map((r) => ({
      id: Number(r.id) || 0,
      srno: str(r.prlst_clsf_srno),
      country: str(r.country),
      country_code: str(r.bucket_code),
      enforce_date: str(r.enforce_date),
      ref_no: str(r.ref_no),
      hs_code: str(r.hs_code),
      image_count: Number(r.image_count) || 0,
      preview: str(r.preview),
    }));
    return { rows, total, page, pageSize, needQuery: false };
  });
}

export type ForeignCaseDetail = {
  id: number;
  base_year: string;
  country: string;
  country_code: string;
  ref_no: string;
  enforce_date: string;
  hs_code: string;
  goods_name: string;
  goods_desc: string;
  material: string;
  purpose: string;
  reason: string;
  issue_place: string;
  keyword: string;
  image_count: number;
  imageIds: number[];
};

/** id로 조회 — prlst_clsf_srno는 국가별 일련번호라 교차 충돌함 */
export async function getForeignCase(id: number): Promise<ForeignCaseDetail | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  return withDb(async (db) => {
    const row = await db.get(
      `SELECT id, prlst_clsf_srno, base_year, country, country_code, tab_country_code,
                ref_no, enforce_date, hs_code, image_count,
                goods_name, goods_name_decl, goods_desc_org, goods_desc_kor, goods_desc_eng,
                material, purpose, reason_org, reason_kor, reason_eng, issue_place, keyword
           FROM foreign_cases WHERE id = ?`,
      [id],
    );
    if (!row) return null;
    const pick = (...vals: unknown[]) => {
      for (const v of vals) {
        const t = str(v);
        if (t) return t;
      }
      return "";
    };
    const countryCode = pick(row.tab_country_code, row.country_code);
    const srno = str(row.prlst_clsf_srno);
    let imageIds: number[] = [];
    if (countryCode && srno) {
      imageIds = (
        await db.all(
          `SELECT id FROM foreign_case_images
              WHERE UPPER(TRIM(country_code)) = UPPER(?)
                AND TRIM(case_srno) = ?
                AND COALESCE(image_size, length(image_data), 0) > 0
              ORDER BY seq, id
              LIMIT 12`,
          [countryCode, srno],
        )
      )
        .map((r) => Number(r.id) || 0)
        .filter((n) => n > 0);
    }
    return {
      id: Number(row.id) || 0,
      base_year: str(row.base_year),
      country: str(row.country),
      country_code: countryCode,
      ref_no: str(row.ref_no),
      enforce_date: str(row.enforce_date),
      hs_code: str(row.hs_code),
      goods_name: str(row.goods_name),
      goods_desc: pick(row.goods_name_decl, row.goods_desc_kor, row.goods_desc_org, row.goods_desc_eng),
      material: str(row.material),
      purpose: str(row.purpose),
      reason: pick(row.reason_kor, row.reason_org, row.reason_eng),
      issue_place: str(row.issue_place),
      keyword: str(row.keyword),
      image_count: Number(row.image_count) || imageIds.length,
      imageIds,
    };
  });
}

export async function readForeignCaseImage(
  id: number,
): Promise<{ data: Buffer; contentType: string } | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  return withDb(async (db) => {
    const row = await db.get(
      `SELECT image_data, image_ext FROM foreign_case_images
          WHERE id = ? AND COALESCE(image_size, length(image_data), 0) > 0`,
      [id],
    );
    if (!row?.image_data) return null;
    const data = Buffer.isBuffer(row.image_data)
      ? row.image_data
      : Buffer.from(row.image_data as Uint8Array);
    if (!data.length) return null;
    const ext = str(row.image_ext).replace(/^\./, "").toLowerCase();
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "gif"
          ? "image/gif"
          : ext === "webp"
            ? "image/webp"
            : "image/jpeg";
    return { data, contentType };
  });
}
