/**
 * One-off: compare 관세법(1556) eflaw vs eflawjosub for same 조 (기본 argv[4]=1).
 */
import fs from "node:fs";
import { parseLawDetailJson } from "../app/lib/law-detail-parser";
import { extractEflawJosubDisplayParts } from "../app/lib/law-eflaw-josub";

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const eflawPath = process.argv[2] ?? "";
const josubPath = process.argv[3] ?? "";
if (!eflawPath || !josubPath) {
  console.error(
    "Usage: npx tsx scripts/compare-eflaw-vs-josub.ts <eflaw-response.json> <eflawjosub-response.json> [articleNo]",
  );
  process.exit(1);
}

function readJsonFile<T>(path: string): T {
  const raw = fs.readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as T;
}

const eflawWrap = readJsonFile<{ parsedJson?: unknown }>(eflawPath);
const josubWrap = readJsonFile<{ parsedJson?: unknown }>(josubPath);

if (!eflawWrap.parsedJson || typeof eflawWrap.parsedJson !== "object") {
  throw new Error("eflaw file missing parsedJson object");
}
if (!josubWrap.parsedJson) {
  throw new Error("josub file missing parsedJson");
}

const parsed = parseLawDetailJson(eflawWrap.parsedJson as Record<string, unknown>);
const targetArticleNo = (process.argv[4] ?? "1").trim().replace(/\D/g, "") || "1";

const articleChunk = parsed.chunks.find(
  (c) =>
    c.sourceType === "article" &&
    String((c.metadata as { article_no?: string }).article_no ?? "").replace(
      /\D/g,
      "",
    ) === targetArticleNo,
);

const josubParts = extractEflawJosubDisplayParts(josubWrap.parsedJson);

const fromEflaw = articleChunk?.chunkText ?? "";
const fromJosub = josubParts.chunkText;

console.log("=== law_name ===");
console.log(parsed.document.lawNameKr);
console.log("\n=== eflawjosub sourceTitle ===");
console.log(josubParts.sourceTitle);
console.log("\n=== eflaw article chunk source_title ===");
console.log(articleChunk?.sourceTitle ?? "(no article chunk)");
console.log("\n=== normalized equal? ===");
console.log(norm(fromEflaw) === norm(fromJosub));
console.log("\n--- eflaw (first 800 chars, normalized preview) ---");
console.log(norm(fromEflaw).slice(0, 800));
console.log("\n--- eflawjosub (first 800 chars, normalized preview) ---");
console.log(norm(fromJosub).slice(0, 800));
console.log("\n--- length eflaw / josub ---");
console.log(fromEflaw.length, fromJosub.length);
