import { NextResponse } from "next/server";
import { importStandardProductCodeFromBuffer } from "@/app/lib/clip-standard-product-code-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "file 필드가 필요합니다." },
        { status: 400 },
      );
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".xls") && !name.endsWith(".xlsx")) {
      return NextResponse.json(
        { ok: false, error: "xls 또는 xlsx 파일만 업로드할 수 있습니다." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { imported } = importStandardProductCodeFromBuffer(
      buffer,
      file.name,
    );

    return NextResponse.json({ ok: true, imported });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
