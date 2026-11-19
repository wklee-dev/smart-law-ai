import { Suspense } from "react";
import WorldHsClassificationCasesView from "./world-hs-classification-cases-view";

export default function WorldHsClassificationCasesPage() {
  return (
    <Suspense
      fallback={
        <p className="p-4 text-[13px] text-[#666]">화면을 불러오는 중…</p>
      }
    >
      <WorldHsClassificationCasesView />
    </Suspense>
  );
}
