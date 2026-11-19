import { GeneralLawInquiryView } from "@/app/components/general-law-inquiry-view";

export default function GeneralLawInquiryOldPage() {
  return (
    <GeneralLawInquiryView
      apiBase="/api/law-detail"
      storageHint="Supabase에 저장된 공포·시행 버전"
    />
  );
}
