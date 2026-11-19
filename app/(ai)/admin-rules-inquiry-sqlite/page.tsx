import AdminRulesInquiryView from "@/app/(ai)/admin-rules-inquiry/admin-rules-inquiry-view";

export default function AdminRulesInquirySqlitePage() {
  return (
    <AdminRulesInquiryView
      apiBase="/api/admin-rules-sqlite"
      enableCrawl={false}
      enableVectorize={false}
      crawlTargetCatalog
    />
  );
}
