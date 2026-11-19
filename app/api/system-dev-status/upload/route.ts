import { NextRequest, NextResponse } from "next/server";
import {
  importSystemDevStatusFromExcelBuffer,
  listSystemDevStatusItems,
} from "@/app/lib/system-dev-status-server";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json(
        { ok: false, message: "엑셀 파일을 선택해 주세요." },
        { status: 400 },
      );
    }

    const yearRaw = String(formData.get("year") ?? "").trim();
    const year = Number(yearRaw);
    if (!yearRaw || year < 2000 || year > 2100) {
      return NextResponse.json(
        { ok: false, message: "연도는 2000~2100 네 자리로 입력해 주세요." },
        { status: 400 },
      );
    }

    const sheetName = String(formData.get("sheetName") ?? "").trim() || undefined;
    const replaceAll = formData.get("replaceAll") !== "0";
    const fileName =
      file instanceof File && file.name ? file.name : "upload.xlsx";
    const buffer = Buffer.from(await file.arrayBuffer());

    const importResult = importSystemDevStatusFromExcelBuffer(buffer, {
      year,
      sheetName,
      replaceAll,
      fileLabel: fileName,
    });

    const data = listSystemDevStatusItems({ year });

    return NextResponse.json({
      ok: true,
      message: `${importResult.year}년 · ${importResult.imported}건 업로드 (${importResult.sheet})`,
      importResult,
      count: data.length,
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "업로드 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
