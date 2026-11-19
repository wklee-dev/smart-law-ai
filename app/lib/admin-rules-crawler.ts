/**
 * D:\Crawling\law_crawler\crawler.py 실행
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { preferCDrive } from "@/app/lib/drive-fallback";

export function getAdminRulesCrawlerDir(): string {
  return (
    process.env.ADMIN_RULES_CRAWLER_DIR?.trim() ||
    process.env.LAW_CRAWLER_DIR?.trim() ||
    preferCDrive("C:/Crawling/law_crawler")
  );
}

function getPythonExecutable(): string {
  return process.env.PYTHON_PATH?.trim() || "python";
}

export type CrawlProgressEvent =
  | { type: "start"; param: string; message: string }
  | { type: "log"; line: string }
  | { type: "crawl_done"; param: string; exitCode: number }
  | { type: "sync_start"; param: string }
  | { type: "sync_done"; param: string; sync: unknown }
  | { type: "error"; message: string }
  | { type: "done"; ok: boolean; message: string };

export async function runAdminRulesCrawler(options: {
  param: string;
  force?: boolean;
  noDownload?: boolean;
  onLog?: (line: string) => void;
}): Promise<{ exitCode: number; log: string }> {
  const dir = path.resolve(getAdminRulesCrawlerDir());
  const py = path.join(dir, "crawler.py");
  if (!fs.existsSync(py)) {
    throw new Error(`크롤러를 찾을 수 없습니다: ${py}`);
  }

  const args = ["crawler.py", "-p", options.param];
  if (options.force !== false) args.push("--force");
  if (options.noDownload) args.push("--no-download");

  const lines: string[] = [];
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(getPythonExecutable(), args, {
      cwd: dir,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      windowsHide: true,
    });

    const onData = (buf: Buffer) => {
      const text = buf.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        lines.push(line);
        options.onLog?.(line);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

  return { exitCode, log: lines.join("\n") };
}
