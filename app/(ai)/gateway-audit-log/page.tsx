import { Suspense } from "react";
import { GatewayAuditLogView } from "@/app/(ai)/gateway-audit-log/gateway-audit-log-view";

export default function GatewayAuditLogPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">불러오는 중…</div>}>
      <GatewayAuditLogView />
    </Suspense>
  );
}
