import {
  smartLawTableExists,
  withSmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

const TABS = ["과세전적부심사", "심사청구", "심판청구"] as const;

const SECTIONS = [
  { key: "order_text", label: "주문" },
  { key: "claim_reason", label: "청구경위" },
  { key: "claimant_arg", label: "청구인주장" },
  { key: "agency_arg", label: "처분청주장" },
  { key: "issue", label: "쟁점사항" },
  { key: "judgement", label: "심리 및 판단" },
  { key: "conclusion", label: "결론" },
] as const;

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function likeEsc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function formatDate(raw: string): string {
  const t = raw.replace(/\D/g, "");
  if (t.length === 8) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  return raw;
}

export type PrecedentRow = {
  id: string;
  caseNo: string;
  title: string;
  trialType: string;
  issueClass: string;
  decisionDate: string;
  agency: string;
};

export async function searchPrecedents(input: {
  tab?: string;
  caseNo?: string;
  title?: string;
  issue?: string;
  agency?: string;
  page?: number;
}) {
  const pageSize = 20;
  const page = Math.max(Number(input.page) || 1, 1);
  const emptyCounts = { "": 0, 과세전적부심사: 0, 심사청구: 0, 심판청구: 0 };
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "clip_precedent"))) {
      return {
        rows: [] as PrecedentRow[],
        total: 0,
        page,
        pageSize,
        issues: [] as string[],
        agencies: [] as string[],
        counts: emptyCounts,
      };
    }
    const issues = (
      await db.all(
        `SELECT DISTINCT TRIM(dsbd_isue_lrcl_cd_nm) AS v FROM clip_precedent
          WHERE TRIM(IFNULL(dsbd_isue_lrcl_cd_nm,'')) <> ''
          ORDER BY v COLLATE NOCASE`,
      )
    ).map((r) => str(r.v));
    const agencies = (
      await db.all(
        `SELECT DISTINCT TRIM(dsbd_incd_dtrm_ofc_cstm_sgn_nm) AS v FROM clip_precedent
          WHERE TRIM(IFNULL(dsbd_incd_dtrm_ofc_cstm_sgn_nm,'')) <> ''
          ORDER BY v COLLATE NOCASE`,
      )
    ).map((r) => str(r.v));
    const countRows = await db.all(
      `SELECT TRIM(IFNULL(dsbd_incd_clsf_cd_nm,'')) AS t, COUNT(*) AS c
         FROM clip_precedent GROUP BY TRIM(IFNULL(dsbd_incd_clsf_cd_nm,''))`,
    );
    const counts: Record<string, number> = { ...emptyCounts };
    for (const r of countRows) {
      const n = Number(r.c) || 0;
      counts[""] += n;
      const name = str(r.t);
      if (name === "과세전적부심사" || name === "심사청구" || name === "심판청구") {
        counts[name] = n;
      }
    }

    const clauses = ["1=1"];
    const params: unknown[] = [];
    const tab = str(input.tab);
    if ((TABS as readonly string[]).includes(tab)) {
      clauses.push("TRIM(IFNULL(dsbd_incd_clsf_cd_nm,'')) = ?");
      params.push(tab);
    }
    const caseNo = str(input.caseNo);
    if (caseNo) {
      clauses.push("incd_no LIKE '%' || ? || '%' ESCAPE '\\' COLLATE NOCASE");
      params.push(likeEsc(caseNo));
    }
    const title = str(input.title);
    if (title) {
      clauses.push("wrdc_ttle LIKE '%' || ? || '%' ESCAPE '\\' COLLATE NOCASE");
      params.push(likeEsc(title));
    }
    const issue = str(input.issue);
    if (issue) {
      clauses.push("TRIM(IFNULL(dsbd_isue_lrcl_cd_nm,'')) = ?");
      params.push(issue);
    }
    const agency = str(input.agency);
    if (agency) {
      clauses.push("TRIM(IFNULL(dsbd_incd_dtrm_ofc_cstm_sgn_nm,'')) = ?");
      params.push(agency);
    }
    const where = clauses.join(" AND ");
    const total = Number(
      (await db.get(`SELECT COUNT(*) AS c FROM clip_precedent WHERE ${where}`, params))
        ?.c ?? 0,
    );
    const rows = (
      await db.all(
        `SELECT dsbd_incd_no, incd_no, wrdc_ttle, dsbd_incd_clsf_cd_nm,
                dsbd_isue_lrcl_cd_nm, dtrm_dt, dsbd_incd_dtrm_ofc_cstm_sgn_nm
           FROM clip_precedent
          WHERE ${where}
          ORDER BY TRIM(IFNULL(dtrm_dt,'')) DESC, TRIM(IFNULL(incd_no,''))
          LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize],
      )
    ).map((r) => ({
      id: str(r.dsbd_incd_no),
      caseNo: str(r.incd_no),
      title: str(r.wrdc_ttle),
      trialType: str(r.dsbd_incd_clsf_cd_nm),
      issueClass: str(r.dsbd_isue_lrcl_cd_nm),
      decisionDate: formatDate(str(r.dtrm_dt)),
      agency: str(r.dsbd_incd_dtrm_ofc_cstm_sgn_nm),
    }));
    return { rows, total, page, pageSize, issues, agencies, counts };
  });
}

export async function listLatestPrecedents(limit = 3): Promise<PrecedentRow[]> {
  const take = Math.min(Math.max(limit, 1), 20);
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "clip_precedent"))) return [];
    return (
      await db.all(
        `SELECT dsbd_incd_no, incd_no, wrdc_ttle, dsbd_incd_clsf_cd_nm,
                dsbd_isue_lrcl_cd_nm, dtrm_dt, dsbd_incd_dtrm_ofc_cstm_sgn_nm
           FROM clip_precedent
          ORDER BY TRIM(IFNULL(dtrm_dt,'')) DESC, TRIM(IFNULL(incd_no,''))
          LIMIT ?`,
        [take],
      )
    ).map((r) => ({
      id: str(r.dsbd_incd_no),
      caseNo: str(r.incd_no),
      title: str(r.wrdc_ttle),
      trialType: str(r.dsbd_incd_clsf_cd_nm),
      issueClass: str(r.dsbd_isue_lrcl_cd_nm),
      decisionDate: formatDate(str(r.dtrm_dt)),
      agency: str(r.dsbd_incd_dtrm_ofc_cstm_sgn_nm),
    }));
  });
}

export async function getPrecedent(id: string) {
  const key = id.trim();
  if (!key) return null;
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "clip_precedent"))) return null;
    const hasDetail = await smartLawTableExists(db, "clip_precedent_detail");
    const detailJoin = hasDetail
      ? `LEFT JOIN clip_precedent_detail d ON d.dsbd_incd_no = p.dsbd_incd_no`
      : "";
    const detailCols = hasDetail
      ? `, d.order_text, d.claim_reason, d.claimant_arg, d.agency_arg, d.issue, d.judgement, d.conclusion`
      : "";
    const row = await db.get(
      `SELECT p.dsbd_incd_no, p.incd_no, p.wrdc_ttle, p.dsbd_incd_clsf_cd_nm,
              p.dsbd_isue_lrcl_cd_nm, p.dtrm_dt, p.dsbd_incd_dtrm_ofc_cstm_sgn_nm
              ${detailCols}
         FROM clip_precedent p
         ${detailJoin}
        WHERE p.dsbd_incd_no = ?`,
      [key],
    );
    if (!row) return null;
    const sections = SECTIONS.map((s) => ({
      label: s.label,
      text: str(row[s.key]),
    })).filter((s) => s.text);
    const laws = (await smartLawTableExists(db, "clip_precedent_law"))
      ? (
          await db.all(
            `SELECT law_name, law_content FROM clip_precedent_law WHERE dsbd_incd_no = ? ORDER BY id`,
            [key],
          )
        ).map((r) => ({ name: str(r.law_name), content: str(r.law_content) }))
      : [];
    const hs = (await smartLawTableExists(db, "clip_precedent_hs"))
      ? (
          await db.all(
            `SELECT hs_code, kor_name FROM clip_precedent_hs WHERE dsbd_incd_no = ? ORDER BY id`,
            [key],
          )
        ).map((r) => ({ code: str(r.hs_code), name: str(r.kor_name) }))
      : [];
    return {
      id: str(row.dsbd_incd_no),
      caseNo: str(row.incd_no),
      title: str(row.wrdc_ttle),
      trialType: str(row.dsbd_incd_clsf_cd_nm),
      issueClass: str(row.dsbd_isue_lrcl_cd_nm),
      decisionDate: formatDate(str(row.dtrm_dt)),
      agency: str(row.dsbd_incd_dtrm_ofc_cstm_sgn_nm),
      sections,
      laws,
      hs,
    };
  });
}
