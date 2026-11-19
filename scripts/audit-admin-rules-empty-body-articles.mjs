import { DatabaseSync } from "node:sqlite";

const dbPath =
  process.env.ADMIN_RULES_DB_PATH ||
  process.env.SMART_LAW_SQLITE_DB_PATH ||
  "D:/SQLiteDB/smart_law_ai.db";

const db = new DatabaseSync(dbPath, { readOnly: true });

const rules = db
  .prepare(`SELECT param, description FROM rule_master ORDER BY description`)
  .all();

/** UI: 조문·기타 본문 행 — 장절만 있으면 "표시할 본문 조항이 없습니다" */
const emptyBodyArticles = [];

for (const r of rules) {
  const p = String(r.param);
  const mainCount = db
    .prepare(`SELECT COUNT(*) AS n FROM admin_rule WHERE param = ?`)
    .get(p)?.n;
  if (!mainCount) continue;

  const joCount = db
    .prepare(
      `SELECT COUNT(*) AS n FROM admin_rule WHERE param = ? AND section_type = '조문'`,
    )
    .get(p)?.n;
  const otherContent = db
    .prepare(
      `SELECT COUNT(*) AS n FROM admin_rule WHERE param = ? AND section_type NOT IN ('장절', '조문') AND TRIM(COALESCE(article_content,'')) != ''`,
    )
    .get(p)?.n;

  if (joCount === 0 && otherContent === 0) {
    const types = db
      .prepare(
        `SELECT section_type, COUNT(*) AS n FROM admin_rule WHERE param = ? GROUP BY section_type`,
      )
      .all(p);
    emptyBodyArticles.push({
      param: p,
      description: r.description,
      mainRows: mainCount,
      sectionTypes: types,
    });
  }
}

console.log("DB:", dbPath);
console.log(
  "admin_rule는 있으나 조문(및 본문성) 행 없음 — 본문 탭 빈 화면:",
  emptyBodyArticles.length,
);
for (const x of emptyBodyArticles) {
  console.log(`- [${x.param}] ${x.description}`, x.sectionTypes);
}

db.close();
