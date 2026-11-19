import { NextResponse } from "next/server";
import {
  clipQuestionDistinctGubun,
  openClipQuestionDb,
} from "@/app/lib/clip-question-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipQuestionDb();
    try {
      const gubun_options = clipQuestionDistinctGubun(db);
      return NextResponse.json({ gubun_options });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
