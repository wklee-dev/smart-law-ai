"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CasPageHeader,
  CasPageShell,
  CasSubNavTabs,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  GatewayAuditLogListView,
  type GatewayAuditLogListFilters,
} from "@/app/(ai)/gateway-audit-log/gateway-audit-log-list-view";
import { GatewayAuditUsageDashboardView } from "@/app/(ai)/gateway-audit-log/gateway-audit-usage-dashboard-view";

const TABS = [
  { key: "usage", label: "처리현황" },
  { key: "log", label: "API사용로그" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function parseTab(value: string | null): TabKey {
  return value === "log" ? "log" : "usage";
}

export function GatewayAuditLogView() {
  const searchParams = useSearchParams();
  const initialTab = useMemo(
    () => parseTab(searchParams.get("tab")),
    [searchParams],
  );

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [logFilters, setLogFilters] = useState<GatewayAuditLogListFilters | undefined>();
  const [logAutoSearch, setLogAutoSearch] = useState(false);
  const [logSession, setLogSession] = useState(0);

  const openRawLog = useCallback(
    (filters: {
      dateFrom: string;
      dateTo: string;
      userId: string;
      apiNm?: string;
    }) => {
      setLogFilters({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        userId: filters.userId,
        apiNm: filters.apiNm,
      });
      setLogAutoSearch(true);
      setLogSession((n) => n + 1);
      setActiveTab("log");
    },
    [],
  );

  return (
    <CasPageShell>
      <CasPageHeader title="Gateway API 감사로그" />

      <CasSubNavTabs
        tabs={TABS}
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key);
          if (key === "usage") {
            setLogAutoSearch(false);
          }
        }}
      />

      {activeTab === "usage" ? (
        <GatewayAuditUsageDashboardView onOpenRawLog={openRawLog} />
      ) : (
        <GatewayAuditLogListView
          key={logSession}
          initialFilters={logFilters}
          autoSearch={logAutoSearch}
        />
      )}
    </CasPageShell>
  );
}
