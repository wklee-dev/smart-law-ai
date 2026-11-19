import { LawInfoCenterLatestView } from "@/app/(ai)/law-info-center/latest-laws/law-info-center-latest-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "최신법령 · 국가법령정보센터",
};

export default function LawInfoCenterLatestLawsPage() {
  return <LawInfoCenterLatestView />;
}
