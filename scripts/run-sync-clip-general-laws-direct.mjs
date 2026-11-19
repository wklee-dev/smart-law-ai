/**
 * 엑셀 카탈로그 누락 → gwanselaw_list 추가 + eflaw API → smart_law_ai.db
 * node --import tsx scripts/run-sync-clip-general-laws-direct.mjs
 */
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

// .env.local 로드 (BOM 허용)
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  let text = fs.readFileSync(envPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// server-only 무시
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return origLoad(request, parent, isMain);
};

console.log("LAW_API_OC", process.env.LAW_API_OC ? "set" : "MISSING");
console.log(
  "LAW_JSONSERVICE_URL",
  process.env.LAW_JSONSERVICE_URL || "MISSING",
);

const { syncClipGeneralLawsFromCatalog } = await import(
  "../app/lib/clip-general-law-sync-server.ts"
);

const result = await syncClipGeneralLawsFromCatalog({
  fetchBodies: true,
  delayMs: 400,
});

const out = path.join(root, "scripts", "_tmp_sync_general_laws_result.json");
fs.writeFileSync(out, JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
console.log("wrote", out);

if (result.bodyFail > 0 && result.bodyOk === 0) process.exit(1);
