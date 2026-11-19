import { withAppDb } from "@/hanjoo/lib/app-db";

export type LoginHistoryRow = {
  id: number;
  userId: string;
  userName: string;
  success: boolean;
  via: string;
  reason: string;
  ip: string;
  userAgent: string;
  createdAt: string;
};

export type MenuAccessRow = {
  id: number;
  userId: string;
  userName: string;
  menuLabel: string;
  menuPath: string;
  href: string;
  source: string;
  ip: string;
  userAgent: string;
  createdAt: string;
};

export type AuditSearchInput = {
  userId?: string;
  userName?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

function digitsOnlyDate(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 8);
}

function dateBound(raw: string | undefined, end: boolean): string | null {
  if (!raw?.trim()) return null;
  const d = digitsOnlyDate(raw);
  if (d.length !== 8) return null;
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return end ? `${iso} 23:59:59` : `${iso} 00:00:00`;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "";
}

export function recordLogin(input: {
  userId: string;
  userName?: string;
  success: boolean;
  via?: string;
  reason?: string;
  ip?: string;
  userAgent?: string;
}): void {
  try {
    withAppDb((db) => {
      db.prepare(
        `INSERT INTO login_history
          (user_id, user_name, success, via, reason, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.userId.trim(),
        (input.userName ?? "").trim(),
        input.success ? 1 : 0,
        input.via ?? "",
        input.reason ?? "",
        input.ip ?? "",
        (input.userAgent ?? "").slice(0, 500),
      );
    });
  } catch {
    /* 감사 실패가 로그인을 막지 않음 */
  }
}

export function recordMenuAccess(input: {
  userId: string;
  userName?: string;
  menuLabel?: string;
  menuPath?: string;
  href?: string;
  source?: string;
  ip?: string;
  userAgent?: string;
}): void {
  try {
    withAppDb((db) => {
      db.prepare(
        `INSERT INTO menu_access_history
          (user_id, user_name, menu_label, menu_path, href, source, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.userId.trim(),
        (input.userName ?? "").trim(),
        (input.menuLabel ?? "").trim(),
        (input.menuPath ?? "").trim(),
        (input.href ?? "").trim(),
        input.source ?? "menu",
        input.ip ?? "",
        (input.userAgent ?? "").slice(0, 500),
      );
    });
  } catch {
    /* ignore */
  }
}

function pageParams(input: AuditSearchInput) {
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize) || 20));
  const page = Math.max(1, Number(input.page) || 1);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function searchLoginHistory(input: AuditSearchInput & { success?: "" | "1" | "0" }): {
  rows: LoginHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
} {
  const { page, pageSize, offset } = pageParams(input);
  return withAppDb((db) => {
    const where: string[] = [];
    const args: unknown[] = [];
    if (input.userId?.trim()) {
      where.push("user_id LIKE ?");
      args.push(`%${input.userId.trim()}%`);
    }
    if (input.userName?.trim()) {
      where.push("user_name LIKE ?");
      args.push(`%${input.userName.trim()}%`);
    }
    const from = dateBound(input.from, false);
    const to = dateBound(input.to, true);
    if (from) {
      where.push("created_at >= ?");
      args.push(from);
    }
    if (to) {
      where.push("created_at <= ?");
      args.push(to);
    }
    if (input.success === "1" || input.success === "0") {
      where.push("success = ?");
      args.push(Number(input.success));
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number(
      (db.prepare(`SELECT COUNT(*) AS n FROM login_history ${clause}`).get(...args) as { n: number }).n,
    );
    const rows = (
      db
        .prepare(
          `SELECT id, user_id, user_name, success, via, reason, ip, user_agent, created_at
             FROM login_history ${clause}
            ORDER BY id DESC
            LIMIT ? OFFSET ?`,
        )
        .all(...args, pageSize, offset) as Record<string, unknown>[]
    ).map((row) => ({
      id: Number(row.id),
      userId: String(row.user_id ?? ""),
      userName: String(row.user_name ?? ""),
      success: Number(row.success) === 1,
      via: String(row.via ?? ""),
      reason: String(row.reason ?? ""),
      ip: String(row.ip ?? ""),
      userAgent: String(row.user_agent ?? ""),
      createdAt: String(row.created_at ?? ""),
    }));
    return { rows, total, page, pageSize };
  });
}

export function searchMenuAccessHistory(input: AuditSearchInput & { path?: string; label?: string }): {
  rows: MenuAccessRow[];
  total: number;
  page: number;
  pageSize: number;
} {
  const { page, pageSize, offset } = pageParams(input);
  return withAppDb((db) => {
    const where: string[] = [];
    const args: unknown[] = [];
    if (input.userId?.trim()) {
      where.push("user_id LIKE ?");
      args.push(`%${input.userId.trim()}%`);
    }
    if (input.userName?.trim()) {
      where.push("user_name LIKE ?");
      args.push(`%${input.userName.trim()}%`);
    }
    if (input.path?.trim()) {
      where.push("menu_path LIKE ?");
      args.push(`%${input.path.trim()}%`);
    }
    if (input.label?.trim()) {
      where.push("menu_label LIKE ?");
      args.push(`%${input.label.trim()}%`);
    }
    const from = dateBound(input.from, false);
    const to = dateBound(input.to, true);
    if (from) {
      where.push("created_at >= ?");
      args.push(from);
    }
    if (to) {
      where.push("created_at <= ?");
      args.push(to);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number(
      (db.prepare(`SELECT COUNT(*) AS n FROM menu_access_history ${clause}`).get(...args) as { n: number }).n,
    );
    const rows = (
      db
        .prepare(
          `SELECT id, user_id, user_name, menu_label, menu_path, href, source, ip, user_agent, created_at
             FROM menu_access_history ${clause}
            ORDER BY id DESC
            LIMIT ? OFFSET ?`,
        )
        .all(...args, pageSize, offset) as Record<string, unknown>[]
    ).map((row) => ({
      id: Number(row.id),
      userId: String(row.user_id ?? ""),
      userName: String(row.user_name ?? ""),
      menuLabel: String(row.menu_label ?? ""),
      menuPath: String(row.menu_path ?? ""),
      href: String(row.href ?? ""),
      source: String(row.source ?? ""),
      ip: String(row.ip ?? ""),
      userAgent: String(row.user_agent ?? ""),
      createdAt: String(row.created_at ?? ""),
    }));
    return { rows, total, page, pageSize };
  });
}
