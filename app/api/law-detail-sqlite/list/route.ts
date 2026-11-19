import { NextResponse } from "next/server";
import {
  listAdmrulDocumentsFromSqlite,
  listCurrentLawDocumentsFromSqlite,
} from "@/app/lib/smart-law-sqlite-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const lawDocs = (await listCurrentLawDocumentsFromSqlite()).map((doc) => ({
      ...doc,
      doc_kind: "law" as const,
      selection_key: `law:${doc.id}`,
      related_law_id: null as string | null,
    }));
    const admrulDocs = await listAdmrulDocumentsFromSqlite();

    return NextResponse.json({
      ok: true,
      documents: [...lawDocs, ...admrulDocs],
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "법령 목록 조회 중 오류가 발생했습니다.";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
