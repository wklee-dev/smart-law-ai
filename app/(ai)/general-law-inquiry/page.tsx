import { GeneralLawInquiryView } from "@/app/components/general-law-inquiry-view";

export default function GeneralLawInquiryPage() {
  return (
    <GeneralLawInquiryView
      apiBase="/api/law-detail-sqlite"
      storageHint="SQLite DB(smart_law_ai.db)에 저장된 공포·시행 버전"
    />
  );
}
