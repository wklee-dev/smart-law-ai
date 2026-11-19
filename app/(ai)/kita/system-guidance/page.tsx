import type { Metadata } from "next";
import { SystemGuidanceView } from "@/app/(ai)/kita/system-guidance/system-guidance-view";

export const metadata: Metadata = {
  title: "전략물자제도안내 · Yestrade",
};

export default function SystemGuidancePage() {
  return <SystemGuidanceView />;
}
