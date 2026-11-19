"use client";

import { useCallback, useState } from "react";
import { ExportCertView } from "@/app/(ai)/cas-api/3m-sap-if/export-cert-view";
import { HsOriginView } from "@/app/(ai)/cas-api/3m-sap-if/hs-origin-view";
import { ItemOriginView } from "@/app/(ai)/cas-api/3m-sap-if/item-origin-view";
import {
  CasPageHeader,
  CasPageShell,
  CasSubNavTabs,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { CasPageTopBar } from "@/app/(ai)/cas-ncom/cas-page-top-bar";
import {
  type CasGatewayMode,
  useCasGatewayMode,
} from "@/app/(ai)/cas-ncom/cas-gateway-mode";
import { useCasNcomAuth } from "@/app/(ai)/cas-ncom/use-cas-ncom-auth";

const TABS = [
  { key: "export-cert", label: "3M 수출증명서" },
  { key: "item-origin", label: "품목-원산지 판정" },
  { key: "hs-origin", label: "HS-원산지결정기준" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ThreeMSapIfView() {
  const auth = useCasNcomAuth();
  const gateway = useCasGatewayMode();
  const [activeTab, setActiveTab] = useState<TabKey>("export-cert");

  const handleGatewayChange = useCallback(
    (next: CasGatewayMode) => {
      if (next === gateway.mode) return;
      gateway.setMode(next);
      auth.logout();
    },
    [auth, gateway],
  );

  return (
    <CasPageShell>
      <CasPageHeader
        title="3M SAP I/F"
        action={
          <CasPageTopBar
            auth={auth}
            gatewayMode={gateway.mode}
            onGatewayChange={handleGatewayChange}
          />
        }
      />

      <CasSubNavTabs
        tabs={TABS}
        activeKey={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "export-cert" ? <ExportCertView auth={auth} /> : null}
      {activeTab === "item-origin" ? <ItemOriginView auth={auth} /> : null}
      {activeTab === "hs-origin" ? <HsOriginView auth={auth} /> : null}
    </CasPageShell>
  );
}
