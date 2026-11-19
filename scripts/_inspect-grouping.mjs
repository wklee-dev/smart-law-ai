import { DatabaseSync } from "node:sqlite";

function extractRawRuleRootKey(lawName) {
  const name = (lawName ?? "").trim();
  const decree = name.match(/^(.+?)\s+시행령(?:\s|$)/);
  if (decree) return decree[1].trim();
  const rule = name.match(/^(.+?)\s+시행규칙(?:\s|$)/);
  if (rule) return rule[1].trim();
  const articleRef = name.match(/^(.+?)\s+제\d+/);
  if (articleRef) return articleRef[1].trim();
  return name;
}

const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });
const all = db
  .prepare(
    "SELECT law_name, law_type FROM raw WHERE gubun='관세관련' ORDER BY law_name",
  )
  .all();

const groups = new Map();
for (const r of all) {
  const k = extractRawRuleRootKey(r.law_name);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

console.log("=== Current grouping (", groups.size, "roots )");
for (const [k, rows] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko"))) {
  console.log(`\n[${k}] (${rows.length})`);
  for (const r of rows) console.log("  -", r.law_type, r.law_name.slice(0, 55));
}
