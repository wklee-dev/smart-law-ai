"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CasAlert,
  CasCard,
  CasCompactInput,
  CasInlineField,
  CasPageHeader,
  CasSaveButton,
  CasSearchButton,
  CasSearchFormActions,
  casSelectClass,
  slTableWrapClass,
  stickyThClass,
  tdClass,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  CasSearchFieldsRow,
  CasSearchFormRow,
} from "@/app/(ai)/cas-ncom/cas-page-top-bar";

type Role = "admin" | "user";

type CasUser = { userId: string; userName: string; deptName: string; position: string };
type AdminEntry = CasUser & { role: Role; updatedAt: string; updatedBy: string };

type LoadResult = {
  ok: boolean;
  error?: string;
  casUsers?: CasUser[];
  admins?: AdminEntry[];
  superAdminIds?: string[];
  jsonPath?: string;
};

const ROLE_LABEL: Record<Role, string> = { admin: "admin", user: "사용자" };

export function AdminUsersView() {
  const [casUsers, setCasUsers] = useState<CasUser[]>([]);
  /** 선택(등록)된 사용자 → 권한 */
  const [picked, setPicked] = useState<Map<string, Role>>(new Map());
  const [superIds, setSuperIds] = useState<Set<string>>(new Set());
  const [jsonPath, setJsonPath] = useState("");
  const [q, setQ] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [onlyAdmin, setOnlyAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-users", { cache: "no-store" });
      const data = (await res.json()) as LoadResult;
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCasUsers(data.casUsers ?? []);
      const supers = new Set((data.superAdminIds ?? []).map((s) => s.toUpperCase()));
      setSuperIds(supers);
      const next = new Map<string, Role>();
      for (const a of data.admins ?? []) next.set(a.userId.toUpperCase(), a.role);
      for (const s of supers) next.set(s, "admin");
      setPicked(next);
      setJsonPath(data.jsonPath ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return casUsers.filter((u) => {
      if (onlyPicked && !picked.has(u.userId.toUpperCase())) return false;
      if (onlyAdmin && picked.get(u.userId.toUpperCase()) !== "admin") return false;
      if (!term) return true;
      return [u.userId, u.userName, u.deptName, u.position].some((v) =>
        v.toLowerCase().includes(term),
      );
    });
  }, [casUsers, q, onlyPicked, onlyAdmin, picked]);

  const togglePick = (userId: string, on: boolean) => {
    const key = userId.toUpperCase();
    if (superIds.has(key)) return;
    setPicked((prev) => {
      const next = new Map(prev);
      if (on) next.set(key, prev.get(key) ?? "user");
      else next.delete(key);
      return next;
    });
  };

  const setRole = (userId: string, role: Role) => {
    const key = userId.toUpperCase();
    if (superIds.has(key)) return;
    setPicked((prev) => new Map(prev).set(key, role));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const users = casUsers
        .filter((u) => picked.has(u.userId.toUpperCase()))
        .map((u) => ({ userId: u.userId, role: picked.get(u.userId.toUpperCase()) }));
      const res = await fetch("/api/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; admins?: AdminEntry[] };
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMessage(`저장했습니다. 등록 ${data.admins?.length ?? 0}명`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const pickedCount = casUsers.filter((u) => picked.has(u.userId.toUpperCase())).length;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-slate-50 p-4 md:p-6">
      <CasCard className="shrink-0 p-4 md:p-5">
        <CasPageHeader title="관리자 등록" />
        {message ? (
          <div className="mt-3">
            <CasAlert tone="info">{message}</CasAlert>
          </div>
        ) : null}
        {error ? (
          <div className="mt-3">
            <CasAlert tone="error">{error}</CasAlert>
          </div>
        ) : null}
        <div className="mt-3 border-t border-slate-100 pt-3">
          <CasSearchFormRow
            singleLine
            compact
            fields={
              <CasSearchFieldsRow singleLine compact>
                <CasInlineField label="검색" aligned className="min-w-[14rem] shrink-0">
                  <CasCompactInput
                    placeholder="사용자ID·이름·부서·직책"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="min-w-[14rem]"
                  />
                </CasInlineField>
                <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={onlyPicked}
                    onChange={(e) => setOnlyPicked(e.target.checked)}
                  />
                  등록된 사용자만
                </label>
                <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={onlyAdmin}
                    onChange={(e) => setOnlyAdmin(e.target.checked)}
                  />
                  관리자
                </label>
              </CasSearchFieldsRow>
            }
            actions={
              <CasSearchFormActions inline>
                <CasSearchButton type="button" disabled={loading} onClick={() => void load()}>
                  조회
                </CasSearchButton>
                <CasSaveButton type="button" disabled={loading || saving} onClick={() => void save()}>
                  저장
                </CasSaveButton>
              </CasSearchFormActions>
            }
          />
        </div>
      </CasCard>

      <CasCard className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-sm text-slate-600">
          <span>
            {loading
              ? "불러오는 중…"
              : `CAS 사용자(한주 0000) ${casUsers.length}명 · 표시 ${rows.length}명 · 선택 ${pickedCount}명`}
          </span>
          <span className="text-[11px] text-slate-400" title={jsonPath}>
            admin: 관리자 화면 + 관리자 등록 · 사용자: 관리자 화면 · 미선택: 포털만
          </span>
        </div>
        <div className={`min-h-0 flex-1 ${slTableWrapClass} rounded-none border-x-0 border-b-0`}>
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm text-slate-800">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className={`${stickyThClass} !w-14 !px-3 !py-2 !text-center !text-sm`}>선택</th>
                <th className={`${stickyThClass} !px-3 !py-2 !text-sm`}>사용자ID</th>
                <th className={`${stickyThClass} !px-3 !py-2 !text-sm`}>이름</th>
                <th className={`${stickyThClass} !px-3 !py-2 !text-sm`}>부서명</th>
                <th className={`${stickyThClass} !px-3 !py-2 !text-sm`}>직책</th>
                <th className={`${stickyThClass} !w-32 !px-3 !py-2 !text-sm`}>권한</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const key = u.userId.toUpperCase();
                const role = picked.get(key);
                const locked = superIds.has(key);
                return (
                  <tr
                    key={u.userId}
                    className={`border-t border-slate-100 hover:bg-sky-50/60 ${role ? "bg-sky-50/40" : ""}`}
                  >
                    <td className={`${tdClass} !px-3 !py-2 text-center`}>
                      <input
                        type="checkbox"
                        checked={Boolean(role)}
                        disabled={locked}
                        onChange={(e) => togglePick(u.userId, e.target.checked)}
                        aria-label={`${u.userName} 선택`}
                      />
                    </td>
                    <td className={`${tdClass} !px-3 !py-2 whitespace-nowrap`}>{u.userId}</td>
                    <td className={`${tdClass} !px-3 !py-2 whitespace-nowrap`}>{u.userName}</td>
                    <td className={`${tdClass} !px-3 !py-2 whitespace-nowrap`}>{u.deptName}</td>
                    <td className={`${tdClass} !px-3 !py-2 whitespace-nowrap`}>{u.position}</td>
                    <td className={`${tdClass} !px-3 !py-2`}>
                      {role ? (
                        <select
                          className={`${casSelectClass} w-full`}
                          value={role}
                          disabled={locked}
                          onChange={(e) => setRole(u.userId, e.target.value as Role)}
                        >
                          <option value="admin">{ROLE_LABEL.admin}</option>
                          <option value="user">{ROLE_LABEL.user}</option>
                        </select>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CasCard>
    </div>
  );
}
