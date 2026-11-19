import { NextResponse } from "next/server";
import {
  listClipWorldHsClassificationCaseCountries,
  listClipWorldHsClassificationCaseEffectivePeriods,
  openClipWorldHsClassificationCasesDb,
  worldHsClassificationCasesTableReady,
} from "@/app/lib/clip-world-hs-classification-cases-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipWorldHsClassificationCasesDb();
    try {
      const ready = worldHsClassificationCasesTableReady(db);
      return NextResponse.json({
        ok: true,
        ready,
        countries: listClipWorldHsClassificationCaseCountries(db),
        effectivePeriods:
          listClipWorldHsClassificationCaseEffectivePeriods(db),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
