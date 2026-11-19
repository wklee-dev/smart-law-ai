import { ApiCallView } from "@/app/components/api-call-view";

export default function ApiCallOldPage() {
  return (
    <ApiCallView
      lawDetailSaveUrl="/api/law-detail/save"
      lawSearchSaveUrl="/api/law-search/save"
      enableVectorEmbedding
      storageHint="Supabase"
    />
  );
}
