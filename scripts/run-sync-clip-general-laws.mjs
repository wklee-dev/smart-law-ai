/**
 * 엑셀 카탈로그 누락 → gwanselaw_list + 본문 API → smart_law_ai.db
 * usage: node --env-file=.env.local scripts/run-sync-clip-general-laws.mjs
 *   or:  npm run sync:clip-general-laws  (dev 서버 기동 후)
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.PORT || "3000";
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForServer(ms = 120000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`${BASE}/api/api-management/save`, {
        method: "GET",
        cache: "no-store",
      });
      if (r.ok || r.status === 400 || r.status === 405) return true;
    } catch {
      /* retry */
    }
    await sleep(1500);
  }
  return false;
}

async function main() {
  let child = null;
  const alreadyUp = await waitForServer(3000);
  if (!alreadyUp) {
    console.log("Starting next dev…");
    child = spawn("npm", ["run", "dev"], {
      cwd: process.cwd(),
      stdio: "ignore",
      shell: true,
      env: process.env,
      detached: false,
    });
    const ok = await waitForServer(180000);
    if (!ok) {
      if (child) child.kill();
      throw new Error("dev server failed to start");
    }
  }

  console.log("POST sync-from-excel…");
  const res = await fetch(
    `${BASE}/api/customs-law-portal/general-laws/sync-from-excel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fetchBodies: true, delayMs: 400 }),
    },
  );
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  if (child) {
    child.kill("SIGTERM");
  }
  if (!res.ok && !data.bodyOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
