import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { withSmartLawDb, type SmartLawDb } from "@/hanjoo/lib/smart-law-db";
import {
  CIEL_LAW_GROUPS,
  type GeneralLawMenu,
  type GeneralLawSeed,
} from "@/hanjoo/lib/general-law-catalog";

export type GeneralLawNode = {
  id: string;
  name: string;
  badge: string;
  meta: string;
  href?: string;
  tab?: "admrul";
  children: GeneralLawNode[];
};

type Stamp = {
  kind: string;
  no: string;
  prom: string;
  enf: string;
  revision: string;
};

type RawRow = {
  internal_id: string;
  law_name: string;
  law_type: string;
  parent_internal_id: string | null;
};

const BADGE: Record<string, string> = {
  법률: "법령",
  시행령: "시행령",
  시행규칙: "시행규칙",
  고시: "고시",
  훈령: "훈령",
  예규: "예규",
  공고: "공고",
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function digits(v: string): string {
  return v.replace(/\D/g, "");
}

function ymd(v: string): string {
  const s = digits(v);
  if (s.length >= 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return v.trim();
}

function baseName(name: string): string {
  return name.replace(/\([^)]*\)/g, "").replace(/\s+/g, "");
}

function seoulToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })
    .format(new Date())
    .replace(/-/g, "");
}

function formatNo(no: string): string {
  const s = no.trim();
  if (!s) return "";
  if (s.includes("호")) return s.startsWith("제") ? s : `제${s}`;
  return `제${s}호`;
}

function formatMeta(stamp: Stamp | undefined): string {
  if (!stamp) return "";
  const parts: string[] = [];
  if (digits(stamp.enf).length >= 8) parts.push(`[시행 ${ymd(stamp.enf)}]`);
  const head = [stamp.kind, formatNo(stamp.no)].filter(Boolean).join(" ");
  const date = digits(stamp.prom).length >= 8 ? ymd(stamp.prom) : "";
  const body = [head, date].filter(Boolean).join(", ");
  const text = [body, stamp.revision].filter(Boolean).join(" ");
  if (text) parts.push(`[${text}]`);
  return parts.join(" ");
}

function pick(rows: Stamp[], today: string): Stamp | undefined {
  if (!rows.length) return undefined;
  const inForce = rows.filter((r) => {
    const enf = digits(r.enf);
    return enf.length >= 8 && enf <= today;
  });
  const pool = inForce.length ? inForce : rows;
  return [...pool].sort((a, b) => {
    const ap = digits(a.prom);
    const bp = digits(b.prom);
    if (ap !== bp) return bp.localeCompare(ap);
    return (digits(b.enf) || "").localeCompare(digits(a.enf) || "");
  })[0];
}

function lawKey(id: string): string {
  const d = id.replace(/\D/g, "");
  if (!d) return "";
  return d.padStart(6, "0");
}

function pushMap(map: Map<string, Stamp[]>, key: string, stamp: Stamp) {
  const k = key.trim();
  if (!k) return;
  const list = map.get(k);
  if (list) list.push(stamp);
  else map.set(k, [stamp]);
}

async function loadStamps(db: SmartLawDb): Promise<{ byId: Map<string, Stamp[]>; byName: Map<string, Stamp[]> }> {
  const byId = new Map<string, Stamp[]>();
  const byName = new Map<string, Stamp[]>();

  const laws = await db.all(
    `SELECT law_id, law_name_kr, law_type_name, prom_no, prom_date, enf_date, amend_type_name
       FROM law_list`,
  );

  for (const row of laws) {
    const stamp: Stamp = {
      kind: str(row.law_type_name),
      no: str(row.prom_no),
      prom: str(row.prom_date),
      enf: str(row.enf_date),
      revision: str(row.amend_type_name),
    };
    pushMap(byId, lawKey(str(row.law_id)), stamp);
    pushMap(byName, baseName(str(row.law_name_kr)), stamp);
  }

  const currentLaws = await db.all(
    `SELECT law_id, law_nm, law_type, promul_no, promul_dt, enforce_dt, enact_type
       FROM openlaw_efyd_list
       WHERE history_code IN ('현행', '시행예정')`,
  );

  for (const row of currentLaws) {
    const stamp: Stamp = {
      kind: str(row.law_type),
      no: str(row.promul_no),
      prom: str(row.promul_dt),
      enf: str(row.enforce_dt),
      revision: str(row.enact_type),
    };
    pushMap(byId, lawKey(str(row.law_id)), stamp);
    pushMap(byName, baseName(str(row.law_nm)), stamp);
  }

  const rules = await db.all(
    `SELECT admrul_nm, admrul_type, issue_dt, issue_no, enforce_dt, enact_type, dept_nm
       FROM openlaw_admrul_list`,
  );

  for (const row of rules) {
    const type = str(row.admrul_type);
    const dept = str(row.dept_nm);
    const kind = !dept ? type : dept.endsWith(type) ? dept : `${dept}${type}`;
    const stamp: Stamp = {
      kind,
      no: str(row.issue_no),
      prom: str(row.issue_dt),
      enf: str(row.enforce_dt),
      revision: str(row.enact_type),
    };
    pushMap(byName, baseName(str(row.admrul_nm)), stamp);
  }

  return { byId, byName };
}

function stampFor(
  stamps: { byId: Map<string, Stamp[]>; byName: Map<string, Stamp[]> },
  today: string,
  name: string,
  lawId?: string,
): Stamp | undefined {
  const byLaw = lawId ? stamps.byId.get(lawId) : undefined;
  if (byLaw?.length) return pick(byLaw, today);
  return pick(stamps.byName.get(baseName(name)) ?? [], today);
}

/** RAW_RULE_DB_PATH 전용 — smart-law 와 별개 */
function loadRaw(gubun: string): RawRow[] {
  const p = process.env.RAW_RULE_DB_PATH?.trim();
  if (!p || !fs.existsSync(p)) return [];
  const db = new DatabaseSync(p, { readOnly: true });
  try {
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='raw'")
      .get() as { name?: string } | undefined;
    if (!exists?.name) return [];
    return db
      .prepare(
        `SELECT internal_id, law_name, law_type, parent_internal_id
         FROM raw
         WHERE gubun = ?`,
      )
      .all(gubun) as RawRow[];
  } finally {
    db.close();
  }
}

function rawChildren(rows: RawRow[]): Map<string, RawRow[]> {
  const map = new Map<string, RawRow[]>();
  for (const row of rows) {
    const parent = str(row.parent_internal_id);
    if (!parent) continue;
    const list = map.get(parent);
    if (list) list.push(row);
    else map.set(parent, [row]);
  }
  return map;
}

function toNode(
  row: RawRow,
  childrenOf: Map<string, RawRow[]>,
  stamps: { byId: Map<string, Stamp[]>; byName: Map<string, Stamp[]> },
  today: string,
): GeneralLawNode {
  const name = str(row.law_name);
  const kids = childrenOf.get(row.internal_id) ?? [];
  return {
    id: row.internal_id,
    name,
    badge: BADGE[str(row.law_type)] ?? (str(row.law_type) || "기타"),
    meta: formatMeta(stampFor(stamps, today, name)),
    href: undefined,
    tab: undefined,
    children: kids.map((child) => toNode(child, childrenOf, stamps, today)),
  };
}

function seedNode(
  seed: GeneralLawSeed,
  rawRoots: RawRow[],
  childrenOf: Map<string, RawRow[]>,
  stamps: { byId: Map<string, Stamp[]>; byName: Map<string, Stamp[]> },
  today: string,
): GeneralLawNode {
  const key = baseName(seed.name);
  const root = rawRoots.find((row) => baseName(str(row.law_name)) === key);
  if (root) {
    const node = toNode(root, childrenOf, stamps, today);
    node.badge = "법령";
    node.name = seed.name;
    node.meta = formatMeta(stampFor(stamps, today, seed.name, seed.id)) || node.meta;
    return node;
  }
  return {
    id: `law:${seed.id}`,
    name: seed.name,
    badge: "법령",
    meta: formatMeta(stampFor(stamps, today, seed.name, seed.id)),
    children: (seed.children ?? []).map((child) => seedChild(child, stamps, today)),
  };
}

function seedChild(
  seed: GeneralLawSeed,
  stamps: { byId: Map<string, Stamp[]>; byName: Map<string, Stamp[]> },
  today: string,
): GeneralLawNode {
  const name = seed.name;
  const badge = name.endsWith("시행규칙") ? "시행규칙" : name.endsWith("시행령") ? "시행령" : "법령";
  return {
    id: `law:${seed.id}`,
    name,
    badge,
    meta: formatMeta(stampFor(stamps, today, name, seed.id)),
    href: seed.href,
    tab: seed.tab,
    children: [],
  };
}

export async function listGeneralLawTree(menu: GeneralLawMenu): Promise<GeneralLawNode[]> {
  const seeds = CIEL_LAW_GROUPS.find((group) => group.slug === menu.slug)?.items ?? [];
  return withSmartLawDb(async (db) => {
    const stamps = await loadStamps(db);
    const today = seoulToday();
    const raw = loadRaw(menu.gubun);
    const childrenOf = rawChildren(raw);
    const roots = raw.filter((row) => !str(row.parent_internal_id));
    return seeds.map((seed) => seedNode(seed, roots, childrenOf, stamps, today));
  });
}
