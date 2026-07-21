import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { extractMultipleCards, type CardExtraction } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "card-images";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const front = form.get("front");
  const clientReady = form.get("front_cropped") === "1";
  if (!(front instanceof File)) {
    return NextResponse.json({ error: "이미지가 필요합니다." }, { status: 400 });
  }

  let buf: Buffer;
  try {
    if (clientReady) buf = Buffer.from(await front.arrayBuffer());
    else {
      const { toResizedJpeg } = await import("@/lib/image");
      buf = await toResizedJpeg(front);
    }
  } catch {
    return NextResponse.json({ error: "이미지 처리에 실패했습니다." }, { status: 400 });
  }

  let cards: CardExtraction[];
  try {
    cards = await extractMultipleCards({
      data: buf.toString("base64"),
      mimeType: "image/jpeg",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "인식 실패" },
      { status: 502 },
    );
  }
  if (cards.length === 0) {
    return NextResponse.json({ error: "명함을 찾지 못했습니다." }, { status: 422 });
  }

  const { cropByBbox } = await import("@/lib/image");

  // 각 명함 영역을 잘라 개별 이미지로 저장
  const results = await Promise.all(
    cards.map(async (extraction) => {
      const draftId = randomUUID();
      const imageFrontPath = `${user.id}/${draftId}/front.jpg`;
      let region = buf;
      if (extraction.card_bbox) {
        try {
          region = await cropByBbox(buf, extraction.card_bbox);
        } catch {
          /* 크롭 실패 시 전체 이미지 사용 */
        }
      }
      await supabase.storage
        .from(BUCKET)
        .upload(imageFrontPath, region, { contentType: "image/jpeg", upsert: true });
      return { draftId, imageFrontPath, extraction };
    }),
  );

  return NextResponse.json({ cards: results });
}
