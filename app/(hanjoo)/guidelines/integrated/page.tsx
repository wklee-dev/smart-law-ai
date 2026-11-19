"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { GuidelineOverview } from "@/hanjoo/components/guideline-overview";

export default function IntegratedNoticePage() {
  return (
    <AppShellClient>
      <GuidelineOverview code="integrated" fallbackTitle="통합공고" />
    </AppShellClient>
  );
}
