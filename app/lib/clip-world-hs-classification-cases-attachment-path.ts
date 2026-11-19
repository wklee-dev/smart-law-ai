import path from "node:path";
import { getSmartLawAttachRoot } from "@/app/lib/smart-law-db";

export function getWorldHsCaseDownloadRoot(): string {
  return (
    process.env.WORLD_HS_CASE_DOWNLOAD_ROOT?.trim() ||
    process.env.SMART_LAW_DOWNLOAD_ROOT?.trim() ||
    path.join(getSmartLawAttachRoot(), "downloads")
  );
}

/** local_path가 허용 루트(및 품목분류사례 하위)인지 검증 후 절대 경로 반환 */
export function resolveWorldHsCaseAttachmentPath(localPath: string): string {
  const trimmed = localPath.trim();
  if (!trimmed) {
    throw new Error("empty path");
  }
  const root = path.resolve(getWorldHsCaseDownloadRoot());
  const attachRoot = getSmartLawAttachRoot();
  // D:/SQLiteDB/... → C:/SQLiteDB/...
  const rewritten = trimmed.replace(
    /^[A-Za-z]:[\\/]+SQLiteDB[\\/]*/i,
    attachRoot.replace(/\\/g, "/") + "/",
  );
  const abs = path.isAbsolute(rewritten)
    ? path.resolve(rewritten)
    : path.resolve(root, rewritten);
  const rel = path.relative(root, abs);
  const relAttach = path.relative(attachRoot, abs);
  const underRoot =
    (!rel.startsWith("..") && !path.isAbsolute(rel)) ||
    (!relAttach.startsWith("..") && !path.isAbsolute(relAttach));
  if (!underRoot) {
    throw new Error("path outside download root");
  }
  const segments = abs.split(path.sep).filter(Boolean);
  if (!segments.some((s) => s.includes("품목분류"))) {
    throw new Error("path not under classification cases folder");
  }
  return abs;
}
