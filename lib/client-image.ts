// 클라이언트 이미지 유틸 (촬영 페이지·상세 페이지 공용)

// 업로드 전 축소: 원본(3~5MB) → 장변 2000px JPEG(~0.3MB).
// 브라우저가 못 읽는 포맷(데스크톱 HEIC 등)이면 원본 그대로 → 서버가 변환.
export async function downscale(file: File): Promise<File> {
  try {
    const img = await loadImage(URL.createObjectURL(file));
    const MAX = 2000;
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(img.src);
    const blob = await canvasToJpeg(canvas);
    return new File([blob], "card.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

// 이미지에서 정규화 bbox([x0,y0,x1,y1], 0~1) 영역을 잘라 JPEG Blob 으로
export async function cropBboxToBlob(
  img: HTMLImageElement,
  bbox: [number, number, number, number],
): Promise<Blob> {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const [x0, y0, x1, y1] = bbox;
  const sx = Math.max(0, Math.min(1, x0)) * W;
  const sy = Math.max(0, Math.min(1, y0)) * H;
  const sw = Math.max(1, (Math.min(1, x1) - Math.min(1, x0)) * W);
  const sh = Math.max(1, (Math.min(1, y1) - Math.min(1, y0)) * H);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvasToJpeg(canvas);
}

// 이미지를 시계방향 90° 회전한 data URL 반환 (크롭 화면 방향 조정용)
export async function rotate90(src: string): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalHeight;
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return canvas.toDataURL("image/jpeg", 0.9);
}

export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.88,
    );
  });
}
