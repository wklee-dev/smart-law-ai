import {
  getFtaOriginCertificateFormDir,
  listFtaOriginCertificateForms,
  openFtaOriginCertificateFormDb,
  syncFtaOriginCertificateFormsFromDir,
} from "@/app/lib/fta-origin-certificate-form-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** 폴더 PDF → DB 재스캔 */
export function POST() {
  try {
    const db = openFtaOriginCertificateFormDb(false);
    try {
      const result = syncFtaOriginCertificateFormsFromDir(db);
      const rows = listFtaOriginCertificateForms(db);
      return NextResponse.json({
        ok: true,
        ...result,
        rows,
        dir: result.dir || getFtaOriginCertificateFormDir(),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
