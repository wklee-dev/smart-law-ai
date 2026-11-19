import {
  getFtaAgreementDetail,
  listFtaAgreementOverview,
  listFtaGeneralPrinciples,
  listFtaNations,
  listRateYears,
  searchAgreementDuty,
  searchAgreementOrigin,
  searchOrigin,
  searchRates,
} from "@/hanjoo/lib/fta-portal";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const part = sp.get("part") ?? "nations";
    if (part === "nations") {
      return NextResponse.json({ ok: true, nations: await listFtaNations() });
    }
    if (part === "agreements") {
      return NextResponse.json({ ok: true, rows: await listFtaAgreementOverview() });
    }
    if (part === "general") {
      return NextResponse.json({ ok: true, sections: await listFtaGeneralPrinciples() });
    }
    if (part === "detail") {
      const detail = await getFtaAgreementDetail(sp.get("code") ?? "");
      if (!detail) {
        return NextResponse.json({ ok: false, error: "협정 정보가 없습니다." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, detail });
    }
    if (part === "duty-item") {
      return NextResponse.json({
        ok: true,
        ...(await searchAgreementDuty(sp.get("code") ?? "", sp.get("hs") ?? "")),
      });
    }
    if (part === "origin-item") {
      return NextResponse.json({
        ok: true,
        ...(await searchAgreementOrigin(sp.get("code") ?? "", sp.get("hs") ?? "")),
      });
    }
    if (part === "origin") {
      return NextResponse.json({
        ok: true,
        ...(await searchOrigin({
          nation: sp.get("nation") ?? "",
          chapter: sp.get("chapter") ?? "",
          hs: sp.get("hs") ?? "",
          page: Number(sp.get("page") ?? "1"),
        })),
      });
    }
    if (part === "rates") {
      return NextResponse.json({
        ok: true,
        ...(await searchRates({
          nation: sp.get("nation") ?? "",
          chapter: sp.get("chapter") ?? "",
          hs: sp.get("hs") ?? "",
          page: Number(sp.get("page") ?? "1"),
        })),
      });
    }
    if (part === "years") {
      return NextResponse.json({
        ok: true,
        years: await listRateYears(sp.get("nation") ?? "", sp.get("hs") ?? ""),
      });
    }
    return NextResponse.json({ ok: false, error: "part가 올바르지 않습니다." }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
