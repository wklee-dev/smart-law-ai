import { NextRequest, NextResponse } from "next/server";
import {
  getNlcNoticeDetail,
  listNlcLocalLegislationNotices,
  listNlcMinistryAdministrativeNotices,
  listNlcMinistryLegislationNotices,
  type NlcListFilters,
} from "@/hanjoo/lib/nlc-notice-server";
import type { NlcNoticeKind } from "@/hanjoo/lib/nlc-notice-types";

export const runtime = "nodejs";

function parseKind(raw: string | null): NlcNoticeKind | null {
  if (
    raw === "ministry-legislation" ||
    raw === "ministry-administrative" ||
    raw === "local-legislation"
  ) {
    return raw;
  }
  return null;
}

function listFiltersFromParams(params: URLSearchParams): NlcListFilters {
  const sortRaw = params.get("sort");
  const statusRaw = params.get("noticeStatus");
  return {
    page: Number(params.get("page") ?? "1"),
    pageSize: Number(params.get("pageSize") ?? "20"),
    q: params.get("q") ?? undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    includeFinished: params.get("includeFinished") === "1",
    organizationOnly: params.get("organizationOnly") === "1",
    sort:
      sortRaw === "date_asc" ||
      sortRaw === "title_asc" ||
      sortRaw === "views_desc" ||
      sortRaw === "date_desc"
        ? sortRaw
        : undefined,
    noticeStatus:
      statusRaw === "open" || statusRaw === "closed" || statusRaw === "all"
        ? statusRaw
        : undefined,
    department: params.get("department") ?? undefined,
    lawType: params.get("lawType") ?? undefined,
    lawField: params.get("lawField") ?? undefined,
    institution: params.get("institution") ?? undefined,
    ruleType: params.get("ruleType") ?? undefined,
    noticeNumber: params.get("noticeNumber") ?? undefined,
    localGovernment: params.get("localGovernment") ?? undefined,
    localRegion: params.get("localRegion") ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const detailKind = parseKind(params.get("detailKind"));
    const sequence = params.get("sequence")?.trim();
    if (detailKind && sequence) {
      const detail = await getNlcNoticeDetail(detailKind, sequence);
      if (!detail) {
        return NextResponse.json(
          { ok: false, message: "해당 예고를 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, detail });
    }

    const kind = parseKind(params.get("kind"));
    if (!kind) {
      return NextResponse.json(
        { ok: false, message: "kind 파라미터가 필요합니다." },
        { status: 400 },
      );
    }

    const filters = listFiltersFromParams(params);
    if (kind === "ministry-legislation") {
      return NextResponse.json(await listNlcMinistryLegislationNotices(filters));
    }
    if (kind === "ministry-administrative") {
      return NextResponse.json(await listNlcMinistryAdministrativeNotices(filters));
    }
    return NextResponse.json(await listNlcLocalLegislationNotices(filters));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "조회 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
