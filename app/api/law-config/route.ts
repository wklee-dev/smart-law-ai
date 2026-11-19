import { NextResponse } from "next/server";
import { getSupabaseApiUrl } from "@/app/lib/supabase/admin";

export async function GET() {
  const lawApiOc = process.env.LAW_API_OC?.trim() ?? "";
  const lawXmlServiceUrl = process.env.LAW_XMLSERVICE_URL?.trim() ?? "";
  const lawJsonServiceUrl = process.env.LAW_JSONSERVICE_URL?.trim() ?? "";

  let supabaseApiUrl: string | null = null;
  let supabaseIsLocal: boolean | null = null;
  try {
    const url = getSupabaseApiUrl();
    supabaseApiUrl = url;
    const u = url.toLowerCase();
    supabaseIsLocal =
      u.includes("127.0.0.1") ||
      u.includes("localhost") ||
      u.includes("0.0.0.0:");
  } catch {
    supabaseApiUrl = null;
    supabaseIsLocal = null;
  }

  return NextResponse.json({
    ok: true,
    lawApiOc,
    lawXmlServiceUrl,
    lawJsonServiceUrl,
    supabaseApiUrl,
    supabaseIsLocal,
  });
}