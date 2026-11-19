import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });

const all = db
  .prepare(
    `SELECT law_id, law_name, law_type, enforcement_date, promulgation_number, promulgation_date, gubun
     FROM raw WHERE gubun='관세관련' ORDER BY law_name`,
  )
  .all();

console.log("=== Total 관세관련:", all.length);

const customs = all.filter(
  (r) =>
    r.law_name.startsWith("관세법") ||
    r.law_name.includes("관세법 ") ||
    r.law_name === "관세법",
);
console.log("\n=== 관세법 관련:", customs.length);
for (const r of customs) {
  console.log(
    r.law_type.padEnd(12),
    "|",
    r.law_name.slice(0, 70),
    "|",
    r.law_id,
  );
}

const lawTypes = db
  .prepare(
    "SELECT law_type, COUNT(*) n FROM raw WHERE gubun='관세관련' GROUP BY law_type",
  )
  .all();
console.log("\n=== law_type 분포:", lawTypes);

const hasCustomsLaw = all.find((r) => r.law_name === "관세법");
console.log("\n=== 관세법(법률) 존재:", hasCustomsLaw ? "YES" : "NO");

const adminTypes = all.filter((r) =>
  ["고시", "훈령", "예규"].some((t) => r.law_type.includes(t)),
);
console.log("=== 고시/훈령/예규:", adminTypes.length);
