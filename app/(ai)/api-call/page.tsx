import { ApiCallView } from "@/app/components/api-call-view";

export default function ApiCallPage() {
  return (
    <ApiCallView
      lawDetailSaveUrl="/api/law-detail-sqlite/save"
      lawSearchSaveUrl="/api/law-search-sqlite/save"
      enableVectorEmbedding={false}
      storageHint="SQLite DB(smart_law_ai.db)"
    />
  );
}
