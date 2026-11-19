"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { IntegratedNotice } from "@/hanjoo/components/integrated-notice";

export default function HsGuidancePage() {
  return (
    <AppShellClient>
      <IntegratedNotice title="HS별 수출입요령" />
    </AppShellClient>
  );
}
