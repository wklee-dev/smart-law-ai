import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const CONFIRM_TOKEN = "SHUTDOWN_PC";
const DEFAULT_DELAY_SECONDS = 60;
const MIN_DELAY_SECONDS = 10;
const MAX_DELAY_SECONDS = 600;

function isLocalRequest(request: NextRequest): boolean {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  if (
    host.startsWith("127.0.0.1") ||
    host.startsWith("localhost") ||
    host.startsWith("[::1]")
  ) {
    return true;
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (
    forwarded === "127.0.0.1" ||
    forwarded === "::1" ||
    forwarded === "localhost"
  ) {
    return true;
  }

  return false;
}

/**
 * 로컬 관리자용: Windows PC 종료를 delaySeconds 후 예약한다.
 * POST { confirm: "SHUTDOWN_PC", delaySeconds?: 60 }
 * 취소: `shutdown /a`
 */
export async function POST(request: NextRequest) {
  if (!isLocalRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "로컬(localhost) 요청만 허용됩니다." },
      { status: 403 },
    );
  }

  if (process.platform !== "win32") {
    return NextResponse.json(
      { ok: false, error: "Windows에서만 PC 종료를 지원합니다." },
      { status: 400 },
    );
  }

  let body: { confirm?: string; delaySeconds?: number };
  try {
    body = (await request.json()) as {
      confirm?: string;
      delaySeconds?: number;
    };
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON 본문이 필요합니다." },
      { status: 400 },
    );
  }

  if (body.confirm !== CONFIRM_TOKEN) {
    return NextResponse.json(
      { ok: false, error: "confirm 값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const rawDelay = body.delaySeconds;
  const delaySeconds =
    typeof rawDelay === "number" && Number.isFinite(rawDelay)
      ? Math.trunc(rawDelay)
      : DEFAULT_DELAY_SECONDS;

  if (
    delaySeconds < MIN_DELAY_SECONDS ||
    delaySeconds > MAX_DELAY_SECONDS
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `delaySeconds는 ${MIN_DELAY_SECONDS}~${MAX_DELAY_SECONDS}초여야 합니다.`,
      },
      { status: 400 },
    );
  }

  try {
    await execFileAsync("shutdown", [
      "/s",
      "/t",
      String(delaySeconds),
      "/c",
      "Smart Law AI 일괄 작업 완료 후 자동 종료",
    ]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PC 종료 예약에 실패했습니다.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    delaySeconds,
    cancelHint: "종료 취소: 명령 프롬프트에서 shutdown /a",
  });
}
