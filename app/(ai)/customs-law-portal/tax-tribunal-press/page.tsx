import { TaxTribunalPressView } from "@/app/(ai)/customs-law-portal/tax-tribunal-press/tax-tribunal-press-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "보도자료 · 조세심판원",
};

export default function TaxTribunalPressPage() {
  return <TaxTribunalPressView />;
}
