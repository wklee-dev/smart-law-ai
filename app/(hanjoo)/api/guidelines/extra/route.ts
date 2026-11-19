import {
  getClearanceBody,
  getHsSpec,
  getOriginSection,
  listOriginSections,
  searchHsSpec,
  searchOriginMarking,
  searchStdCodes,
} from "@/hanjoo/lib/clearance-guides";
import { getIolawCielPage } from "@/hanjoo/lib/iolaw-ciel";
import { searchStrategicGoods } from "@/hanjoo/lib/strategic-goods";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const kind = sp.get("kind") ?? "";
    if (kind === "body") {
      const slug = sp.get("slug") ?? "";
      const row = await getClearanceBody(slug);
      if (!row) return NextResponse.json({ ok: false, error: "내용이 없습니다." }, { status: 404 });
      return NextResponse.json({ ok: true, row });
    }
    if (kind === "guide") {
      const row = getIolawCielPage(sp.get("slug") ?? "");
      if (!row) return NextResponse.json({ ok: false, error: "내용이 없습니다." }, { status: 404 });
      return NextResponse.json({ ok: true, row });
    }
    if (kind === "strategic-search") {
      const data = await searchStrategicGoods(sp.get("field") ?? "", sp.get("q") ?? "");
      return NextResponse.json({ ok: true, ...data });
    }
    if (kind === "origin") {
      const key = sp.get("key") ?? "";
      if (sp.get("marking") === "1") {
        const data = await searchOriginMarking(
          sp.get("hs") ?? "",
          sp.get("name") ?? "",
          Number(sp.get("page") ?? "1"),
        );
        return NextResponse.json({ ok: true, ...data });
      }
      if (!key) return NextResponse.json({ ok: true, sections: listOriginSections() });
      const row = getOriginSection(key);
      if (!row) return NextResponse.json({ ok: false, error: "항목이 없습니다." }, { status: 404 });
      return NextResponse.json({ ok: true, row });
    }
    if (kind === "hs-spec") {
      const hs = sp.get("hs") ?? "";
      if (sp.get("detail") === "1") {
        const row = await getHsSpec(hs);
        if (!row) return NextResponse.json({ ok: false, error: "항목이 없습니다." }, { status: 404 });
        return NextResponse.json({ ok: true, row });
      }
      const data = await searchHsSpec(hs, sp.get("name") ?? "", Number(sp.get("page") ?? "1"));
      return NextResponse.json({ ok: true, ...data });
    }
    if (kind === "std-code") {
      const data = await searchStdCodes(
        sp.get("hs") ?? "",
        sp.get("name") ?? "",
        Number(sp.get("page") ?? "1"),
      );
      return NextResponse.json({ ok: true, ...data });
    }
    return NextResponse.json({ ok: false, error: "구분이 없습니다." }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
