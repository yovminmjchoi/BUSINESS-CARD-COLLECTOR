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

export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.88,
    );
  });
}
