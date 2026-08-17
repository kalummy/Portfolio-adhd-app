import { NextRequest, NextResponse } from "next/server";
import { matchMfdsManualMedication } from "@/lib/mfds-medications";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  const strengthValue = Number(request.nextUrl.searchParams.get("strength"));

  if (!name || name.length > 50 || !Number.isFinite(strengthValue) || strengthValue <= 0) {
    return NextResponse.json({ error: "올바른 약 이름과 용량이 필요해요." }, { status: 400 });
  }

  try {
    const result = await matchMfdsManualMedication(name, strengthValue);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "의약품 공식 정보를 확인하지 못했어요." },
      { status: 502 },
    );
  }
}
