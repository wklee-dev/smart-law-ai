import {
  smartLawTableExists,
  withSmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function likeEsc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function digits(v: string): string {
  return v.replace(/\D/g, "");
}

function seoulToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/-/g, "");
}

function pageOf(input: { page?: number; pageSize?: number }) {
  const pageSize = Math.min(Math.max(Number(input.pageSize) || 20, 1), 50);
  const page = Math.max(Number(input.page) || 1, 1);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export type NoticeOption = { key: string; label: string };

export type ImexRow = {
  key: string;
  hs_code: string;
  item_name: string;
  guidance: string;
  imex_type_name: string;
};

export type IntegratedRow = {
  id: number;
  hs_code: string;
  product_name: string;
  guidance: string;
  law_name: string;
  type_name: string;
};

export type ChiefRow = {
  id: number;
  hs_sgn: string;
  item_name: string;
  document_name: string;
  law_name: string;
  start_dt: string;
  end_dt: string;
  imex_name: string;
};

export async function searchImex(input: {
  notice?: string;
  hs?: string;
  type?: string;
  q?: string;
  page?: number;
}) {
  const { page, pageSize, offset } = pageOf(input);
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "imex_notice_item"))) {
      return { notices: [] as NoticeOption[], notice: "", rows: [] as ImexRow[], total: 0, page, pageSize };
    }
    const notices = (await smartLawTableExists(db, "imex_notice_master"))
      ? (
          await db.all(
            `SELECT notice_key, notice_no, notice_date FROM imex_notice_master ORDER BY notice_date DESC, notice_no DESC`,
          )
        ).map((r) => ({
          key: str(r.notice_key),
          label: `${str(r.notice_no)} (${str(r.notice_date)})`,
        }))
      : [];
    const notice = str(input.notice) || notices[0]?.key || "";
    const clauses = ["i.notice_key = ?"];
    const params: unknown[] = [notice];
    const hs = digits(str(input.hs));
    if (hs) {
      clauses.push("REPLACE(REPLACE(TRIM(IFNULL(i.hs_code,'')),'.',''),'-','') LIKE ?");
      params.push(`${hs}%`);
    }
    const type = str(input.type);
    if (type === "01" || type === "02" || type === "03") {
      clauses.push("TRIM(IFNULL(i.imex_type_code,'')) = ?");
      params.push(type);
    }
    const q = str(input.q);
    if (q) {
      const esc = likeEsc(q);
      clauses.push(
        "(i.guidance_text LIKE '%'||?||'%' ESCAPE '\\' OR i.item_name LIKE '%'||?||'%' ESCAPE '\\')",
      );
      params.push(esc, esc);
    }
    const where = clauses.join(" AND ");
    const total = Number(
      (await db.get(`SELECT COUNT(*) AS c FROM imex_notice_item i WHERE ${where}`, params))?.c ??
        0,
    );
    const rows = (
      await db.all(
        `SELECT i.notice_item_key, i.hs_code, i.item_name,
                substr(TRIM(IFNULL(i.guidance_text,'')), 1, 500) AS guidance,
                i.imex_type_name
           FROM imex_notice_item i
          WHERE ${where}
          ORDER BY TRIM(IFNULL(i.hs_code,'')), i.notice_item_key
          LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      )
    ).map((r) => ({
      key: str(r.notice_item_key),
      hs_code: str(r.hs_code),
      item_name: str(r.item_name),
      guidance: str(r.guidance),
      imex_type_name: str(r.imex_type_name),
    }));
    return { notices, notice, rows, total, page, pageSize };
  });
}

export async function searchIntegrated(input: {
  issue?: string;
  hs?: string;
  direction?: string;
  q?: string;
  page?: number;
}) {
  const { page, pageSize, offset } = pageOf(input);
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "clip_integrated_notice_items"))) {
      return {
        notices: [] as NoticeOption[],
        issue: "",
        rows: [] as IntegratedRow[],
        total: 0,
        page,
        pageSize,
      };
    }
    const notices = (
      await db.all(
        `SELECT issue_code, MAX(notice_rule_no) AS rule_no, MAX(issued_date) AS issued
           FROM clip_integrated_notice_items
          GROUP BY issue_code
          ORDER BY issued DESC, issue_code DESC`,
      )
    ).map((r) => ({
      key: str(r.issue_code),
      label: `${str(r.rule_no)} (${str(r.issued)})`,
    }));
    const issue = str(input.issue) || notices[0]?.key || "";
    const clauses = ["i.issue_code = ?"];
    const params: unknown[] = [issue];
    const hs = digits(str(input.hs));
    if (hs) {
      clauses.push("REPLACE(REPLACE(TRIM(IFNULL(i.hs_code,'')),'.',''),'-','') LIKE ?");
      params.push(`${hs}%`);
    }
    const direction = str(input.direction);
    if (direction === "11") {
      clauses.push("(TRIM(IFNULL(i.guidance_type_code,'')) = '11' OR i.guidance_type_name LIKE '%수출%')");
    } else if (direction === "12") {
      clauses.push("(TRIM(IFNULL(i.guidance_type_code,'')) = '12' OR i.guidance_type_name LIKE '%수입%')");
    }
    const q = str(input.q);
    if (q) {
      const esc = likeEsc(q);
      clauses.push(
        "(i.import_export_guidance LIKE '%'||?||'%' ESCAPE '\\' OR i.product_name LIKE '%'||?||'%' ESCAPE '\\')",
      );
      params.push(esc, esc);
    }
    const where = clauses.join(" AND ");
    const total = Number(
      (
        await db.get(
          `SELECT COUNT(*) AS c FROM clip_integrated_notice_items i WHERE ${where}`,
          params,
        )
      )?.c ?? 0,
    );
    const rows = (
      await db.all(
        `SELECT i.item_id, i.hs_code, i.product_name,
                substr(TRIM(IFNULL(i.import_export_guidance,'')), 1, 500) AS guidance,
                i.related_law_name, i.guidance_type_name
           FROM clip_integrated_notice_items i
          WHERE ${where}
          ORDER BY TRIM(IFNULL(i.hs_code,'')), i.item_id
          LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      )
    ).map((r) => ({
      id: Number(r.item_id) || 0,
      hs_code: str(r.hs_code),
      product_name: str(r.product_name),
      guidance: str(r.guidance),
      law_name: str(r.related_law_name),
      type_name: str(r.guidance_type_name),
    }));
    return { notices, issue, rows, total, page, pageSize };
  });
}

export async function searchCustomsChief(input: {
  hs?: string;
  imex?: string;
  doc?: string;
  law?: string;
  history?: boolean;
  page?: number;
}) {
  const { page, pageSize, offset } = pageOf(input);
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "clip_cc_item_requirement"))) {
      return { rows: [] as ChiefRow[], total: 0, page, pageSize };
    }
    const clauses: string[] = [];
    const params: unknown[] = [];
    const hs = digits(str(input.hs));
    if (hs) {
      clauses.push("REPLACE(hs_sgn, '-', '') LIKE ?");
      params.push(`${hs}%`);
    }
    const doc = str(input.doc);
    if (doc) {
      clauses.push("requirement_document_name LIKE '%'||?||'%' ESCAPE '\\'");
      params.push(likeEsc(doc));
    }
    const law = str(input.law);
    if (law) {
      clauses.push("related_law_name LIKE '%'||?||'%' ESCAPE '\\'");
      params.push(likeEsc(law));
    }
    const imex = str(input.imex).toUpperCase();
    if (imex === "E" || imex === "I") {
      clauses.push("(imex_tpcd = ? OR imex_name LIKE ?)");
      params.push(imex, imex === "E" ? "%수출%" : "%수입%");
    }
    if (!input.history) {
      clauses.push(
        "(replace(application_end_dt, '-', '') = '' OR replace(application_end_dt, '-', '') >= ? OR application_end_dt LIKE '2999%')",
      );
      params.push(seoulToday());
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = Number(
      (await db.get(`SELECT COUNT(*) AS c FROM clip_cc_item_requirement ${where}`, params))?.c ??
        0,
    );
    const rows = (
      await db.all(
        `SELECT requirement_id, hs_sgn, item_name, requirement_document_name, related_law_name,
                application_start_dt, application_end_dt, imex_name
           FROM clip_cc_item_requirement
           ${where}
          ORDER BY hs_sgn, application_start_dt DESC, requirement_id
          LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      )
    ).map((r) => ({
      id: Number(r.requirement_id) || 0,
      hs_sgn: str(r.hs_sgn),
      item_name: str(r.item_name),
      document_name: str(r.requirement_document_name),
      law_name: str(r.related_law_name),
      start_dt: str(r.application_start_dt),
      end_dt: str(r.application_end_dt),
      imex_name: str(r.imex_name),
    }));
    return { rows, total, page, pageSize };
  });
}
