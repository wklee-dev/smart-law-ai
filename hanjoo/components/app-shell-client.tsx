"use client";

import { SiteChrome } from "@/hanjoo/components/site-chrome";
import { Suspense, useEffect, useState } from "react";

export function AppShellClient({ children }: { children: React.ReactNode }) {
  const [userName, setUserName] = useState<string | undefined>();
  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: { userName?: string } }) => {
        setUserName(d.user?.userName);
      })
      .catch(() => undefined);
  }, []);
  return (
    <Suspense>
      <SiteChrome userName={userName}>{children}</SiteChrome>
    </Suspense>
  );
}
