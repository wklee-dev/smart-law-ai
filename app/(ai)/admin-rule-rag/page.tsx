import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { AdminRuleRagChat } from "./admin-rule-rag-chat";

export default function AdminRuleRagPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-slate-100 via-slate-50 to-teal-50/30">
      <header className="relative z-10 px-4 py-3 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <CasPageHeader title="행정규칙 AI 검색" className="min-w-0 flex-1" />
            <details className="shrink-0 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-600 shadow-sm">
              <summary className="cursor-pointer select-none font-medium text-slate-700">
                검색 범위 · 상세 정보
              </summary>
              <dl className="mt-2 space-y-1 text-[11px] text-slate-500">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-slate-400">문서</dt>
                  <dd>행정규칙 (ADMIN_RULE)</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-slate-400">청크</dt>
                  <dd>ARTICLE</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-slate-400">검색</dt>
                  <dd>Hybrid Search</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-slate-400">벡터</dt>
                  <dd>768차원</dd>
                </div>
              </dl>
            </details>
          </div>
        </div>
      </header>
      <AdminRuleRagChat />
    </div>
  );
}
