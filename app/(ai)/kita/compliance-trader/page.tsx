import type { Metadata } from "next";
import { ComplianceTraderView } from "@/app/(ai)/kita/compliance-trader/compliance-trader-view";

export const metadata: Metadata = {
  title: "자율준수무역거래자 · Yestrade",
};

export default function ComplianceTraderPage() {
  return <ComplianceTraderView />;
}
