"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearCasAuthSession,
  loadCasAuthSession,
  loginCasViaApi,
  type CasAuthSession,
} from "@/app/(ai)/cas-ncom/cas-auth-storage";
import {
  CasCompactInput,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";

export type UseCasNcomAuthResult = {
  userId: string;
  setUserId: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  session: CasAuthSession | null;
  loggingIn: boolean;
  loginError: string | null;
  login: () => Promise<CasAuthSession>;
  ensureSession: () => Promise<CasAuthSession>;
  logout: () => void;
  clearLoginError: () => void;
  handleAuthFailure: () => void;
};

export function useCasNcomAuth(): UseCasNcomAuthResult {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<CasAuthSession | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadCasAuthSession();
    if (saved) {
      setSession(saved);
      setUserId(saved.userId);
    }
  }, []);

  useEffect(() => {
    if (!session?.expiresAt) return;
    const exp = Date.parse(session.expiresAt);
    if (Number.isNaN(exp)) return;

    const remainMs = exp - Date.now();
    if (remainMs <= 0) {
      clearCasAuthSession();
      setSession(null);
      setLoginError("세션이 만료되었습니다. 다시 로그인하세요.");
      return;
    }

    const timerId = window.setTimeout(() => {
      clearCasAuthSession();
      setSession(null);
      setLoginError("세션이 만료되었습니다. 다시 로그인하세요.");
    }, remainMs);

    return () => window.clearTimeout(timerId);
  }, [session?.expiresAt, session?.token]);

  const login = useCallback(async () => {
    setLoggingIn(true);
    setLoginError(null);
    try {
      const next = await loginCasViaApi(userId, password);
      setSession(next);
      setPassword("");
      return next;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoginError(msg);
      throw e;
    } finally {
      setLoggingIn(false);
    }
  }, [password, userId]);

  const ensureSession = useCallback(async () => {
    const saved = loadCasAuthSession();
    if (saved?.token) {
      setSession(saved);
      return saved;
    }
    if (session?.token) {
      const exp = Date.parse(session.expiresAt);
      if (
        session.expiresAt &&
        !Number.isNaN(exp) &&
        exp <= Date.now()
      ) {
        clearCasAuthSession();
        setSession(null);
        setLoginError("세션이 만료되었습니다. 다시 로그인하세요.");
        throw new Error("세션이 만료되었습니다. 다시 로그인하세요.");
      }
      return session;
    }
    throw new Error("CAS 로그인이 필요합니다.");
  }, [session]);

  const logout = useCallback(() => {
    clearCasAuthSession();
    setSession(null);
    setPassword("");
    setLoginError(null);
  }, []);

  const clearLoginError = useCallback(() => {
    setLoginError(null);
  }, []);

  const handleAuthFailure = useCallback(() => {
    clearCasAuthSession();
    setSession(null);
    setLoginError("세션이 만료되었습니다. 다시 로그인하세요.");
  }, []);

  return {
    userId,
    setUserId,
    password,
    setPassword,
    session,
    loggingIn,
    loginError,
    login,
    ensureSession,
    logout,
    clearLoginError,
    handleAuthFailure,
  };
}

type CasAuthBarProps = {
  auth: UseCasNcomAuthResult;
};

/** 페이지 헤더 우측 상단 CAS 로그인 — 접기/펼치기 토글 */
export function CasAuthBar({ auth }: CasAuthBarProps) {
  const [expanded, setExpanded] = useState(false);
  const loggedIn = Boolean(auth.session?.token);
  const forceOpen = !loggedIn || Boolean(auth.loginError);
  const open = forceOpen || expanded;

  useEffect(() => {
    if (forceOpen) setExpanded(true);
  }, [forceOpen]);

  useEffect(() => {
    if (loggedIn && !auth.loginError) {
      setExpanded(false);
    }
  }, [loggedIn, auth.loginError]);

  const displayName =
    auth.session?.userName || auth.session?.userId || auth.userId;

  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="inline-flex items-center gap-1.5">
        {!open ? (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
            aria-expanded={false}
            aria-label="CAS 로그인 펼치기"
            onClick={() => setExpanded(true)}
          >
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
              CAS
            </span>
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
              aria-hidden
            />
            <span className="max-w-[100px] truncate sm:max-w-[140px]">
              {displayName}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5 shrink-0 text-slate-400"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : (
          <>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
              CAS
            </span>
            <CasCompactInput
              type="text"
              autoComplete="username"
              className="h-7 w-[96px] border-slate-200/90 text-[12px] shadow-none sm:w-[100px]"
              placeholder="사용자 ID"
              value={auth.userId}
              onChange={(e) => auth.setUserId(e.target.value)}
            />
            <CasCompactInput
              type="password"
              autoComplete="current-password"
              className="h-7 w-[96px] border-slate-200/90 text-[12px] shadow-none sm:w-[100px]"
              placeholder="비밀번호"
              value={auth.password}
              onChange={(e) => auth.setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void auth.login().catch(() => undefined);
                }
              }}
            />
            <button
              type="button"
              className="h-7 shrink-0 rounded bg-[#1e2f4f] px-3 text-[12px] font-medium text-white hover:bg-[#162438] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={auth.loggingIn || !auth.userId.trim() || !auth.password}
              onClick={() => {
                void auth.login()
                  .then(() => auth.clearLoginError())
                  .catch(() => undefined);
              }}
            >
              {auth.loggingIn ? "…" : "로그인"}
            </button>
            {loggedIn ? (
              <>
                <button
                  type="button"
                  className="h-7 shrink-0 px-1 text-[12px] text-slate-500 hover:text-slate-700"
                  onClick={auth.logout}
                >
                  로그아웃
                </button>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                  aria-label="CAS 로그인 접기"
                  onClick={() => {
                    setExpanded(false);
                    auth.setPassword("");
                    auth.clearLoginError();
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M9.47 6.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1-1.06 1.06L10 8.56l-3.72 3.72a.75.75 0 0 1-1.06-1.06l4.25-4.25Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
