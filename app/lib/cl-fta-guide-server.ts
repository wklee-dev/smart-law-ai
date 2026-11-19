import "server-only";

import type { DatabaseSync } from "node:sqlite";
import type {
  ClFtaAnnexBlock,
  ClFtaAnnexDoc,
  ClFtaGuide,
  ClFtaGuideLink,
} from "@/app/lib/cl-fta-rate-shared";

type FtaMeta = {
  /** clip_fta_agreement_doc.treaty_number (기본 협정문) */
  treatyNo: string;
  /** FTA특례법 시행규칙 별지 서식 제목 키워드 ('|' 로 여러 개) */
  ruleKw: string;
  /** fta_origin_certificate_form.agreement_code */
  formCode: string;
  /** fta_execution_guidance_post.category */
  guidanceCat: string;
  /** admin_rule.law_name 키워드 (협정별 고시) */
  admrulKw: string;
};

const FTA_META: Record<string, FtaMeta> = {
  FCL: { treatyNo: "1665", ruleKw: "칠레와", formCode: "한칠레", guidanceCat: "한-칠레", admrulKw: "칠레공화국" },
  FSG: { treatyNo: "1767", ruleKw: "싱가포르와", formCode: "한싱가포르", guidanceCat: "한-싱가포르", admrulKw: "싱가포르" },
  FEF: { treatyNo: "1804", ruleKw: "유럽자유무역연합|스위스", formCode: "한EFTA", guidanceCat: "한-EFTA", admrulKw: "유럽자유무역연합" },
  FAS: { treatyNo: "1852", ruleKw: "아세안회원국", formCode: "한아세안", guidanceCat: "한-아세안", admrulKw: "동남아시아국가연합" },
  FIN: { treatyNo: "1982", ruleKw: "인도와", formCode: "한인도", guidanceCat: "한-인도", admrulKw: "인도공화국" },
  FEU: { treatyNo: "2263", ruleKw: "유럽연합당사자", formCode: "한EU", guidanceCat: "한-EU", admrulKw: "유럽연합 및" },
  FPE: { treatyNo: "2054", ruleKw: "페루와", formCode: "한페루", guidanceCat: "한-페루", admrulKw: "페루" },
  FUS: { treatyNo: "2081", ruleKw: "미합중국과", formCode: "한미", guidanceCat: "한-미국", admrulKw: "미합중국" },
  FTR: { treatyNo: "", ruleKw: "튀르키예와", formCode: "한튀르키에", guidanceCat: "한-튀르키예", admrulKw: "튀르키예" },
  FAU: { treatyNo: "2215", ruleKw: "호주와", formCode: "한호주", guidanceCat: "한-호주", admrulKw: "호주" },
  FCA: { treatyNo: "2216", ruleKw: "캐나다와", formCode: "한캐나다", guidanceCat: "한-캐나다", admrulKw: "캐나다" },
  FCO: { treatyNo: "2299", ruleKw: "콜롬비아와", formCode: "한콜롬비아", guidanceCat: "한-콜롬비아", admrulKw: "콜롬비아" },
  FCN: { treatyNo: "2269", ruleKw: "중국과", formCode: "한중국", guidanceCat: "한-중국", admrulKw: "중화인민공화국" },
  FVN: { treatyNo: "", ruleKw: "베트남과", formCode: "한베트남", guidanceCat: "한-베트남", admrulKw: "베트남" },
  FNZ: { treatyNo: "2271", ruleKw: "뉴질랜드와", formCode: "한뉴질랜드", guidanceCat: "한-뉴질랜드", admrulKw: "뉴질랜드" },
  FCE: { treatyNo: "2431", ruleKw: "중미 공화국", formCode: "한중미", guidanceCat: "한-중미", admrulKw: "중미" },
  FGB: { treatyNo: "2465", ruleKw: "영국과", formCode: "한영국", guidanceCat: "한-영국", admrulKw: "영국" },
  FRC: { treatyNo: "", ruleKw: "역내포괄적경제동반자협정", formCode: "RCEP", guidanceCat: "RCEP", admrulKw: "역내포괄적경제동반자" },
  FIL: { treatyNo: "2524", ruleKw: "이스라엘과", formCode: "한이스라엘", guidanceCat: "한-이스라엘", admrulKw: "이스라엘" },
  FKH: { treatyNo: "2525", ruleKw: "캄보디아와", formCode: "한캄보디아", guidanceCat: "한-캄보디아", admrulKw: "캄보디아" },
  FID: { treatyNo: "2531", ruleKw: "인도네시아와", formCode: "한인도네시아", guidanceCat: "한-인도네시아", admrulKw: "인도네시아" },
  FPH: { treatyNo: "2595", ruleKw: "필리핀과", formCode: "한필리핀", guidanceCat: "한-필리핀", admrulKw: "필리핀" },
  FAE: { treatyNo: "2627", ruleKw: "아랍에미리트와", formCode: "한아랍에미리트", guidanceCat: "한-아랍에미리트", admrulKw: "아랍에미리트" },
};

/** 모든 협정에 공통으로 적용되는 국내 법령·고시 (admin_rule.law_name) */
const COMMON_LAWS = [
  "자유무역협정의 이행을 위한 관세법의 특례에 관한 법률(자유무역협정(FTA) 관세법)",
  "자유무역협정의 이행을 위한 관세법의 특례에 관한 법률 시행령",
  "자유무역협정의 이행을 위한 관세법의 특례에 관한 법률 시행규칙",
  "자유무역협정의 이행을 위한 관세법의 특례에 관한 법률 사무처리에 관한 고시",
  "자유무역협정 원산지인증수출자 운영에 관한 고시",
];

const RULE_LAW_ID = "010172";

/** 세율부호 접미 'AS' 는 국가코드가 아니라 아세안 */
const MEMBER_OVERRIDE: Record<string, string> = { AS: "아세안" };

function hasTable(db: DatabaseSync, name: string): boolean {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(name),
  );
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function fmtYmd(v: unknown): string {
  const d = str(v).replace(/\D/g, "");
  if (d.length !== 8) return str(v);
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

function listTreaties(db: DatabaseSync, meta: FtaMeta): ClFtaGuideLink[] {
  if (!meta.treatyNo || !hasTable(db, "clip_fta_agreement_doc")) return [];
  const rows = db
    .prepare(
      `SELECT d.treaty_name, d.treaty_number, d.effective_date, d.attachment_id, d.file_name
         FROM clip_fta_agreement_doc d
        WHERE d.lang = 'KO'
          AND d.trty_srno IN (
                SELECT trty_srno FROM clip_fta_agreement_doc WHERE treaty_number = ?
              )
        ORDER BY d.effective_date, d.treaty_number`,
    )
    .all(meta.treatyNo) as Record<string, unknown>[];
  const seen = new Set<string>();
  const out: ClFtaGuideLink[] = [];
  for (const r of rows) {
    const id = str(r.attachment_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      label: str(r.treaty_name).replace(/\u00a0/g, " "),
      note: [
        str(r.treaty_number) ? `조약 제${str(r.treaty_number)}호` : "",
        str(r.effective_date) ? `발효 ${fmtYmd(r.effective_date)}` : "",
        str(r.file_name),
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/api/clip-treaty/attachment?attachmentId=${encodeURIComponent(id)}`,
    });
  }
  return out;
}

function listLaws(db: DatabaseSync, meta: FtaMeta): ClFtaGuideLink[] {
  if (!hasTable(db, "admin_rule")) return [];
  const pick = db.prepare(
    `SELECT law_name, seq_id, MAX(promulgation_dt) AS dt, promulgation_no
       FROM admin_rule
      WHERE law_name = ?
      GROUP BY law_name`,
  );
  const issueStmt = hasTable(db, "openlaw_admrul_list")
    ? db.prepare(
        `SELECT admrul_type, issue_no, issue_dt, dept_nm FROM openlaw_admrul_list
          WHERE admrul_seq = ?`,
      )
    : null;
  const out: ClFtaGuideLink[] = [];
  const push = (r: Record<string, unknown> | undefined) => {
    if (!r || !str(r.law_name)) return;
    let note = [str(r.promulgation_no), str(r.dt) ? fmtYmd(r.dt) : ""]
      .filter(Boolean)
      .join(" · ");
    if (!str(r.dt) && issueStmt) {
      const iss = issueStmt.get(str(r.seq_id)) as
        | Record<string, unknown>
        | undefined;
      if (iss) {
        note = [
          str(iss.dept_nm),
          str(iss.issue_no)
            ? `${str(iss.admrul_type) || "고시"} 제${str(iss.issue_no)}호`
            : "",
          fmtYmd(iss.issue_dt),
        ]
          .filter(Boolean)
          .join(" · ");
      }
    }
    out.push({
      label: str(r.law_name).replace(/\(자유무역협정\(FTA\) 관세법\)$/, ""),
      note,
      href: "",
    });
  };
  for (const nm of COMMON_LAWS) {
    push(pick.get(nm) as Record<string, unknown> | undefined);
  }
  if (meta.admrulKw) {
    const rows = db
      .prepare(
        `SELECT law_name, seq_id, MAX(promulgation_dt) AS dt, promulgation_no
           FROM admin_rule
          WHERE (law_name LIKE '%자유무역협정%' OR law_name LIKE '%경제동반자%')
            AND law_name LIKE ?
          GROUP BY law_name
          ORDER BY law_name`,
      )
      .all(`%${meta.admrulKw}%`) as Record<string, unknown>[];
    for (const r of rows) push(r);
  }
  return out;
}

function listCertForms(db: DatabaseSync, meta: FtaMeta): ClFtaGuideLink[] {
  const out: ClFtaGuideLink[] = [];
  if (hasTable(db, "latest_law_attachments")) {
    const pm = db
      .prepare(
        "SELECT MAX(pmgt_dt_tp_no) AS pm FROM latest_law_attachments WHERE law_id = ?",
      )
      .get(RULE_LAW_ID) as { pm?: string } | undefined;
    const rows = db
      .prepare(
        `SELECT attachment_id, attachment_label, attachment_kind
           FROM latest_law_attachments
          WHERE law_id = ? AND pmgt_dt_tp_no = ? AND status = 'downloaded'
            AND attachment_label LIKE '[별지%'
            AND attachment_label LIKE '%원산지증명서%'
          ORDER BY saved_relative_path`,
      )
      .all(RULE_LAW_ID, str(pm?.pm)) as Record<string, unknown>[];
    const kws = meta.ruleKw.split("|");
    for (const r of rows) {
      const label = str(r.attachment_label);
      if (!kws.some((k) => label.includes(k))) continue;
      out.push({
        label: str(r.attachment_label),
        note: `FTA특례법 시행규칙 · ${str(r.attachment_kind).toUpperCase()}`,
        href: `/api/clip-latest-law/download?attachmentId=${encodeURIComponent(str(r.attachment_id))}`,
      });
    }
  }
  if (hasTable(db, "fta_origin_certificate_form")) {
    const rows = db
      .prepare(
        `SELECT id, title, file_name FROM fta_origin_certificate_form
          WHERE agreement_code = ? ORDER BY sort_order, id`,
      )
      .all(meta.formCode) as Record<string, unknown>[];
    for (const r of rows) {
      out.push({
        label: str(r.title),
        note: `FTA포털 · ${str(r.file_name)}`,
        href: `/api/fta-origin-certificate-forms/file?id=${encodeURIComponent(str(r.id))}`,
      });
    }
  }
  return out;
}

function listGuidance(db: DatabaseSync, meta: FtaMeta): ClFtaGuideLink[] {
  if (!hasTable(db, "fta_execution_guidance_post")) return [];
  const hasFiles = hasTable(db, "fta_execution_guidance_attachment");
  const posts = db
    .prepare(
      `SELECT post_id, title, registered_date, content_text
         FROM fta_execution_guidance_post
        WHERE category = ?
        ORDER BY registered_date DESC, post_id DESC`,
    )
    .all(meta.guidanceCat) as Record<string, unknown>[];
  const fileStmt = hasFiles
    ? db.prepare(
        `SELECT attachment_id, original_name FROM fta_execution_guidance_attachment
          WHERE post_id = ? AND download_status = 'DOWNLOADED'
          ORDER BY attachment_id`,
      )
    : null;
  const out: ClFtaGuideLink[] = [];
  for (const p of posts) {
    const files = (fileStmt?.all(p.post_id as number) ?? []) as Record<
      string,
      unknown
    >[];
    const body = str(p.content_text);
    const note = [
      str(p.registered_date),
      body && body !== "첨부파일을 참조하시기 바랍니다." ? body.slice(0, 120) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (files.length === 0) {
      out.push({ label: str(p.title), note, href: "" });
      continue;
    }
    files.forEach((f, i) => {
      out.push({
        label: i === 0 ? str(p.title) : `└ ${str(f.original_name)}`,
        note: i === 0 ? [note, str(f.original_name)].filter(Boolean).join(" · ") : "",
        href: `/api/fta-execution-guidance/file?id=${encodeURIComponent(str(f.attachment_id))}`,
      });
    });
  }
  return out;
}

function listRateCodeNames(
  db: DatabaseSync,
  ftaCd: string,
): Record<string, string> {
  if (!hasTable(db, "unipass_stat_code_detail")) return {};
  const rows = db
    .prepare(
      `SELECT detail_code, detail_name_ko FROM unipass_stat_code_detail
        WHERE stat_code = 'TRRT_TPCD' AND detail_code LIKE ?`,
    )
    .all(`${ftaCd}%`) as Record<string, unknown>[];
  const out: Record<string, string> = {};
  for (const r of rows) out[str(r.detail_code)] = str(r.detail_name_ko);
  return out;
}

function listMemberNames(
  db: DatabaseSync,
  ftaCd: string,
  rateCodes: string[],
): Record<string, string> {
  const suffixes = new Set<string>();
  for (const cd of rateCodes) {
    const m = cd.slice(ftaCd.length).match(/^([A-Z]{2})\d*$/);
    if (m) suffixes.add(m[1]!);
  }
  if (suffixes.size === 0) return {};
  const out: Record<string, string> = {};
  const stmt = hasTable(db, "unipass_stat_code_detail")
    ? db.prepare(
        `SELECT detail_name_ko FROM unipass_stat_code_detail
          WHERE stat_code = 'CNTY_CD' AND detail_code = ?`,
      )
    : null;
  for (const s of suffixes) {
    const nm =
      MEMBER_OVERRIDE[s] ??
      str((stmt?.get(s) as { detail_name_ko?: string } | undefined)?.detail_name_ko);
    if (nm) out[s] = nm;
  }
  return out;
}

function listAnnexDocs(
  db: DatabaseSync,
  ftaCd: string,
  kind: "psr_guide" | "cert_items" | "recom",
): ClFtaAnnexDoc[] {
  if (!hasTable(db, "fta_annex_doc")) return [];
  const rows = db
    .prepare(
      `SELECT label, source, source_ref, blocks_json FROM fta_annex_doc
        WHERE fta_cd = ? AND kind = ? ORDER BY sort_no, doc_key`,
    )
    .all(ftaCd, kind) as Record<string, unknown>[];
  return rows.map((r) => {
    let blocks: ClFtaAnnexBlock[] = [];
    try {
      blocks = JSON.parse(str(r.blocks_json)) as ClFtaAnnexBlock[];
    } catch {
      blocks = [];
    }
    return {
      label: str(r.label),
      href:
        str(r.source) === "admrul"
          ? `/api/admin-rules-sqlite/attachment?id=${encodeURIComponent(str(r.source_ref))}&disposition=attachment`
          : "",
      blocks,
    };
  });
}

export function getClFtaGuide(
  db: DatabaseSync,
  ftaCd: string,
  rateCodes: string[],
): ClFtaGuide {
  const meta = FTA_META[ftaCd];
  const empty: ClFtaGuide = {
    treaties: [],
    laws: [],
    certForms: [],
    certItems: [],
    guidance: [],
    rateCodeNames: {},
    memberNames: {},
    recom: [],
    psrGuide: [],
  };
  if (!meta) return empty;
  return {
    treaties: listTreaties(db, meta),
    laws: listLaws(db, meta),
    certForms: listCertForms(db, meta),
    certItems: listAnnexDocs(db, ftaCd, "cert_items"),
    guidance: listGuidance(db, meta),
    rateCodeNames: listRateCodeNames(db, ftaCd),
    memberNames: listMemberNames(db, ftaCd, rateCodes),
    recom: listAnnexDocs(db, ftaCd, "recom"),
    psrGuide: listAnnexDocs(db, ftaCd, "psr_guide"),
  };
}
