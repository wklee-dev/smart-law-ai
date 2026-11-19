import { LlcHsChangeNoticeView } from "@/app/(ai)/law-info-center/hs-change-notice/llc-hs-change-notice-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "품목분류변경고시 · 국가법령정보센터",
};

export default function LlcHsChangeNoticePage() {
  return <LlcHsChangeNoticeView />;
}
