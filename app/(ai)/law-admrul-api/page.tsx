import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";

export default function LawAdmrulApiPage() {
  return (
    <div className="flex min-h-[60vh] flex-col gap-3 p-6 text-slate-800">
      <CasPageHeader title="행정규칙 본문 (OPEN API 법령수집)" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="rounded-lg border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
          작업 중
        </p>
        <p className="max-w-lg text-center text-[13px] leading-relaxed text-slate-500">
          현재 API 목록이 법령(gwanselaw_list) 기준이라 행정규칙 본문 Open API
          호출에 맞지 않습니다. 행정규칙명·일련번호 기준으로 다시 구성할
          예정입니다.
        </p>
      </div>
    </div>
  );
}
