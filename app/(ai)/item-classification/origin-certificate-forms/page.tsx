import { OriginCertificateFormsView } from "@/app/(ai)/item-classification/origin-certificate-forms/origin-certificate-forms-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "원산지증명서 서식 · FTA포털",
};

export default function OriginCertificateFormsPage() {
  return <OriginCertificateFormsView />;
}
