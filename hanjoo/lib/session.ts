import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveAdminRole, type AdminRole } from "@/hanjoo/lib/admin-users";

export type SessionUser = {
  userId: string;
  userName: string;
  custCd?: string;
  groupId?: string;
  /** smart-law-ai 관리자 화면 접근 (admin 또는 user 권한) */
  isAdmin?: boolean;
  /** 관리자 등록(JSON) 권한 — admin 만 관리자 등록 메뉴 */
  role?: AdminRole | null;
};

export function withAdminFlag(user: SessionUser): SessionUser {
  const role = resolveAdminRole(user.userId, user.groupId);
  return { ...user, role, isAdmin: role != null };
}

const COOKIE = "hj_session";

function secret(): string {
  return process.env.AUTH_SECRET?.trim() || "dev-secret";
}

/** Node HMAC — must match middleware Web Crypto base64url(HMAC-SHA256) */
function sign(payload: string): string {
  return createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
}

export function encodeSession(user: SessionUser): string {
  const body = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expect = sign(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const raw = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionUser;
    if (!raw?.userId) return null;
    // 권한은 쿠키 값이 아니라 현재 관리자 JSON 기준
    return withAdminFlag({
      userId: String(raw.userId),
      userName: String(raw.userName || raw.userId),
      groupId: raw.groupId ? String(raw.groupId) : undefined,
    });
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE)?.value);
}

export function sessionCookieName(): string {
  return COOKIE;
}

export function authenticateLocal(
  userId: string,
  password: string,
): SessionUser | null {
  const id = process.env.AUTH_USER_ID?.trim() || "admin";
  const pw = process.env.AUTH_PASSWORD?.trim() || "admin123";
  const name = process.env.AUTH_USER_NAME?.trim() || "관리자";
  if (userId === id && password === pw) {
    return { userId: id, userName: name };
  }
  return null;
}
