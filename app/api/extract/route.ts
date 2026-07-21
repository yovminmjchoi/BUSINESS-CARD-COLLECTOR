import { NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { toResizedJpeg } from "@/lib/image";
import { extractBusinessCard, type CardImage } from "@/lib/gemini";

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
  const back = form.get("back");
  if (!(front instanceof File)) {
    return NextResponse.json({ error: "앞면 이미지가 필요합니다." }, { status: 400 });
  }

  // 리사이즈
  let frontJpeg: Buffer;
  let backJpeg: Buffer | null = null;
  try {
    frontJpeg = await toResizedJpeg(front);
    if (back instanceof File && back.size > 0) {
      backJpeg = await toResizedJpeg(back);
    }
  } catch {
    return NextResponse.json({ error: "이미지 처리에 실패했습니다." }, { status: 400 });
  }

  const draftId = randomUUID();
  const basePath = `${user.id}/${draftId}`;
  const imageFrontPath = `${basePath}/front.jpg`;
  const imageBackPath = backJpeg ? `${basePath}/back.jpg` : null;

  // 1) Gemini 추출 먼저 (card_bbox 포함)
  const images: CardImage[] = [
    { data: frontJpeg.toString("base64"), mimeType: "image/jpeg" },
  ];
  if (backJpeg) {
    images.push({ data: backJpeg.toString("base64"), mimeType: "image/jpeg" });
  }

  let extraction = null;
  let extractErr: string | null = null;
  try {
    extraction = await extractBusinessCard(images);
  } catch (err) {
    extractErr = err instanceof Error ? err.message : "추출에 실패했습니다.";
  }

  // 2) bbox 가 있으면 앞면에서 명함 영역만 크롭 (여유 4%)
  //    사용자가 크롭 화면을 거친 경우(front_cropped=1)는 이중 크롭 방지 위해 생략
  const clientCropped = form.get("front_cropped") === "1";
  let frontOut = frontJpeg;
  if (!clientCropped && extraction?.card_bbox) {
    try {
      frontOut = await cropByBbox(frontJpeg, extraction.card_bbox);
    } catch {
      // 크롭 실패는 무시하고 원본 저장
    }
  }

  // 3) Storage 업로드 (앞/뒷면 병렬)
  const uploads = [
    supabase.storage
      .from(BUCKET)
      .upload(imageFrontPath, frontOut, { contentType: "image/jpeg", upsert: true }),
  ];
  if (backJpeg && imageBackPath) {
    uploads.push(
      supabase.storage
        .from(BUCKET)
        .upload(imageBackPath, backJpeg, { contentType: "image/jpeg", upsert: true }),
    );
  }
  const [frontUpload] = await Promise.all(uploads);
  if (frontUpload.error) {
    return NextResponse.json(
      { error: "이미지 업로드에 실패했습니다." },
      { status: 500 },
    );
  }

  if (extractErr) {
    // 이미지는 저장됐으므로 경로는 돌려주되, 추출 실패를 알림 (수동 입력 가능)
    return NextResponse.json(
      { draftId, imageFrontPath, imageBackPath, extraction: null, error: extractErr },
      { status: 502 },
    );
  }

  return NextResponse.json({ draftId, imageFrontPath, imageBackPath, extraction });
}

// 정규화 bbox([x0,y0,x1,y1], 0~1) 로 명함 영역 크롭. 각 방향 4% 여유.
async function cropByBbox(
  jpeg: Buffer,
  bbox: [number, number, number, number],
): Promise<Buffer> {
  const MARGIN = 0.04;
  const meta = await sharp(jpeg).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) return jpeg;

  const x0 = Math.max(0, bbox[0] - MARGIN);
  const y0 = Math.max(0, bbox[1] - MARGIN);
  const x1 = Math.min(1, bbox[2] + MARGIN);
  const y1 = Math.min(1, bbox[3] + MARGIN);

  const left = Math.round(x0 * W);
  const top = Math.round(y0 * H);
  const width = Math.max(1, Math.round((x1 - x0) * W));
  const height = Math.max(1, Math.round((y1 - y0) * H));
  if (width < 50 || height < 50) return jpeg; // 오검출 방어

  return sharp(jpeg)
    .extract({ left, top, width, height })
    .jpeg({ quality: 85 })
    .toBuffer();
}
