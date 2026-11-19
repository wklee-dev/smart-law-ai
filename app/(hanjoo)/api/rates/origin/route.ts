import { listFtaAgreementOverview, searchOriginByHs } from "@/hanjoo/lib/fta-portal";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const part = sp.get("part") ?? "search";
    if (part === "agreements") {
      const rows = (await listFtaAgreementOverview()).map((row) => ({
        code: row.code,
        name: row.name,
        countries: row.countries,
      }));
      return NextResponse.json({ ok: true, rows });
    }
    if (part === "search") {
      return NextResponse.json({
        ok: true,
        ...(await searchOriginByHs({
          code: sp.get("code") ?? "",
          hs: sp.get("hs") ?? "",
        })),
      });
    }
    return NextResponse.json({ ok: false, error: "part가 올바르지 않습니다." }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
