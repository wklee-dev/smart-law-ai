"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AdminShell } from "./admin-shell";

function AppShellBody({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  if (searchParams.get("embed") === "1") {
    return (
      <div className="h-full min-h-0 w-full min-w-0 overflow-y-auto overflow-x-hidden bg-[#f4f7f9]">
        {children}
      </div>
    );
  }
  return <AdminShell>{children}</AdminShell>;
}

/** `?embed=1` 이면 사이드바·탭 없이 본문만 (iframe/탭 유지용) */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex-1 bg-[#f4f7f9]" aria-hidden />
      }
    >
      <AppShellBody>{children}</AppShellBody>
    </Suspense>
  );
}
