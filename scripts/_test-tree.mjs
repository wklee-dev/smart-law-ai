import { buildRawRuleTree, getRawRuleCategoryStats } from "../app/lib/raw-rule-server.ts";

const stats = getRawRuleCategoryStats("관세관련");
console.log("stats:", stats);

const tree = buildRawRuleTree("관세관련");
console.log("\nroots:", tree.length);

const customs = tree.find((n) => n.lawName === "관세법");
if (customs) {
  console.log("\n=== 관세법 ===");
  console.log("lawId:", customs.lawId, "virtual:", customs.virtual);
  console.log("children:", customs.children.length);
  for (const c of customs.children) {
    console.log(`  [${c.docType}] ${c.lawName} (children: ${c.children.length})`);
    for (const cc of c.children.slice(0, 5)) {
      console.log(`    - [${cc.docType}] ${cc.lawName.slice(0, 50)}`);
    }
    if (c.children.length > 5) console.log(`    ... +${c.children.length - 5} more`);
  }
}
