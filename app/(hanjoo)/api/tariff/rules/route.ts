import { listHsRuleYears, listHsRules } from "@/hanjoo/lib/hs-rules";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const year = new URL(req.url).searchParams.get("year")?.trim() ?? "";
  try {
    const years = await listHsRuleYears();
    const picked = years.includes(year) ? year : (years[0] ?? "");
    const loaded = picked ? await listHsRules(picked) : { intro: "", rules: [] };
    return NextResponse.json({
      ok: true,
      years,
      year: picked,
      intro: loaded.intro,
      rules: loaded.rules,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "통칙 조회 실패";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
