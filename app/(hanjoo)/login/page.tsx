"use client";

import { Button } from "@/hanjoo/components/ui/Button";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import "./login.css";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/";
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(search.get("error"));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!search.has("userId") && !search.has("password")) return;
    const params = new URLSearchParams();
    if (search.get("next")) params.set("next", search.get("next") || "/");
    const q = params.toString();
    router.replace(q ? `/login?${q}` : "/login");
  }, [router, search]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        user?: { isAdmin?: boolean };
      };
      if (!res.ok || !data.ok) {
        setError(data.error || "로그인에 실패했습니다.");
        return;
      }
      const target = next.startsWith("/") ? next : "/";
      // 관리자: 다음 경로가 없으면 화면 선택 / 루트 레이아웃이 달라 전체 새로고침으로 이동
      window.location.assign(data.user?.isAdmin && target === "/" ? "/portal" : target);
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-body">
      <div className="login-wrap">
        <form className="login-panel" method="post" action="/api/auth/login" onSubmit={onSubmit}>
          <div className="login-head">
            <Image
              className="login-logo-img"
              src="/hanjoo-logo-login.png"
              alt="관세법인 한주 HANJOO"
              width={247}
              height={281}
              priority
            />
            <div>
              <h1>Smart Law</h1>
              <p>관세·법령 통합 조회</p>
            </div>
          </div>
          {error ? <div className="login-error">{error}</div> : null}
          <div className="field">
            <label htmlFor="userId">사용자 ID</label>
            <input
              id="userId"
              name="userId"
              autoComplete="username"
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button
            className="login-submit"
            type="submit"
            action="login"
            size="large"
            loading={loading}
            disabled={loading}
          >
            {loading ? "로그인 중…" : undefined}
          </Button>
          <p className="login-note">CAS 계정으로 로그인합니다</p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-body" />}>
      <LoginForm />
    </Suspense>
  );
}
