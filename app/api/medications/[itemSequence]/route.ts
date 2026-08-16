import { NextRequest, NextResponse } from "next/server";
import { getMfdsMedication } from "@/lib/mfds-medications";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ itemSequence: string }> },
) {
  const { itemSequence } = await params;
  if (!/^\d{9}$/.test(itemSequence)) {
    return NextResponse.json({ error: "올바르지 않은 품목기준코드예요." }, { status: 400 });
  }

  try {
    const medication = await getMfdsMedication(itemSequence);
    if (!medication) {
      return NextResponse.json({ error: "의약품 상세정보를 찾을 수 없어요." }, { status: 404 });
    }
    return NextResponse.json(
      { medication },
      {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "의약품 상세정보를 불러오지 못했어요." },
      { status: 502 },
    );
  }
}
