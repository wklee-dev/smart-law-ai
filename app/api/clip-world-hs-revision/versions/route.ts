import { NextResponse } from "next/server";
import {
  listClipWorldHsRevisionVersions,
  openClipWorldHsRevisionDb,
  resolveDefaultClipWorldHsRevisionVersionPair,
  worldHsRevisionTableReady,
} from "@/app/lib/clip-world-hs-revision-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipWorldHsRevisionDb();
    try {
      const ready = worldHsRevisionTableReady(db);
      const versions = listClipWorldHsRevisionVersions(db);
      return NextResponse.json({
        ok: true,
        ready,
        versions,
        defaultVersionPair: resolveDefaultClipWorldHsRevisionVersionPair(versions),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
