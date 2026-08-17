import { NextResponse } from "next/server";
import {
  fetchVerifiedMfdsImage,
  getMfdsImageCandidates,
} from "@/lib/mfds-medications";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ itemSequence: string }> },
) {
  const { itemSequence } = await params;
  if (!/^\d{9}$/.test(itemSequence)) {
    return NextResponse.json({ error: "올바르지 않은 품목기준코드예요." }, { status: 400 });
  }

  try {
    const candidates = await getMfdsImageCandidates(itemSequence);
    for (const candidate of candidates) {
      const verifiedImage = await fetchVerifiedMfdsImage(candidate);
      if (!verifiedImage) continue;

      const imageBody = verifiedImage.bytes.buffer.slice(
        verifiedImage.bytes.byteOffset,
        verifiedImage.bytes.byteOffset + verifiedImage.bytes.byteLength,
      ) as ArrayBuffer;

      return new NextResponse(imageBody, {
        status: 200,
        headers: {
          "Content-Type": verifiedImage.contentType,
          "Content-Length": String(verifiedImage.bytes.byteLength),
          "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
          "X-Content-Type-Options": "nosniff",
          "X-Addi-Image-Source": verifiedImage.source === "product" ? "mfds-product" : "mfds-pill",
        },
      });
    }

    return NextResponse.json({ error: "검증 가능한 공식 의약품 이미지가 없어요." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "공식 의약품 이미지를 불러오지 못했어요." }, { status: 502 });
  }
}
