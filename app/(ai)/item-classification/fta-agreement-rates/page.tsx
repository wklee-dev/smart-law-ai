import type { Metadata } from "next";
import { FtaAgreementRatesView } from "@/app/(ai)/item-classification/fta-agreement-rates/fta-agreement-rates-view";

export const metadata: Metadata = {
  title: "협정별세율정보 · FTA 수입세율 조회",
};

export default function FtaAgreementRatesPage() {
  return <FtaAgreementRatesView />;
}
