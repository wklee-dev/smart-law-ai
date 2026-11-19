import { NextResponse } from "next/server";
import {
  exportStandardProductCodeExcel,
  openClipStandardProductCodeDb,
} from "@/app/lib/clip-standard-product-code-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const hsCode = u.searchParams.get("hsCode") ?? "";
    const itemName = u.searchParams.get("itemName") ?? "";

    const db = openClipStandardProductCodeDb();
    try {
      const buffer = exportStandardProductCodeExcel(db, { hsCode, itemName });
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="standard-product-code_${stamp}.xlsx"`,
        },
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
