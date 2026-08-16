import { NextRequest, NextResponse } from "next/server";
import { searchMfdsMedications } from "@/lib/mfds-medications";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ medications: [] });
  if (query.length > 50) {
    return NextResponse.json({ error: "검색어가 너무 길어요." }, { status: 400 });
  }

  try {
    const medications = await searchMfdsMedications(query);
    return NextResponse.json(
      { medications },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "의약품 검색 정보를 불러오지 못했어요." },
      { status: 502 },
    );
  }
}
