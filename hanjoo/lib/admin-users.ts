/**
 * 관리자 등록 (JSON 파일). proxy.ts(Node 런타임)에서도 사용 — next/headers 등 금지.
 * - admin : smart-law-ai 관리자 화면 + 관리자 등록 메뉴
 * - user  : smart-law-ai 관리자 화면
 * - 미등록 : Smart-Law-Hanjoo 포털만
 */
import fs from "node:fs";
import path from "node:path";

export type AdminRole = "admin" | "user";

export type AdminUserEntry = {
  userId: string;
  userName: string;
  deptName: string;
  position: string;
  role: AdminRole;
  updatedAt: string;
  updatedBy: string;
};

/** 항상 admin (삭제·권한변경 불가) */
export const SUPER_ADMIN_IDS = ["wklee"];

export function isSuperAdmin(userId: string): boolean {
  const id = userId.trim().toLowerCase();
  return SUPER_ADMIN_IDS.some((s) => s.toLowerCase() === id);
}

/** 배포(ZIP 덮어쓰기)와 무관하게 유지되도록 다운로드 루트(C:\SQLiteDB)에 저장 */
export function adminUsersJsonPath(): string {
  const explicit = process.env.ADMIN_USERS_JSON_PATH?.trim();
  if (explicit) return explicit;
  // 런타임 값으로 조합 — 빌드 파일 추적(nft)이 폴더를 패키지에 넣지 않도록
  const dir = process.env.SMART_LAW_ATTACH_ROOT?.trim() || `C:${path.sep}SQLiteDB`;
  return path.join(dir, "smart_law_admin_users.json");
}

let cache: { mtimeMs: number; file: string; list: AdminUserEntry[] } | null = null;

export function readAdminUsers(): AdminUserEntry[] {
  const file = adminUsersJsonPath();
  let mtimeMs = -1;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    return [];
  }
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.list;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { users?: unknown };
    const list = (Array.isArray(raw.users) ? raw.users : [])
      .filter((u): u is AdminUserEntry => Boolean(u && (u as AdminUserEntry).userId))
      .map((u) => ({ ...u, role: u.role === "admin" ? "admin" : "user" }) as AdminUserEntry);
    cache = { mtimeMs, file, list };
    return list;
  } catch {
    return [];
  }
}

export function writeAdminUsers(list: AdminUserEntry[]): void {
  const file = adminUsersJsonPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ users: list }, null, 2), "utf8");
  fs.renameSync(tmp, file);
  cache = null;
}

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/** 현재 권한 (매 요청 JSON 기준 — 해제 즉시 반영) */
export function resolveAdminRole(userId: string, groupId?: string): AdminRole | null {
  if (isSuperAdmin(userId)) return "admin";
  const id = userId.trim().toUpperCase();
  const hit = readAdminUsers().find((u) => u.userId.trim().toUpperCase() === id);
  if (hit) return hit.role;
  if (envList("ADMIN_USER_IDS").includes(id)) return "admin";
  const g = (groupId ?? "").trim().toUpperCase();
  if (g && envList("ADMIN_GROUP_IDS").includes(g)) return "user";
  return null;
}
