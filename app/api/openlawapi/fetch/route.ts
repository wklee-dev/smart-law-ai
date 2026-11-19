import { NextRequest, NextResponse } from "next/server";
import {
  listGwanselawItemsFromDb,
  saveGwanselawItemsToDb,
} from "@/app/lib/gwanselaw-list-server";
import {
  streamOpenlawMainFetch,
  type OpenlawProgressEvent,
} from "@/app/lib/openlawapi-server";
import { formatLastReceivedAt } from "@/app/shared/last-received-date";
import { normalizeLawIdForStorage } from "@/app/shared/law-id";

export const runtime = "nodejs";
export const maxDuration = 600;

type FetchRequest = {
  lawIds?: string[];
  gwanselawIds?: string[];
  /** true면 첨부 다운로드 제외 (기본: 첨부 포함) */
  noAttach?: boolean;
  /** false면 행정규칙 제외 (기본: 행정규칙 포함) */
  includeAdmrul?: boolean;
};

async function updateGwanselawReceivedAt(
  gwanselawIds: string[],
  successLawIds: string[],
) {
  if (gwanselawIds.length === 0 || successLawIds.length === 0) return;
  const receivedAt = formatLastReceivedAt(new Date());
  const successSet = new Set(successLawIds);
  const items = await listGwanselawItemsFromDb();
  const next = items.map((item) => {
    if (!gwanselawIds.includes(item.id)) return item;
    const lid = normalizeLawIdForStorage(item.lawId);
    if (!lid || !successSet.has(lid)) return item;
    return { ...item, updatedAt: receivedAt };
  });
  await saveGwanselawItemsToDb(next);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FetchRequest;
    const lawIds = Array.isArray(body.lawIds)
      ? body.lawIds.map((id) => normalizeLawIdForStorage(String(id))).filter(Boolean)
      : [];
    const gwanselawIds = Array.isArray(body.gwanselawIds)
      ? body.gwanselawIds.map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (lawIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "lawIds 배열이 필요합니다." },
        { status: 400 },
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const push = (event: OpenlawProgressEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        try {
          for await (const event of streamOpenlawMainFetch(lawIds, {
            noAttach: body.noAttach === true,
            includeAdmrul: body.includeAdmrul !== false,
          })) {
            push(event);

            if (event.type === "result" && event.successLawIds) {
              await updateGwanselawReceivedAt(
                gwanselawIds,
                event.successLawIds,
              );
            }
            if (event.type === "error") {
              // 실패여도 부분 성공이 있으면 최종수신일 갱신
              if (event.successLawIds?.length) {
                await updateGwanselawReceivedAt(
                  gwanselawIds,
                  event.successLawIds,
                );
              }
            }
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "openlawapi 본문 수집 중 오류가 발생했습니다.";
          push({ type: "error", error: message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("openlawapi/fetch 오류:", error);
    const message =
      error instanceof Error
        ? error.message
        : "openlawapi 본문 수집 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
