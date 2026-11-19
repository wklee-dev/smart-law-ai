import {
  smartLawTableExists,
  withSmartLawDb,
  type SmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

export type CustomsNoticeRow = {
  seq: string;
  name: string;
  linkName: string;
  type: string;
  number: string;
  issueDate: string;
  enforceDate: string;
};

const FEATURED: { label: string; names: string[] }[] = [
  { label: "수입통관사무처리에관한고시", names: ["수입통관 사무처리에 관한 고시"] },
  { label: "수출및반송통관에관한고시", names: ["수출 및 반송통관에 관한 고시"] },
  { label: "관세평가운영에관한고시", names: ["관세평가 운영에 관한 고시"] },
  { label: "납세업무처리에관한고시", names: ["납세업무 처리에 관한 고시"] },
  {
    label: "원산지제도운영에관한고시",
    names: ["원산지제도 운영에 관한 고시", "원산지표시제도 운영에 관한 고시"],
  },
  {
    label: "세관장확인고시",
    names: ["세관장확인고시", "관세법 제226조에 따른 세관장확인물품 및 확인방법 지정고시"],
  },
];

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function like(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function date(value: unknown): string {
  const digits = text(value).replace(/\D/g, "");
  return digits.length >= 8
    ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    : text(value);
}

function mapNotice(row: Record<string, unknown>, name = text(row.admrul_nm)): CustomsNoticeRow {
  return {
    seq: text(row.admrul_seq),
    name,
    linkName: text(row.admrul_nm) || name,
    type: text(row.admrul_type) || "고시",
    number: text(row.issue_no),
    issueDate: date(row.issue_dt),
    enforceDate: date(row.enforce_dt),
  };
}

async function featuredNotices(
  db: SmartLawDb,
  keyword: string,
): Promise<CustomsNoticeRow[]> {
  const q = keyword.trim();
  const hasRule = await smartLawTableExists(db, "admin_rule");
  const rows: CustomsNoticeRow[] = [];
  for (const item of FEATURED) {
    let picked: CustomsNoticeRow | null = null;
    for (const name of item.names) {
      const open = await db.get(
        `SELECT admrul_seq, admrul_nm, admrul_type, issue_no, issue_dt, enforce_dt
           FROM openlaw_admrul_list
          WHERE admrul_nm = ?
          ORDER BY issue_dt DESC
          LIMIT 1`,
        [name],
      );
      if (open) {
        picked = mapNotice(open, item.label);
        break;
      }
    }
    if (!picked) {
      let stored: string | undefined;
      if (hasRule) {
        for (const name of item.names) {
          const hit = await db.get(
            `SELECT 1 AS n FROM admin_rule WHERE law_name = ? AND section_type = '조문' LIMIT 1`,
            [name],
          );
          if (hit) {
            stored = name;
            break;
          }
        }
      }
      picked = {
        seq: "",
        name: item.label,
        linkName: stored || item.names[0],
        type: "고시",
        number: "",
        issueDate: "",
        enforceDate: "",
      };
    }
    if (q && ![picked.name, picked.linkName, picked.number].some((value) => value.includes(q))) {
      continue;
    }
    rows.push(picked);
  }
  return rows;
}

export async function searchCustomsNotices(keyword: string, pageRaw: number) {
  const pageSize = 20;
  const page = Math.max(1, Number(pageRaw) || 1);
  const q = keyword.trim();
  const clauses = ["dept_nm LIKE '%관세청%'", "admrul_type = '고시'"];
  const params: unknown[] = [];
  if (q) {
    clauses.push(
      "(admrul_nm LIKE '%' || ? || '%' ESCAPE '\\' OR issue_no LIKE '%' || ? || '%' ESCAPE '\\')",
    );
    const escaped = like(q);
    params.push(escaped, escaped);
  }
  return withSmartLawDb(async (db) => {
    const featured = page === 1 ? await featuredNotices(db, q) : [];
    const hidden = FEATURED.flatMap((item) => item.names);
    if (hidden.length) {
      clauses.push(`admrul_nm NOT IN (${hidden.map(() => "?").join(", ")})`);
      params.push(...hidden);
    }
    const where = clauses.join(" AND ");
    const total = Number(
      (await db.get(`SELECT COUNT(*) AS n FROM openlaw_admrul_list WHERE ${where}`, params))
        ?.n ?? 0,
    );
    const rows = await db.all(
      `SELECT admrul_seq, admrul_nm, admrul_type, issue_no, issue_dt, enforce_dt
         FROM openlaw_admrul_list
        WHERE ${where}
        ORDER BY issue_dt DESC, admrul_seq DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    return {
      featured,
      rows: rows.map((row) => mapNotice(row)),
      total,
      page,
      pageSize,
    };
  });
}
