import { NextResponse } from "next/server";
import { importPriorTaxSecurityPriceFromBuffer } from "@/app/lib/clip-prior-tax-security-price-server";
import { resolveClipPriorTaxSecurityPriceBaseDate } from "@/app/lib/clip-prior-tax-security-price-shared";

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

    const requested = String(form.get("baseDate") ?? "").trim();
    if (!requested) {
      return NextResponse.json(
        { ok: false, error: "기준일자(baseDate)를 입력해 주세요." },
        { status: 400 },
      );
    }
    const baseDate = resolveClipPriorTaxSecurityPriceBaseDate(requested);

    const buffer = Buffer.from(await file.arrayBuffer());
    const { imported, base_date } = importPriorTaxSecurityPriceFromBuffer(
      buffer,
      file.name,
      baseDate,
    );
    return NextResponse.json({
      ok: true,
      imported,
      baseDate: base_date,
      message: `${base_date} 기준 ${imported.toLocaleString()}건을 반영했습니다.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
