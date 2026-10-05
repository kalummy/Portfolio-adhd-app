import { NextResponse } from "next/server";
import { MfdsConfigurationError } from "@/lib/mfds-medications";
import { getVerifiedMedicationImage } from "@/lib/medication-image-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
    const client = await createServerSupabaseClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user || user.is_anonymous) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
    const verifiedImage = await getVerifiedMedicationImage(itemSequence, client, user.id);
    if (verifiedImage) {

      const imageBody = verifiedImage.bytes.buffer.slice(
        verifiedImage.bytes.byteOffset,
        verifiedImage.bytes.byteOffset + verifiedImage.bytes.byteLength,
      ) as ArrayBuffer;

      return new NextResponse(imageBody, {
        status: 200,
        headers: {
          "Content-Type": verifiedImage.contentType,
          "Content-Length": String(verifiedImage.bytes.byteLength),
          "Cache-Control": "private, max-age=300",
          "X-Content-Type-Options": "nosniff",
          "X-Addi-Image-Source": verifiedImage.source === "product" ? "mfds-product" : "mfds-pill",
        },
      });
    }

    return NextResponse.json({ error: "검증 가능한 공식 의약품 이미지가 없어요." }, { status: 404 });
  } catch (error) {
    if (error instanceof MfdsConfigurationError) {
      return NextResponse.json({ error: "공식 이미지 서비스를 사용할 수 없어요." }, { status: 503 });
    }
    return NextResponse.json({ error: "공식 의약품 이미지를 불러오지 못했어요." }, { status: 502 });
  }
}
