import path from "node:path";
import { getSmartLawAttachRoot } from "@/app/lib/smart-law-db";

export function getClipLatestLawAttachRoot(): string {
  return (
    process.env.CLIP_LATEST_LAW_ATTACH_ROOT?.trim() ||
    process.env.CLIP_ADMIN_RULE_ATTACH_ROOT?.trim() ||
    path.join(getSmartLawAttachRoot(), "ATTACH")
  );
}

export function resolveClipLatestLawAttachmentPath(
  savedRelativePath: string,
): string {
  const rel = savedRelativePath.trim().replace(/\\/g, "/");
  if (!rel || rel.includes("..")) {
    throw new Error("invalid relative path");
  }
  if (!rel.startsWith("최신법령/") && !rel.includes("최신법령")) {
    throw new Error("path not under latest laws folder");
  }
  const abs = path.resolve(getClipLatestLawAttachRoot(), rel);
  const root = path.resolve(getClipLatestLawAttachRoot());
  const relOs = path.relative(root, abs);
  if (relOs.startsWith("..") || path.isAbsolute(relOs)) {
    throw new Error("path outside attach root");
  }
  return abs;
}
