import { NextResponse } from "next/server";
import sharp from "sharp";
import heicConvert from "heic-convert";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { extractBusinessCard, type CardImage } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "card-images";
const MAX_EDGE = 2000; // 장변 2000px 리사이즈 (크롭은 하지 않음)

// HEIC/HEIF 판별: mime, 확장자, 또는 ftyp 브랜드(magic bytes)
function isHeic(file: File, buf: Buffer): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  if (/\.(heic|heif)$/i.test(file.name)) return true;
  // ftyp box 브랜드 검사 (offset 8~12: heic/heix/mif1/heis 등)
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (/heic|heix|hevc|heim|heis|hevm|hevs|mif1|msf1/.test(brand)) return true;
  }
  return false;
}

// 원본 → 장변 2000px JPEG (EXIF 회전 반영). sharp가 HEIC 디코딩을 못 하므로
// HEIC 이면 heic-convert 로 먼저 JPEG 변환. 저장·추출 공용.
async function toResizedJpeg(file: File): Promise<Buffer> {
  let input = Buffer.from(await file.arrayBuffer());
  if (isHeic(file, input)) {
    input = Buffer.from(
      await heicConvert({ buffer: input, format: "JPEG", quality: 0.92 }),
    );
  }
  return sharp(input)
    .rotate() // EXIF 방향 자동 보정
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

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

  // Storage 업로드: {owner_id}/{draftId}/front.jpg
  const draftId = randomUUID();
  const basePath = `${user.id}/${draftId}`;
  const imageFrontPath = `${basePath}/front.jpg`;
  const imageBackPath = backJpeg ? `${basePath}/back.jpg` : null;

  const frontUpload = await supabase.storage
    .from(BUCKET)
    .upload(imageFrontPath, frontJpeg, { contentType: "image/jpeg", upsert: true });
  if (frontUpload.error) {
    return NextResponse.json(
      { error: "이미지 업로드에 실패했습니다." },
      { status: 500 },
    );
  }
  if (backJpeg && imageBackPath) {
    await supabase.storage
      .from(BUCKET)
      .upload(imageBackPath, backJpeg, { contentType: "image/jpeg", upsert: true });
  }

  // Gemini 추출
  const images: CardImage[] = [
    { data: frontJpeg.toString("base64"), mimeType: "image/jpeg" },
  ];
  if (backJpeg) {
    images.push({ data: backJpeg.toString("base64"), mimeType: "image/jpeg" });
  }

  try {
    const extraction = await extractBusinessCard(images);
    return NextResponse.json({
      draftId,
      imageFrontPath,
      imageBackPath,
      extraction,
    });
  } catch (err) {
    // 이미지는 저장됐으므로 경로는 돌려주되, 추출 실패를 알림 (수동 입력 가능)
    return NextResponse.json(
      {
        draftId,
        imageFrontPath,
        imageBackPath,
        extraction: null,
        error:
          err instanceof Error ? err.message : "추출에 실패했습니다.",
      },
      { status: 502 },
    );
  }
}
