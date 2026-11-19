import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const extractScript = path.join(__dirname, "extract_data_processing_status.py");
const excelPath =
  process.env.DATA_PROCESSING_STATUS_XLSX?.trim() ||
  "D:/Manus/법령정보및관세율,품목분류사례 처리현황.xlsx";

let timer = null;

function runExtract(reason) {
  console.log(`[processing-status] sync (${reason})`);
  const child = spawn("python", [extractScript], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  child.on("error", (err) => {
    console.error("[processing-status] sync failed:", err.message);
  });
}

function scheduleExtract(reason) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => runExtract(reason), 800);
}

if (!fs.existsSync(excelPath)) {
  console.warn(`[processing-status] Excel not found, watching anyway: ${excelPath}`);
} else {
  runExtract("initial");
}

console.log(`[processing-status] watching ${excelPath}`);
fs.watch(excelPath, { persistent: true }, () => scheduleExtract("excel-changed"));
