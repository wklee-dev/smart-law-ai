import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });
const gubun = "관세법령";

function classifyDocType(lawType, lawName) {
  const lt = (lawType ?? "").trim();
  const name = (lawName ?? "").trim();
  const RULE_LAW_TYPES = new Set([
    "기획재정부령", "산업통상자원부령", "행정안전부령", "재정경제부령", "법무부령", "국토교통부령",
  ]);
  const DECREE_LAW_TYPES = new Set(["대통령령", "국무총리령", "총리령", "대통령령(시행령)"]);

  if (lt === "법" || lt === "법률") return "법률";
  if (lt === "고시" || lt.includes("고시")) return "고시";
  if (lt === "훈령" || lt.includes("훈령")) return "훈령";
  if (lt === "공고" || lt.includes("공고")) return "공고";
  if (name.includes("에 관한 고시") || name.includes("고시")) return "고시";
  if (name.includes("시행규칙") || RULE_LAW_TYPES.has(lt)) return "시행규칙";
  if (name.includes("시행령") || DECREE_LAW_TYPES.has(lt) || (lt.includes("령") && !lt.includes("부령") && !name.includes("규칙"))) return "시행령";
  if (lt.includes("부령") || name.includes("규칙")) return "시행규칙";
  return "기타";
}

const rows = db.prepare(`
  SELECT law_id, law_name, law_type, parent_law_id, meta_info
  FROM raw WHERE gubun = ?
`).all(gubun);

const byDocType = {};
const byLawType = {};
let withParent = 0;
for (const r of rows) {
  const dt = classifyDocType(r.law_type, r.law_name);
  byDocType[dt] = (byDocType[dt] ?? 0) + 1;
  byLawType[r.law_type ?? "(null)"] = (byLawType[r.law_type ?? "(null)"] ?? 0) + 1;
  if ((r.parent_law_id ?? "").trim()) withParent++;
}

// 관세법 루트 그룹
const customsRows = rows.filter((r) => {
  const name = r.law_name;
  if (name === "관세법" || name.startsWith("관세법 ")) return true;
  if (name.includes("덤핑방지관세") || name.includes("상계관세")) return true;
  if (["세계무역기구협정 등에 의한 양허관세 규정", "최빈개발도상국에 대한 특혜관세 공여 규정", "특정국가와의 관세협상에 따른 국제협력관세의 적용에 관한 규정"].includes(name)) return true;
  const dt = classifyDocType(r.law_type, r.law_name);
  if (["고시", "훈령", "공고", "예규"].includes(dt)) return true;
  return false;
});

const customsByDocType = {};
for (const r of customsRows) {
  const dt = classifyDocType(r.law_type, r.law_name);
  customsByDocType[dt] = (customsByDocType[dt] ?? 0) + 1;
}

const decrees = customsRows.filter((r) => classifyDocType(r.law_type, r.law_name) === "시행령");
const rules = customsRows.filter((r) => classifyDocType(r.law_type, r.law_name) === "시행규칙");
const gosi = customsRows.filter((r) => classifyDocType(r.law_type, r.law_name) === "고시");

// misclassified: law_type says one thing but name suggests another
const misclassified = rows.filter((r) => {
  const dt = classifyDocType(r.law_type, r.law_name);
  if (dt === "시행규칙" && (r.law_name.includes("덤핑") || r.law_name.includes("상계관세") || r.law_name.includes("고시"))) return true;
  return false;
});

console.log("=== 관세법령 gubun 전체 ===");
console.log("총 건수:", rows.length);
console.log("parent_law_id 있음:", withParent);
console.log("docType 분류:", byDocType);
console.log("law_type 원본:", byLawType);

console.log("\n=== 관세법 트리 그룹 (휴리스틱 기준) ===");
console.log("그룹 건수:", customsRows.length);
console.log("docType:", customsByDocType);
console.log("\n시행령 목록 (" + decrees.length + "건):");
for (const d of decrees) console.log(" -", d.law_name, `[${d.law_type}] parent=${d.parent_law_id ?? ""}`);

console.log("\n시행규칙 목록 (" + rules.length + "건):");
for (const d of rules) console.log(" -", d.law_name, `[${d.law_type}]`);

console.log("\n고시 건수:", gosi.length);
console.log("고시 샘플 (5건):");
for (const d of gosi.slice(0, 5)) console.log(" -", d.law_name, `[${d.law_type}]`);

console.log("\n=== 시행규칙으로 분류되었으나 덤핑/상계/고시 성격 (" + misclassified.length + "건) ===");
for (const d of misclassified.slice(0, 10)) {
  console.log(" -", d.law_name, `[law_type=${d.law_type}] →`, classifyDocType(d.law_type, d.law_name));
}

// parent_law_id chain sample
if (withParent > 0) {
  const withP = rows.filter((r) => (r.parent_law_id ?? "").trim());
  console.log("\n=== parent_law_id 샘플 ===");
  for (const r of withP.slice(0, 8)) {
    const parent = rows.find((x) => x.law_id === r.parent_law_id);
    console.log(r.law_name, "→", parent?.law_name ?? r.parent_law_id);
  }
}

// 전체 gubun counts
const allGubun = db.prepare("SELECT gubun, COUNT(*) as c FROM raw GROUP BY gubun").all();
console.log("\n=== 전체 gubun ===", allGubun);

// 기타 26건 상세
const etc = rows.filter((r) => classifyDocType(r.law_type, r.law_name) === "기타");
console.log("\n=== 기타 분류 (" + etc.length + "건) ===");
for (const r of etc) console.log(" -", r.law_name);

// 관세법 그룹 외 시행령 19건
const otherDecrees = rows.filter((r) => {
  const dt = classifyDocType(r.law_type, r.law_name);
  if (dt !== "시행령") return false;
  const name = r.law_name;
  if (name === "관세법" || name.startsWith("관세법 ")) return false;
  if (name.includes("덤핑") || name.includes("상계관세")) return false;
  if (["세계무역기구협정 등에 의한 양허관세 규정", "최빈개발도상국에 대한 특혜관세 공여 규정", "특정국가와의 관세협상에 따른 국제협력관세의 적용에 관한 규정"].includes(name)) return false;
  return true;
});
console.log("\n=== 관세법 외 별도 루트 시행령 (" + otherDecrees.length + "건) ===");
for (const r of otherDecrees) console.log(" -", r.law_name);

// 컬럼 채움률
const fill = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN law_type IS NOT NULL AND TRIM(law_type)!='' THEN 1 ELSE 0 END) as has_law_type,
    SUM(CASE WHEN content IS NOT NULL AND TRIM(content)!='' THEN 1 ELSE 0 END) as has_content,
    SUM(CASE WHEN meta_info IS NOT NULL AND TRIM(meta_info)!='' THEN 1 ELSE 0 END) as has_meta,
    SUM(CASE WHEN parent_law_id IS NOT NULL AND TRIM(parent_law_id)!='' THEN 1 ELSE 0 END) as has_parent
  FROM raw
`).get();
console.log("\n=== 컬럼 채움률 (전체 raw) ===", fill);

// meta_info 샘플
const metaSample = db.prepare("SELECT law_name, meta_info FROM raw WHERE meta_info IS NOT NULL AND TRIM(meta_info)!='' LIMIT 5").all();
console.log("\n=== meta_info 샘플 ===", metaSample);

// 부칙/별표/첨부 건수
const addendum = db.prepare("SELECT COUNT(*) as c FROM raw_addendum").get();
const annex = db.prepare("SELECT COUNT(*) as c FROM raw_annex").get();
const attach = db.prepare("SELECT COUNT(*) as c FROM raw_attachment").get();
console.log("\n=== 부가 테이블 ===", { addendum: addendum.c, annex: annex.c, attachment: attach.c });

// meta_info에서 문서유형 추출
const metaTypes = {};
for (const r of rows) {
  const m = (r.meta_info ?? "").match(/\[([^\s]+)/);
  const t = m ? m[1] : "(none)";
  metaTypes[t] = (metaTypes[t] ?? 0) + 1;
}
console.log("\n=== meta_info 문서유형 분포 ===", metaTypes);

// 관세법 하위 전체 meta
const customsMeta = customsRows.map((r) => ({ name: r.law_name, meta: r.meta_info }));
console.log("\n=== 관세법 그룹 meta_info ===");
for (const x of customsMeta) console.log(x.meta?.padEnd(25), x.name);
