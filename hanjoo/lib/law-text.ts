import {
  smartLawTableExists,
  withSmartLawDb,
  type SmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

export type LawCompanion = { name: string; label: string };

export type InquiryTab = "efyd" | "nw" | "admrul" | "oldnew";

export type HistoryItem = {
  key: string;
  title: string;
  sub: string;
  badge?: string;
  promulNo?: string;
  enforce?: string;
};

export type InquiryMeta = {
  name: string;
  lawId: string;
  enforce: string;
  promul: string;
  promulNo: string;
  dept: string;
  lawType: string;
  revision: string;
  phone: string;
};

export type InquiryArticle = {
  heading: string;
  content: string;
  oldContent?: string;
  newContent?: string;
};

export type LawInquiry = {
  name: string;
  companions: LawCompanion[];
  tab: InquiryTab;
  hint: string;
  histories: HistoryItem[];
  selectedKey: string;
  meta: InquiryMeta | null;
  articles: InquiryArticle[];
};

const TABS: InquiryTab[] = ["efyd", "nw", "admrul", "oldnew"];

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function lawIdInt(v: unknown): number {
  const n = Number(str(v).replace(/\D/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function padLawId(v: unknown): string {
  const n = lawIdInt(v);
  return n > 0 ? String(n).padStart(6, "0") : "";
}

function ymd(v: unknown): string {
  const s = str(v).replace(/\D/g, "");
  if (s.length >= 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return "";
}


export function parseInquiryTab(raw: string | null): InquiryTab {
  if (raw === "efyd" || raw === "nw" || raw === "admrul" || raw === "oldnew") return raw;
  return "efyd";
}

function familyBase(name: string): string {
  return name
    .replace(/\s*시행규칙$/, "")
    .replace(/\s*시행령$/, "")
    .replace(/\s*기본통칙$/, "")
    .replace(/기본통칙$/, "")
    .trim();
}

async function hasText(db: SmartLawDb, name: string): Promise<boolean> {
  if (await smartLawTableExists(db, "laws")) {
    const law = await db.get(`SELECT id FROM laws WHERE law_name_kr = ? LIMIT 1`, [name]) as
      | { id?: number }
      | undefined;
    if (law?.id && await smartLawTableExists(db, "law_articles") && await smartLawTableExists(db, "law_versions")) {
      const hit = await db.get(`SELECT 1 AS n FROM law_versions v
            JOIN law_articles a ON a.law_version_id = v.id
           WHERE v.law_id = ? LIMIT 1`, [law.id]) as { n?: number } | undefined;
      if (hit) return true;
    }
  }
  if (!(await smartLawTableExists(db, "admin_rule"))) return false;
  const rule = await db.get(`SELECT 1 AS n FROM admin_rule WHERE law_name = ? LIMIT 1`, [name]) as
    | { n?: number }
    | undefined;
  return Boolean(rule);
}

async function companionsOf(db: SmartLawDb, name: string): Promise<LawCompanion[]> {
  const base = familyBase(name);
  const candidates: LawCompanion[] = [
    { label: "법령", name: base },
    { label: "시행령", name: `${base} 시행령` },
    { label: "시행규칙", name: `${base} 시행규칙` },
    { label: "기본통칙", name: `${base}기본통칙` },
  ];
  const seen = new Set<string>();
  const out: LawCompanion[] = [];
  for (const item of candidates) {
    if (!item.name || seen.has(item.name) || !(await hasText(db, item.name))) continue;
    seen.add(item.name);
    out.push(item);
    if (out.length >= 4) break;
  }
  return out;
}

function joOrder(no: string): number {
  const m = no.match(/(\d+)(?:의|-)?(\d+)?/);
  if (!m) return 1_000_000;
  return Number(m[1]) * 1000 + (m[2] ? Number(m[2]) : 0);
}

function cardHeading(no: string, title: string, content: string): string {
  const head = content.match(/^제\d+조(?:의\d+)?(?:\([^)]*\))?/);
  if (head) return head[0];
  if (title.startsWith("제")) return title;
  if (/^제/.test(no) && title) return `${no}(${title})`;
  if (no && title) return `제${no}조(${title})`;
  if (/^제/.test(no)) return no;
  if (no) return `제${no}조`;
  return title || "조문";
}

function joArticles(rows: Record<string, unknown>[]): InquiryArticle[] {
  return [...rows]
    .sort((a, b) => joOrder(str(a.jo_no)) - joOrder(str(b.jo_no)))
    .map((row) => {
      const extra = [str(row.hang), str(row.ho), str(row.mok)].filter(Boolean);
      const content = [str(row.jo_content), ...extra].filter(Boolean).join("\n");
      return {
        heading: cardHeading(str(row.jo_no), str(row.jo_title), content),
        content,
      };
    });
}

type Source = { kind: "statute"; versionId: number } | { kind: "rule"; gubun: string };

async function resolveSource(db: SmartLawDb, name: string): Promise<Source | null> {
  if (await smartLawTableExists(db, "laws") && await smartLawTableExists(db, "law_versions") && await smartLawTableExists(db, "law_articles")) {
    const law = await db.get(`SELECT id FROM laws WHERE law_name_kr = ? LIMIT 1`, [name]) as
      | { id?: number }
      | undefined;
    if (law?.id) {
      const ver = await db.get(`SELECT id FROM law_versions
            WHERE law_id = ? AND is_current = 1
            ORDER BY enforcement_date DESC
            LIMIT 1`, [law.id]) as { id?: number } | undefined;
      const count = ver
        ? (await db.get(`SELECT COUNT(*) AS n FROM law_articles WHERE law_version_id = ?`, [ver.id]) as {
            n?: number;
          })
        : undefined;
      if (ver?.id && Number(count?.n) > 0) return { kind: "statute", versionId: Number(ver.id) };
    }
  }
  if (!(await smartLawTableExists(db, "admin_rule"))) return null;
  const groups = await db.all(`SELECT gubun, COUNT(*) AS n FROM admin_rule WHERE law_name = ? GROUP BY gubun`, [name]) as { gubun?: string; n?: number }[];
  if (!groups.length) return null;
  const ranked = [...groups].sort((a, b) => {
    const ap = str(a.gubun) === "adm_rule" ? 1 : 0;
    const bp = str(b.gubun) === "adm_rule" ? 1 : 0;
    if (ap !== bp) return ap - bp;
    return Number(b.n) - Number(a.n);
  });
  const gubun = str(ranked[0]?.gubun);
  return gubun ? { kind: "rule", gubun } : null;
}

async function localArticles(db: SmartLawDb, name: string): Promise<InquiryArticle[]> {
  const source = await resolveSource(db, name);
  if (!source) return [];
  if (source.kind === "statute") {
    const rows = await db.all(`SELECT article_no, article_title, article_content
           FROM law_articles
          WHERE law_version_id = ? AND article_type = '조문'
          ORDER BY display_order, id`, [source.versionId]) as Record<string, unknown>[];
    return rows.map((row) => {
      const content = str(row.article_content);
      return {
        heading: cardHeading(str(row.article_no), str(row.article_title), content),
        content,
      };
    });
  }
  const rows = (await db.all(`SELECT article_no, article_title, article_content
         FROM admin_rule
        WHERE law_name = ? AND gubun = ? AND section_type = '조문'
        ORDER BY CAST(seq_id AS INTEGER), id`, [name, source.gubun])) as Record<string, unknown>[];
  return rows.map((row) => {
    const content = str(row.article_content);
    return {
      heading: cardHeading(str(row.article_no), str(row.article_title), content),
      content,
    };
  });
}

async function localMeta(db: SmartLawDb, name: string, lawId: string): Promise<InquiryMeta> {
  const law = (await smartLawTableExists(db, "laws"))
    ? ((await db.get(
        `SELECT law_id, law_type_name, ministry_name FROM laws WHERE law_name_kr = ? LIMIT 1`,
        [name],
      )) as Record<string, unknown> | undefined)
    : undefined;
  const source = await resolveSource(db, name);
  let promulNo = "";
  let promul = "";
  let enforce = "";
  let revision = "";
  let phone = "";
  if (source?.kind === "statute" && await smartLawTableExists(db, "law_versions")) {
    const ver = await db.get(`SELECT promulgation_no, promulgation_date, enforcement_date, revision_type, contact_phone
           FROM law_versions WHERE id = ?`, [source.versionId]) as Record<string, unknown> | undefined;
    promulNo = str(ver?.promulgation_no);
    promul = ymd(ver?.promulgation_date);
    enforce = ymd(ver?.enforcement_date);
    revision = str(ver?.revision_type);
    phone = str(ver?.contact_phone);
  } else if (source?.kind === "rule") {
    const head = await db.get(`SELECT promulgation_no, promulgation_dt
           FROM admin_rule
          WHERE law_name = ? AND gubun = ? AND TRIM(IFNULL(promulgation_no, '')) != ''
          LIMIT 1`, [name, source.gubun]) as Record<string, unknown> | undefined;
    promulNo = str(head?.promulgation_no);
    promul = ymd(head?.promulgation_dt);
  }
  const lawType =
    str(law?.law_type_name) ||
    (name.endsWith("시행령") ? "대통령령" : name.endsWith("시행규칙") ? "부령" : "");
  return {
    name,
    lawId: padLawId(law?.law_id) || lawId,
    enforce,
    promul,
    promulNo,
    dept: str(law?.ministry_name),
    lawType,
    revision,
    phone,
  };
}

async function resolveLawId(db: SmartLawDb, name: string): Promise<number> {
  if (await smartLawTableExists(db, "laws")) {
    const row = await db.get(`SELECT law_id FROM laws WHERE law_name_kr = ? LIMIT 1`, [name]) as
      | { law_id?: unknown }
      | undefined;
    const id = lawIdInt(row?.law_id);
    if (id) return id;
  }
  if (await smartLawTableExists(db, "openlaw_efyd_info")) {
    const row = await db.get(`SELECT law_id FROM openlaw_efyd_info WHERE law_nm_ko = ? ORDER BY enforce_dt DESC LIMIT 1`, [name]) as { law_id?: unknown } | undefined;
    const id = lawIdInt(row?.law_id);
    if (id) return id;
  }
  if (await smartLawTableExists(db, "openlaw_efyd_list")) {
    const row = await db.get(`SELECT law_id FROM openlaw_efyd_list WHERE law_nm = ? ORDER BY enforce_dt DESC LIMIT 1`, [name]) as { law_id?: unknown } | undefined;
    const id = lawIdInt(row?.law_id);
    if (id) return id;
  }
  if (await smartLawTableExists(db, "admin_rule")) {
    const row = await db.get(`SELECT gubun FROM admin_rule WHERE law_name = ? AND gubun != 'adm_rule' LIMIT 1`, [name]) as { gubun?: unknown } | undefined;
    const id = lawIdInt(row?.gubun);
    if (id) return id;
  }
  return 0;
}

function metaFrom(name: string, lawId: string, row: Record<string, unknown> | undefined): InquiryMeta {
  return {
    name: str(row?.law_nm_ko) || str(row?.law_nm) || name,
    lawId: padLawId(row?.law_id) || lawId,
    enforce: ymd(row?.enforce_dt),
    promul: ymd(row?.promul_dt),
    promulNo: str(row?.promul_no).replace(/^0+$/, ""),
    dept: str(row?.dept_nm),
    lawType: str(row?.law_type),
    revision: str(row?.enact_type),
    phone: str(row?.phone) || str(row?.contact_phone),
  };
}

function historyItem(row: Record<string, unknown>, prefix: string): HistoryItem {
  const historyCode = str(row.history_code);
  const lawNm = str(row.law_nm);
  const enact = str(row.enact_type);
  const title =
    historyCode && lawNm && historyCode !== lawNm ? `${historyCode} · ${lawNm}` : historyCode || lawNm || "(항목)";
  const seq = str(row.law_seq) || "0";
  const stamp = prefix === "e" ? str(row.enforce_dt) : str(row.promul_dt);
  return {
    key: `${prefix}:${seq}:${stamp}`,
    title,
    sub: `시행 ${ymd(row.enforce_dt) || "—"} · 공포 ${ymd(row.promul_dt) || "—"}${enact ? ` · ${enact}` : ""}`,
    promulNo: str(row.promul_no),
    enforce: ymd(row.enforce_dt),
  };
}

async function efydJo(db: SmartLawDb, id: number, enforceDt: number): Promise<InquiryArticle[]> {
  if (!id || !await smartLawTableExists(db, "openlaw_efyd_jo")) return [];
  const rows = enforceDt
    ? ((await db.all(
        `SELECT jo_no, jo_title, jo_content, hang, ho, mok
             FROM openlaw_efyd_jo
            WHERE CAST(law_id AS INTEGER) = ? AND enforce_dt = ?
            ORDER BY jo_no ASC`,
        [id, enforceDt],
      )) as Record<string, unknown>[])
    : [];
  return joArticles(rows);
}

async function nwJo(db: SmartLawDb, id: number, promulDt: number): Promise<InquiryArticle[]> {
  if (!id || !(await smartLawTableExists(db, "openlaw_nw_jo"))) return [];
  const rows = promulDt
    ? ((await db.all(
        `SELECT jo_no, jo_title, jo_content, hang, ho, mok
             FROM openlaw_nw_jo
            WHERE CAST(law_id AS INTEGER) = ? AND promul_dt = ?
            ORDER BY jo_no ASC`,
        [id, promulDt],
      )) as Record<string, unknown>[])
    : [];
  return joArticles(rows);
}

async function latestInfo(db: SmartLawDb, table: string, id: number, dateCol: string, date?: number) {
  if (!id || !await smartLawTableExists(db, table)) return undefined;
  if (date) {
    return await db.get(`SELECT * FROM ${table} WHERE CAST(law_id AS INTEGER) = ? AND ${dateCol} = ?`, [id, date]);
  }
  return await db.get(`SELECT * FROM ${table} WHERE CAST(law_id AS INTEGER) = ? ORDER BY ${dateCol} DESC LIMIT 1`, [id]) as Record<string, unknown> | undefined;
}

async function loadVersionTab(
  db: SmartLawDb,
  name: string,
  id: number,
  lawId: string,
  key: string,
  kind: "efyd" | "nw",
): Promise<Pick<LawInquiry, "hint" | "histories" | "selectedKey" | "meta" | "articles">> {
  const listTable = kind === "efyd" ? "openlaw_efyd_list" : "openlaw_nw_list";
  const infoTable = kind === "efyd" ? "openlaw_efyd_info" : "openlaw_nw_info";
  const dateCol = kind === "efyd" ? "enforce_dt" : "promul_dt";
  const prefix = kind === "efyd" ? "e" : "n";
  const list = id && await smartLawTableExists(db, listTable)
    ? ((await db.all(`SELECT * FROM ${listTable}
            WHERE CAST(law_id AS INTEGER) = ?
            ORDER BY ${dateCol} DESC, promul_dt DESC, law_seq DESC`, [id])) as Record<string, unknown>[])
    : [];
  const body = await latestInfo(db, infoTable, id, dateCol);
  const bodyDate = Number(body?.[dateCol] ?? 0);
  const local = await localArticles(db, name);
  const bodyJos = kind === "efyd" ? await efydJo(db, id, bodyDate) : await nwJo(db, id, bodyDate);
  const collectedJos = bodyJos.length ? bodyJos : local;
  const collectedMeta = body ? metaFrom(name, lawId, body) : await localMeta(db, name, lawId);
  const inList = bodyDate > 0 && list.some((row) => Number(row[dateCol] ?? 0) === bodyDate);

  const histories = list.map((row) => historyItem(row, prefix));
  if ((body || collectedJos.length) && !inList) {
    histories.unshift({
      key: "c",
      badge: "본문 수집",
      title: collectedMeta.name || name,
      sub: `시행 ${collectedMeta.enforce || "—"} · 공포 ${collectedMeta.promul || "—"}`,
      promulNo: collectedMeta.promulNo,
      enforce: collectedMeta.enforce,
    });
  }

  const picked = histories.find((item) => item.key === key)?.key ?? histories[0]?.key ?? "";
  if (!picked || picked === "c") {
    const hint =
      picked === "c" && !inList && collectedMeta.enforce
        ? `수집된 본문은 시행 ${collectedMeta.enforce}입니다. 같은 시행일의 연혁이 없어 이 본문을 표시합니다.`
        : "";
    return {
      hint,
      histories,
      selectedKey: picked,
      meta: collectedJos.length || body ? collectedMeta : null,
      articles: collectedJos,
    };
  }

  const row = list.find((item) => historyItem(item, prefix).key === picked);
  const stamp = Number(row?.[dateCol] ?? 0);
  const jos = kind === "efyd" ? await efydJo(db, id, stamp) : await nwJo(db, id, stamp);
  if (jos.length) {
    const info = await latestInfo(db, infoTable, id, dateCol, stamp) ?? row;
    return {
      hint: "",
      histories,
      selectedKey: picked,
      meta: metaFrom(name, lawId, info),
      articles: jos,
    };
  }

  const when = ymd(stamp) || "선택한 날짜";
  const shown = collectedMeta.enforce || collectedMeta.promul;
  return {
    hint: shown
      ? `선택 ${kind === "efyd" ? "시행일" : "공포일"} ${when} 조문은 미수집입니다. 수집된 본문(${shown})을 표시합니다.`
      : `${when} 조문은 미수집입니다.`,
    histories,
    selectedKey: histories.some((item) => item.key === "c") ? "c" : picked,
    meta: collectedJos.length ? collectedMeta : row ? metaFrom(name, lawId, row) : null,
    articles: collectedJos,
  };
}

async function loadAdmrul(
  db: SmartLawDb,
  name: string,
  key: string,
): Promise<Pick<LawInquiry, "hint" | "histories" | "selectedKey" | "meta" | "articles">> {
  const base = familyBase(name);
  const rows =
    base && (await smartLawTableExists(db, "openlaw_admrul_list"))
      ? ((await db.all(
          `SELECT * FROM openlaw_admrul_list
              WHERE admrul_nm LIKE ?
              ORDER BY issue_dt DESC, admrul_seq DESC`,
          [`${base}%`],
        )) as Record<string, unknown>[])
      : [];
  const histories: HistoryItem[] = rows.map((row) => ({
    key: `a:${str(row.admrul_seq)}`,
    title: str(row.admrul_nm) || "(이름 없음)",
    sub: `${ymd(row.issue_dt) || "—"} · ${str(row.admrul_type) || "행정규칙"}`,
    promulNo: str(row.issue_no),
    enforce: ymd(row.enforce_dt) || ymd(row.issue_dt),
  }));
  const picked =
    histories.find((item) => item.key === key)?.key ??
    histories.find((item) => item.title === name)?.key ??
    histories[0]?.key ??
    "";
  const row = rows.find((item) => `a:${str(item.admrul_seq)}` === picked);
  const seq = Number(row?.admrul_seq ?? 0);
  const openlawArticles =
    seq && (await smartLawTableExists(db, "openlaw_admrul_info"))
      ? joArticles(
          (await db.all(
            `SELECT jo_no, jo_title, jo_content, hang, ho, mok
                 FROM openlaw_admrul_info
                WHERE admrul_seq = ?
                ORDER BY jo_no ASC`,
            [seq],
          )) as Record<string, unknown>[],
        )
      : [];
  const sourceName = str(row?.admrul_nm) || name;
  const local = openlawArticles.length ? [] : await localArticles(db, sourceName);
  const articles = openlawArticles.length ? openlawArticles : local;
  if (!histories.length && articles.length) {
    histories.push({
      key: "local",
      title: sourceName,
      sub: "SMART_LAW_AI.DB 수집 본문",
    });
  }
  const meta: InquiryMeta | null = row
    ? {
        name: str(row.admrul_nm),
        lawId: "",
        enforce: ymd(row.enforce_dt),
        promul: ymd(row.issue_dt),
        promulNo: str(row.issue_no),
        dept: str(row.dept_nm),
        lawType: str(row.admrul_type) || "행정규칙",
        revision: str(row.enact_type),
        phone: "",
      }
    : articles.length
      ? await localMeta(db, sourceName, "")
      : null;
  return {
    hint: openlawArticles.length || !local.length ? "" : "SMART_LAW_AI.DB 수집 본문을 표시합니다.",
    histories,
    selectedKey: picked || (articles.length ? "local" : ""),
    meta,
    articles,
  };
}

async function loadOldnew(
  db: SmartLawDb,
  name: string,
  key: string,
): Promise<Pick<LawInquiry, "hint" | "histories" | "selectedKey" | "meta" | "articles">> {
  const base = familyBase(name);
  const rows =
    base && await smartLawTableExists(db, "openlaw_admrul_oldnew_list")
      ? ((await db.all(`SELECT * FROM openlaw_admrul_oldnew_list
              WHERE admrul_nm LIKE ?
              ORDER BY new_issue_dt DESC, oldnew_seq DESC`, [`${base}%`])) as Record<string, unknown>[])
      : [];
  const histories: HistoryItem[] = rows.map((row) => ({
    key: `o:${str(row.oldnew_seq)}`,
    title: str(row.admrul_nm) || "(이름 없음)",
    sub: `신 ${ymd(row.new_issue_dt) || "—"} / 구 ${ymd(row.old_issue_dt) || "—"}`,
    enforce: ymd(row.new_issue_dt),
  }));
  const picked = histories.find((item) => item.key === key)?.key ?? histories[0]?.key ?? "";
  const row = rows.find((item) => `o:${str(item.oldnew_seq)}` === picked);
  const seq = Number(row?.oldnew_seq ?? 0);
  const articles: InquiryArticle[] =
    seq && await smartLawTableExists(db, "openlaw_admrul_oldnew_info")
      ? ((await db.all(`SELECT jo_no, old_jo_content, new_jo_content
               FROM openlaw_admrul_oldnew_info
              WHERE admrul_seq = ?
              ORDER BY jo_no ASC`, [seq])) as Record<string, unknown>[])
          .map((item) => ({
            heading: str(item.jo_no) ? `조문 ${str(item.jo_no)}` : "조문",
            content: "",
            oldContent: str(item.old_jo_content),
            newContent: str(item.new_jo_content),
          }))
      : [];
  const meta: InquiryMeta | null = row
    ? {
        name: str(row.admrul_nm),
        lawId: "",
        enforce: "",
        promul: ymd(row.new_issue_dt),
        promulNo: str(row.new_issue_no),
        dept: str(row.dept_nm),
        lawType: "신구법",
        revision: "",
        phone: "",
      }
    : null;
  return { hint: "", histories, selectedKey: picked, meta, articles };
}

export async function loadLawInquiry(name: string, tab: InquiryTab, key: string): Promise<LawInquiry> {
  return withSmartLawDb(async (db) => {
    const id = await resolveLawId(db, name);
    const lawId = padLawId(id);
    const companions = await companionsOf(db, name);
    const body =
      tab === "nw"
        ? await loadVersionTab(db, name, id, lawId, key, "nw")
        : tab === "admrul"
          ? await loadAdmrul(db, name, key)
          : tab === "oldnew"
            ? await loadOldnew(db, name, key)
            : await loadVersionTab(db, name, id, lawId, key, "efyd");
    return { name, companions, tab: TABS.includes(tab) ? tab : "efyd", ...body };
  });
}
