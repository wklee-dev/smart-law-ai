import { buildRawRuleTree } from "../app/lib/raw-rule-server.ts";

const tree = buildRawRuleTree("관세법령");

function walk(n, depth = 0) {
  const indent = "  ".repeat(depth);
  const childNote = n.children.length ? ` (${n.children.length})` : "";
  console.log(`${indent}[${n.docType}] ${n.lawName}${childNote}`);
  const limit = depth < 3 ? 999 : 2;
  for (const c of n.children.slice(0, limit)) walk(c, depth + 1);
  if (depth >= 3 && n.children.length > 2) {
    console.log(`${indent}  ... +${n.children.length - 2} more`);
  }
}

const customs = tree.find((t) => t.id === "A_001") ?? tree.find((t) => t.lawName === "관세법");
console.log("roots:", tree.length);
if (customs) {
  console.log("\n=== 관세법 트리 ===");
  walk(customs);
}
