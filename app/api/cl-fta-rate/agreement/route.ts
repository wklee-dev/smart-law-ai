import { getClFtaGuide } from "@/app/lib/cl-fta-guide-server";
import {
  listClFtaAttachments,
  listClFtaGeneralForAgreement,
  listClFtaHs2Options,
  listClFtaNations,
  listClFtaPsrGuide,
  listClFtaRateCodes,
  listClFtaRecom,
  openClFtaRateDb,
} from "@/app/lib/cl-fta-rate-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const ftaCd = u.searchParams.get("ftaCd")?.trim() ?? "";
    const preferCl = u.searchParams.get("source") === "cl";
    if (!ftaCd) {
      return NextResponse.json(
        { ok: false, error: "ftaCd가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openClFtaRateDb();
    try {
      const opts = preferCl ? { preferCl: true } : undefined;
      const nation =
        listClFtaNations(db, opts).find((n) => n.fta_cd === ftaCd) ?? null;
      if (!nation) {
        return NextResponse.json(
          { ok: false, error: "협정을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      const rateCodes = listClFtaRateCodes(db, ftaCd, opts);
      return NextResponse.json({
        ok: true,
        nation,
        general: listClFtaGeneralForAgreement(db, ftaCd),
        psrGuide: listClFtaPsrGuide(db, ftaCd),
        recom: listClFtaRecom(db, ftaCd),
        rateCodes,
        hs2Options: listClFtaHs2Options(db, ftaCd, opts),
        attachments: listClFtaAttachments(db, ftaCd),
        guide: getClFtaGuide(
          db,
          ftaCd,
          rateCodes.map((c) => c.rate_cd),
        ),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
