const res = await fetch(
  "http://localhost:3000/api/customs-law-portal/raw-rule/tree?gubun=" +
    encodeURIComponent("관세관련"),
);
const data = await res.json();
console.log("stats:", data.stats);

const customs = data.tree?.find((n) => n.lawName === "관세법");
console.log("roots:", data.tree?.length);
if (customs) {
  console.log("\n관세법 lawId:", customs.lawId, "virtual:", customs.virtual);
  console.log("children:", customs.children.length);
  for (const c of customs.children) {
    console.log(`  [${c.docType}] ${c.lawName} (${c.children.length} nested)`);
    for (const cc of c.children.slice(0, 4)) {
      console.log(`    - ${cc.lawName.slice(0, 55)}`);
    }
    if (c.children.length > 4) console.log(`    ... +${c.children.length - 4}`);
  }
}
