import AdminRulesInquiryView from "./admin-rules-inquiry-view";

export default function AdminRulesInquiryPage() {
  return (
    <AdminRulesInquiryView
      apiBase="/api/admin-rules"
      enableCrawl
    />
  );
}
