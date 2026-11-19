import {
  countFtaOriginCertificateForms,
  ensureFtaOriginCertificateFormTable,
  getFtaOriginCertificateFormDir,
  listFtaOriginCertificateForms,
  openFtaOriginCertificateFormDb,
  syncFtaOriginCertificateFormsFromDir,
} from "@/app/lib/fta-origin-certificate-form-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const autoSync =
      new URL(req.url).searchParams.get("sync") !== "0";
    const db = openFtaOriginCertificateFormDb(false);
    try {
      ensureFtaOriginCertificateFormTable(db);
      let syncResult: {
        synced: number;
        dir: string;
        missingDir: boolean;
      } | null = null;
      if (autoSync && countFtaOriginCertificateForms(db) === 0) {
        syncResult = syncFtaOriginCertificateFormsFromDir(db);
      }
      const rows = listFtaOriginCertificateForms(db);
      return NextResponse.json({
        ok: true,
        ready: rows.length > 0,
        dir: getFtaOriginCertificateFormDir(),
        rows,
        sync: syncResult,
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
