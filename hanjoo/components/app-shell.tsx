import { SiteChrome } from "@/hanjoo/components/site-chrome";
import { getSessionUser } from "@/hanjoo/lib/session";
import { Suspense } from "react";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <Suspense>
      <SiteChrome userName={user?.userName} isAdmin={user?.isAdmin === true}>{children}</SiteChrome>
    </Suspense>
  );
}
