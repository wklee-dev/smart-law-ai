import { authenticateCas } from "@/hanjoo/lib/cas-auth";
import { clientIp, recordLogin } from "@/hanjoo/lib/audit-log";
import {
  authenticateLocal,
  encodeSession,
  sessionCookieName,
  withAdminFlag,
} from "@/hanjoo/lib/session";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function loginError(
  message: string,
  status: number,
  asForm: boolean,
  req: Request,
  meta?: { userId?: string; via?: string },
) {
  recordLogin({
    userId: meta?.userId || "(unknown)",
    success: false,
    via: meta?.via || "",
    reason: message,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? "",
  });
  if (!asForm) {
    return NextResponse.json({ ok: false, error: message }, { status });
  }
  return seeOther(`/login?${new URLSearchParams({ error: message })}`);
}

/** 상대 Location: 서버 내부 host(localhost) 대신 브라우저 주소 유지 */
function seeOther(location: string) {
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    const asForm = !contentType.includes("application/json");
    let userId = "";
    let password = "";
    if (asForm) {
      const form = await req.formData();
      userId = String(form.get("userId") ?? "").trim();
      password = String(form.get("password") ?? "");
    } else {
      const body = (await req.json()) as {
        userId?: string;
        password?: string;
      };
      userId = (body.userId ?? "").trim();
      password = body.password ?? "";
    }
    if (!userId || !password) {
      return loginError("사용자 ID와 비밀번호를 입력하세요.", 400, asForm, req, { userId });
    }

    const ip = clientIp(req);
    const ua = req.headers.get("user-agent") ?? "";

    // 1) CAS (PMKSystem USER_MST) 우선
    try {
      const cas = await authenticateCas(userId, password);
      if (cas.ok) {
        const user = withAdminFlag(cas.user);
        recordLogin({
          userId: user.userId,
          userName: user.userName,
          success: true,
          via: "cas",
          ip,
          userAgent: ua,
        });
        const res = asForm
          ? seeOther(user.isAdmin ? "/portal" : "/")
          : NextResponse.json({ ok: true, user, via: "cas" });
        res.cookies.set(sessionCookieName(), encodeSession(user), {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 12,
        });
        return res;
      }
      // 아이디/비번 오류는 CAS 메시지 그대로 (로컬 폴백하지 않음)
      if (
        cas.error.includes("아이디") ||
        cas.error.includes("패스워드") ||
        cas.error.includes("잠겼") ||
        cas.error.includes("권한")
      ) {
        return loginError(cas.error, 401, asForm, req, { userId, via: "cas" });
      }
    } catch (e) {
      const allowLocal =
        process.env.AUTH_ALLOW_LOCAL?.trim().toLowerCase() === "true";
      if (!allowLocal) {
        const msg = e instanceof Error ? e.message : String(e);
        return loginError(`CAS 로그인 확인 중 오류: ${msg}`, 500, asForm, req, {
          userId,
          via: "cas",
        });
      }
      // CAS 연결 실패 시에만 로컬 데모 계정
      const localRaw = authenticateLocal(userId, password);
      const local = localRaw ? withAdminFlag(localRaw) : null;
      if (!local) {
        return loginError(
          "CAS 서버에 연결할 수 없고, 로컬 데모 계정도 일치하지 않습니다.",
          401,
          asForm,
          req,
          { userId, via: "local" },
        );
      }
      recordLogin({
        userId: local.userId,
        userName: local.userName,
        success: true,
        via: "local",
        ip,
        userAgent: ua,
      });
      const res = asForm
        ? seeOther(local.isAdmin ? "/portal" : "/")
        : NextResponse.json({ ok: true, user: local, via: "local" });
      res.cookies.set(sessionCookieName(), encodeSession(local), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
      return res;
    }

    return loginError("아이디 또는 비밀번호가 올바르지 않습니다.", 401, asForm, req, {
      userId,
      via: "cas",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
