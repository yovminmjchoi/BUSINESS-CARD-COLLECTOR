// 서버 이미지 처리 공용: HEIC 판별/변환 + 리사이즈 (extract·사진교체 라우트에서 사용)

import sharp from "sharp";
import heicConvert from "heic-convert";

const MAX_EDGE = 2000; // 장변 2000px (크롭은 별도)

// HEIC/HEIF 판별: mime, 확장자, 또는 ftyp 브랜드(magic bytes)
export function isHeic(file: File, buf: Buffer): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  if (/\.(heic|heif)$/i.test(file.name)) return true;
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (/heic|heix|hevc|heim|heis|hevm|hevs|mif1|msf1/.test(brand)) return true;
  }
  return false;
}

// 원본 → 장변 2000px JPEG (EXIF 회전 반영). HEIC 이면 먼저 JPEG 변환.
export async function toResizedJpeg(file: File): Promise<Buffer> {
  let input = Buffer.from(await file.arrayBuffer());
  if (isHeic(file, input)) {
    input = Buffer.from(
      await heicConvert({ buffer: input, format: "JPEG", quality: 0.92 }),
    );
  }
  return sharp(input)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}
