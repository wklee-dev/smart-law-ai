import type { Metadata } from "next";
import { OpenlawInquiryView } from "@/app/components/openlaw-inquiry-view";

export const metadata: Metadata = {
  title: "법령조회(OPEN API)",
};

export default function OpenlawInquiryPage() {
  return <OpenlawInquiryView />;
}
