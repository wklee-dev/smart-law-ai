import { NextResponse } from "next/server";
import {
  adminUsersJsonPath,
  isSuperAdmin,
  readAdminUsers,
  writeAdminUsers,
  type AdminRole,
  type AdminUserEntry,
} from "@/hanjoo/lib/admin-users";
import { listCasStaffUsers } from "@/hanjoo/lib/cas-users";
import { getSessionUser } from "@/hanjoo/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const me = await getSessionUser();
  if (!me || me.role !== "admin") return null;
  return me;
}

/** CAS 한주 사용자 목록 + 등록된 관리자(JSON) */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const casUsers = await listCasStaffUsers();
    return NextResponse.json({
      ok: true,
      casUsers,
      admins: readAdminUsers(),
      superAdminIds: casUsers.filter((u) => isSuperAdmin(u.userId)).map((u) => u.userId),
      jsonPath: adminUsersJsonPath(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `CAS 사용자 조회 실패: ${msg}` }, { status: 500 });
  }
}

/** 선택한 사용자만 저장 (전체 교체). body: { users: [{ userId, role }] } */
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const body = (await req.json()) as { users?: { userId?: string; role?: string }[] };
    const picked = new Map<string, AdminRole>();
    for (const u of body.users ?? []) {
      const id = String(u.userId ?? "").trim();
      if (!id) continue;
      picked.set(id.toUpperCase(), u.role === "admin" ? "admin" : "user");
    }

    // 이름·부서·직책은 CAS 값으로 저장 (클라이언트 값 신뢰하지 않음)
    const casUsers = await listCasStaffUsers();
    const now = new Date().toISOString();
    const list: AdminUserEntry[] = [];
    for (const c of casUsers) {
      const key = c.userId.toUpperCase();
      const superAdmin = isSuperAdmin(c.userId);
      if (!picked.has(key) && !superAdmin) continue;
      list.push({
        userId: c.userId,
        userName: c.userName,
        deptName: c.deptName,
        position: c.position,
        role: superAdmin ? "admin" : picked.get(key)!,
        updatedAt: now,
        updatedBy: me.userId,
      });
    }
    writeAdminUsers(list);
    return NextResponse.json({ ok: true, admins: list });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
