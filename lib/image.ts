// 서버 이미지 처리 공용 (extract·사진교체 라우트에서 지연 import — 콜드스타트 절감)

import sharp from "sharp";

const MAX_EDGE = 2000; // 장변 2000px

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
// heic-convert(wasm) 는 실제 HEIC 일 때만 동적 로드.
export async function toResizedJpeg(file: File): Promise<Buffer> {
  let input = Buffer.from(await file.arrayBuffer());
  if (isHeic(file, input)) {
    const { default: heicConvert } = await import("heic-convert");
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

// 정규화 bbox([x0,y0,x1,y1], 0~1) 로 명함 영역 크롭. 각 방향 4% 여유.
export async function cropByBbox(
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
  if (width < 50 || height < 50) return jpeg;

  return sharp(jpeg)
    .extract({ left, top, width, height })
    .jpeg({ quality: 85 })
    .toBuffer();
}
