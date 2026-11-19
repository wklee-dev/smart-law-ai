import {
  clFtaNativeTablesReady,
  clFtaRateTablesReady,
  listClFtaGeneral,
  listClFtaNations,
  openClFtaRateDb,
} from "@/app/lib/cl-fta-rate-server";
import {
  listPortalAgreementTabs,
  listPortalHsGuides,
  portalFtaTablesReady,
} from "@/app/lib/fta-portal-rate-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const preferCl = new URL(req.url).searchParams.get("source") === "cl";
    const db = openClFtaRateDb();
    try {
      if (preferCl) {
        const ready = clFtaNativeTablesReady(db);
        return NextResponse.json({
          ok: true,
          ready,
          portal: false,
          source: "cl",
          nations: listClFtaNations(db, { preferCl: true }),
          overviewGeneral: listClFtaGeneral(db, "FTA"),
          guides: [],
        });
      }
      const ready = clFtaRateTablesReady(db);
      const portal = portalFtaTablesReady(db);
      return NextResponse.json({
        ok: true,
        ready,
        portal,
        source: portal ? "portal" : "cl",
        nations: portal ? listPortalAgreementTabs(db) : [],
        guides: portal ? listPortalHsGuides(db) : [],
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
