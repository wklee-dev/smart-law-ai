import type { Metadata } from "next";
import { DualUseHskView } from "@/app/(ai)/kita/dual-use/dual-use-hsk-view";

export const metadata: Metadata = {
  title: "이중용도 · 전략물자관리시스템",
};

export default function DualUseHskPage() {
  return <DualUseHskView />;
}
