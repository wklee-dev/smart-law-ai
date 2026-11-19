import { ClFtaAgreementTariffView } from "@/app/(ai)/cl-site/fta-agreement-tariff/cl-fta-agreement-tariff-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FTA협정관세 · 씨엘SITE",
};

export default function ClFtaAgreementTariffPage() {
  return <ClFtaAgreementTariffView />;
}
