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
  let frontOut = frontJpeg;
  if (extraction?.card_bbox) {
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
