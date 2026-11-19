/**
 * smart_law_ai.db 행정규칙 자체 검증 (외부 DB·admin_rules.db 비교 없음)
 *
 * node scripts/validate-smart-law-admin-rules.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const DB =
  process.env.ADMIN_RULES_DB_PATH?.trim() ||
  process.env.SMART_LAW_SQLITE_DB_PATH?.trim() ||
  "D:/SQLiteDB/smart_law_ai.db";

if (!fs.existsSync(DB)) {
  console.error("DB 없음:", DB);
  process.exit(1);
}

const db = new DatabaseSync(DB, { readOnly: true });

const REQUIRED_TABLES = [
  "rule_master",
  "admin_rule",
  "admin_rule_addendum",
  "admin_rule_annex",
  "admin_rule_attachment",
];

function tableExists(name) {
  return Boolean(
    db
      .prepare(
        "SELECT 1 AS o FROM sqlite_master WHERE type='table' AND name = ?",
      )
      .get(name),
  );
}

function countWhere(table, whereSql = "", bind = []) {
  if (!tableExists(table)) return null;
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM "${table}" ${whereSql}`)
    .get(...bind);
  return row?.n ?? 0;
}

function countParam(table, param) {
  return countWhere(table, "WHERE param = ?", [param]);
}

/** 화면 API: adminRulesHasRenderableContent */
function hasRenderable(param) {
  return (
    countParam("admin_rule", param) > 0 ||
    countParam("admin_rule_addendum", param) > 0 ||
    countParam("admin_rule_annex", param) > 0
  );
}

/** 화면: tablePresence.body */
function hasBodyTable(param) {
  return countParam("admin_rule", param) > 0;
}

/** 화면 navArticles: 조문 또는 본문성 content */
function hasBodyArticles(param) {
  const n = countParam("admin_rule", param);
  if (n === 0) return false;
  const jo = countWhere(
    "admin_rule",
    "WHERE param = ? AND section_type = '조문'",
    [param],
  );
  if (jo > 0) return true;
  const other = countWhere(
    "admin_rule",
    `WHERE param = ? AND section_type NOT IN ('장절') AND TRIM(COALESCE(article_content,'')) != ''`,
    [param],
  );
  return other > 0;
}

console.log("=== smart_law_ai.db 행정규칙 자체 검증 ===");
console.log("DB:", DB);
console.log("");

const schema = { tables: {}, ok: true };
for (const t of REQUIRED_TABLES) {
  const exists = tableExists(t);
  schema.tables[t] = { exists, rows: exists ? countWhere(t) : null };
  if (!exists) schema.ok = false;
}
console.log("1) 스키마");
for (const [t, v] of Object.entries(schema.tables)) {
  console.log(`   ${v.exists ? "OK" : "MISSING"} ${t}${v.rows != null ? ` (${v.rows.toLocaleString()} rows)` : ""}`);
}

const optional = ["raw_rule", "raw_rule_addendum", "raw_rule_annex", "rule_config"];
console.log("   (선택)", optional.filter(tableExists).join(", ") || "없음");

if (!tableExists("rule_master")) {
  db.close();
  process.exit(1);
}

const rules = db
  .prepare(
    "SELECT param, description, gubun, url FROM rule_master ORDER BY param",
  )
  .all();

const bucket = {
  ok_full_body: [],
  ok_body_empty_ui: [], // admin_rule 없음, 부칙/별표만 → 본문 탭 안내 문구
  warn_body_rows_no_articles: [], // admin_rule 있으나 조문 없음
  error_no_rows: [], // rule_master만, 렌더 불가
  error_duplicate_param: [],
};

const paramSeen = new Map();
for (const r of rules) {
  const p = String(r.param);
  if (paramSeen.has(p)) {
    bucket.error_duplicate_param.push({ param: p, description: r.description });
  }
  paramSeen.set(p, r.description);

  const item = {
    param: p,
    description: String(r.description),
    gubun: r.gubun,
    admin_rule: countParam("admin_rule", p),
    addendum: countParam("admin_rule_addendum", p),
    annex: countParam("admin_rule_annex", p),
    attachment: countParam("admin_rule_attachment", p),
  };

  if (!hasRenderable(p)) {
    bucket.error_no_rows.push(item);
  } else if (!hasBodyTable(p)) {
    bucket.ok_body_empty_ui.push(item);
  } else if (!hasBodyArticles(p)) {
    bucket.warn_body_rows_no_articles.push(item);
  } else {
    bucket.ok_full_body.push(item);
  }
}

/** admin_rule param이 rule_master에 없는 고아 행 */
const orphanParams = db
  .prepare(
    `SELECT DISTINCT a.param, COUNT(*) AS n
     FROM admin_rule a
     LEFT JOIN rule_master m ON m.param = a.param
     WHERE m.param IS NULL
     GROUP BY a.param
     ORDER BY n DESC
     LIMIT 20`,
  )
  .all();

console.log("");
console.log("2) rule_master ↔ admin_rule* 정합 (param 키)");
console.log(`   rule_master: ${rules.length}건`);
console.log(`   A. 본문 조항 표시 가능: ${bucket.ok_full_body.length}건`);
console.log(
  `   B. 본문 테이블 없음 · 부칙/별표만 (UI 본문 탭 비음, 정상 가능): ${bucket.ok_body_empty_ui.length}건`,
);
console.log(
  `   C. admin_rule 있으나 조문/본문성 행 없음 (점검 권장): ${bucket.warn_body_rows_no_articles.length}건`,
);
console.log(
  `   D. rule_master만 · admin_rule* 전무 (목록·API table_in_db=false): ${bucket.error_no_rows.length}건`,
);
console.log(`   E. rule_master param 중복: ${bucket.error_duplicate_param.length}건`);

function printList(title, arr, limit = 15) {
  if (arr.length === 0) return;
  console.log(`\n   [${title}] (${arr.length}건)`);
  for (const x of arr.slice(0, limit)) {
    console.log(
      `     · [${x.param}] ${x.description} — rule ${x.admin_rule ?? "-"}, 부칙 ${x.addendum ?? "-"}, 별표 ${x.annex ?? "-"}`,
    );
  }
  if (arr.length > limit) console.log(`     … 외 ${arr.length - limit}건`);
}

printList("B 본문 없음·부칙/별표만", bucket.ok_body_empty_ui);
printList("C admin_rule만 있고 조문 없음", bucket.warn_body_rows_no_articles);
printList("D 데이터 전무", bucket.error_no_rows);

if (orphanParams.length) {
  console.log(`\n   [F] rule_master에 없는 admin_rule param (상위 ${orphanParams.length}개)`);
  for (const o of orphanParams) {
    console.log(`     · ${o.param} (${o.n} rows)`);
  }
}

const distinctParamsInMain = db
  .prepare("SELECT COUNT(DISTINCT param) AS n FROM admin_rule")
  .get()?.n;

console.log("");
console.log("3) 요약");
console.log(
  `   admin_rule DISTINCT param: ${distinctParamsInMain} (rule_master ${rules.length})`,
);
const pass =
  schema.ok &&
  bucket.error_no_rows.length === 0 &&
  bucket.error_duplicate_param.length === 0 &&
  bucket.warn_body_rows_no_articles.length === 0;
console.log(
  pass
    ? "   결과: rule_master 적재분 기준 자체 검증 PASS (B는 고시형으로 허용)"
    : "   결과: 이슈 있음 — D/E/C 항목 확인",
);

const report = {
  validatedAt: new Date().toISOString(),
  dbPath: DB,
  schema: schema.tables,
  counts: {
    rule_master: rules.length,
    ok_full_body: bucket.ok_full_body.length,
    ok_body_empty_ui: bucket.ok_body_empty_ui.length,
    warn_body_rows_no_articles: bucket.warn_body_rows_no_articles.length,
    error_no_rows: bucket.error_no_rows.length,
  },
  ok_body_empty_ui: bucket.ok_body_empty_ui,
  warn_body_rows_no_articles: bucket.warn_body_rows_no_articles,
  error_no_rows: bucket.error_no_rows,
  orphan_admin_rule_params: orphanParams,
};

const out = new URL("./_validate-smart-law-admin-rules.json", import.meta.url);
fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
console.log("\n   JSON:", out.pathname.replace(/^\/([A-Z]:)/, "$1"));

db.close();
