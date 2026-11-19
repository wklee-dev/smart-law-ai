import { NextResponse, type NextRequest } from "next/server";
import { resolveAdminRole, type AdminRole } from "@/hanjoo/lib/admin-users";

/**
 * 로그인(Smart-Law-Hanjoo 세션 hj_session) + 화면 구역 권한.
 * - Hanjoo 포털: 로그인한 모든 사용자
 * - 그 외(smart-law-ai 관리자 화면·API): 관리자(isAdmin)만
 */
const COOKIE = "hj_session";
const TASK_TOKEN_HEADER = "x-smart-law-task-token";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/me"];

const HANJOO_PAGE_PREFIXES = [
  "/cases",
  "/guidelines",
  "/laws",
  "/news",
  "/precedents",
  "/rates",
  "/tariff",
  "/tools",
];

const HANJOO_API_PREFIXES = [
  "/api/auth",
  "/api/audit",
  "/api/cases",
  "/api/guidelines",
  "/api/laws",
  "/api/hj",
  "/api/precedents",
  "/api/rates",
  "/api/tariff",
  "/api/tools",
];

/** admin 권한만 (관리자 등록) */
const ADMIN_ROLE_ONLY = ["/admin-users", "/api/admin-users"];

/** Hanjoo 접두어 아래지만 smart-law-ai 관리자 전용 */
const ADMIN_EXCEPTIONS = ["/api/tariff/hs-explanatory", "/api/tariff/schedule", "/tariff/api"];

function underAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isHanjooZone(pathname: string): boolean {
  if (pathname === "/") return true;
  if (underAny(pathname, ADMIN_EXCEPTIONS)) return false;
  return underAny(pathname, HANJOO_PAGE_PREFIXES) || underAny(pathname, HANJOO_API_PREFIXES);
}

function secret(): string {
  return process.env.AUTH_SECRET?.trim() || "dev-secret";
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

type ProxySession = { userId: string; role: AdminRole | null };

async function readSession(token: string | undefined): Promise<ProxySession | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!timingSafeEqualStr(sig, await sign(body))) return null;
  try {
    const b64 = body.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as {
      userId?: unknown;
      groupId?: unknown;
    };
    if (!raw?.userId) return null;
    const userId = String(raw.userId);
    const groupId = raw.groupId ? String(raw.groupId) : undefined;
    return { userId, role: resolveAdminRole(userId, groupId) };
  } catch {
    return null;
  }
}

/** 예약 작업(주간 크롤링) — AUTH_SECRET 을 헤더로 전달 */
function isTaskRequest(req: NextRequest): boolean {
  const configured = process.env.AUTH_SECRET?.trim();
  const sent = req.headers.get(TASK_TOKEN_HEADER)?.trim();
  return Boolean(configured && sent && timingSafeEqualStr(sent, configured));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?|ttf|txt)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }
  if (underAny(pathname, PUBLIC_PATHS)) return NextResponse.next();
  if (isTaskRequest(req)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const session = await readSession(req.cookies.get(COOKIE)?.value);
  if (!session) {
    if (isApi) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  const denied =
    (underAny(pathname, ADMIN_ROLE_ONLY) && session.role !== "admin") ||
    (session.role == null && !isHanjooZone(pathname));
  if (denied) {
    if (isApi) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = session.role ? "/ai" : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
