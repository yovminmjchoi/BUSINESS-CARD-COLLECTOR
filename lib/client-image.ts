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

export interface NormalizedPoint {
  x: number;
  y: number;
}

export type CardQuad = [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function bboxToQuad(bbox: [number, number, number, number]): CardQuad {
  const [x0, y0, x1, y1] = bbox;
  return [
    { x: clamp01(x0), y: clamp01(y0) },
    { x: clamp01(x1), y: clamp01(y0) },
    { x: clamp01(x1), y: clamp01(y1) },
    { x: clamp01(x0), y: clamp01(y1) },
  ];
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

function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mixPoint(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function pointOnQuad(quad: { x: number; y: number }[], u: number, v: number) {
  const top = mixPoint(quad[0], quad[1], u);
  const bottom = mixPoint(quad[3], quad[2], u);
  return mixPoint(top, bottom, v);
}

function triangleTransform(
  src: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }],
  dst: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }],
) {
  const [s0, s1, s2] = src;
  const [d0, d1, d2] = dst;
  const den =
    s0.x * (s1.y - s2.y) +
    s1.x * (s2.y - s0.y) +
    s2.x * (s0.y - s1.y);
  if (Math.abs(den) < 0.001) return null;
  return {
    a: (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / den,
    b: (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / den,
    c: (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / den,
    d: (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / den,
    e:
      (d0.x * (s1.x * s2.y - s2.x * s1.y) +
        d1.x * (s2.x * s0.y - s0.x * s2.y) +
        d2.x * (s0.x * s1.y - s1.x * s0.y)) /
      den,
    f:
      (d0.y * (s1.x * s2.y - s2.x * s1.y) +
        d1.y * (s2.x * s0.y - s0.x * s2.y) +
        d2.y * (s0.x * s1.y - s1.x * s0.y)) /
      den,
  };
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  src: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }],
  dst: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }],
) {
  const t = triangleTransform(src, dst);
  if (!t) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dst[0].x, dst[0].y);
  ctx.lineTo(dst[1].x, dst[1].y);
  ctx.lineTo(dst[2].x, dst[2].y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// 네 모서리 기준으로 기울어진 명함을 반듯한 사각형 이미지로 펴서 캔버스에 그림.
export function cropQuadToCanvas(img: HTMLImageElement, quad: CardQuad): HTMLCanvasElement {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const src = quad.map((p) => ({ x: clamp01(p.x) * W, y: clamp01(p.y) * H }));
  const outW = Math.max(1, Math.round(Math.max(pointDistance(src[0], src[1]), pointDistance(src[3], src[2]))));
  const outH = Math.max(1, Math.round(Math.max(pointDistance(src[0], src[3]), pointDistance(src[1], src[2]))));
  const scale = Math.min(1, 2200 / Math.max(outW, outH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(outW * scale));
  canvas.height = Math.max(1, Math.round(outH * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const stepsX = Math.max(10, Math.min(34, Math.ceil(canvas.width / 80)));
  const stepsY = Math.max(8, Math.min(28, Math.ceil(canvas.height / 80)));
  for (let y = 0; y < stepsY; y++) {
    const v0 = y / stepsY;
    const v1 = (y + 1) / stepsY;
    for (let x = 0; x < stepsX; x++) {
      const u0 = x / stepsX;
      const u1 = (x + 1) / stepsX;
      const s00 = pointOnQuad(src, u0, v0);
      const s10 = pointOnQuad(src, u1, v0);
      const s01 = pointOnQuad(src, u0, v1);
      const s11 = pointOnQuad(src, u1, v1);
      const d00 = { x: u0 * canvas.width, y: v0 * canvas.height };
      const d10 = { x: u1 * canvas.width, y: v0 * canvas.height };
      const d01 = { x: u0 * canvas.width, y: v1 * canvas.height };
      const d11 = { x: u1 * canvas.width, y: v1 * canvas.height };
      drawTriangle(ctx, img, [s00, s10, s11], [d00, d10, d11]);
      drawTriangle(ctx, img, [s00, s11, s01], [d00, d11, d01]);
    }
  }
  return canvas;
}

export async function cropQuadToBlob(img: HTMLImageElement, quad: CardQuad): Promise<Blob> {
  return canvasToJpeg(cropQuadToCanvas(img, quad));
}

// bbox 영역을 (여백 포함해) 잘라, 그 안에서 카드의 네 꼭지점을 찾아 반듯하게 펴서 반환.
// 꼭지점을 못 찾으면(저대비 등) 축 정렬 크롭으로 폴백 → 최소한 잘리진 않음.
// 원본 이미지는 호출부에서 그대로 보관하므로, 자동 보정이 어긋나도 재크롭으로 되돌릴 수 있음.
export async function deskewRegionToBlob(
  img: HTMLImageElement,
  bbox: [number, number, number, number],
  expand = 0.05,
): Promise<Blob> {
  const [x0, y0, x1, y1] = bbox;
  const ex0 = Math.max(0, x0 - expand);
  const ey0 = Math.max(0, y0 - expand);
  const ex1 = Math.min(1, x1 + expand);
  const ey1 = Math.min(1, y1 + expand);
  const regionBlob = await cropBboxToBlob(img, [ex0, ey0, ex1, ey1]);
  let regionImg: HTMLImageElement;
  const regionUrl = URL.createObjectURL(regionBlob);
  try {
    regionImg = await loadImage(regionUrl);
  } catch {
    URL.revokeObjectURL(regionUrl);
    return cropBboxToBlob(img, bbox);
  }
  try {
    const quad = autoDetectCardQuad(regionImg);
    if (quad) return await cropQuadToBlob(regionImg, quad);
    return await cropBboxToBlob(img, bbox);
  } finally {
    URL.revokeObjectURL(regionUrl);
  }
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

// 문서 정리 필터를 캔버스에 직접(픽셀) 적용.
// ctx.filter 는 구형 iOS Safari(17 미만)에서 무시되므로 수동 계산해야 저장본에 반영됨.
// 미리보기 CSS 필터 문자열과 동일 수식·순서로 맞춤(ImageCropper FILTERS 참고).
export function applyDocFilter(
  canvas: HTMLCanvasElement,
  mode: "none" | "color" | "doc",
): void {
  if (mode === "none") return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const im = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = im.data;
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const contrast = (v: number, c: number) => (v - 127.5) * c + 127.5;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (mode === "doc") {
      // grayscale(1) → brightness(1.18) → contrast(1.8)
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = g = b = l * 1.18;
      r = contrast(r, 1.8); g = contrast(g, 1.8); b = contrast(b, 1.8);
    } else {
      // color: contrast(1.2) → saturate(1.35) → brightness(1.05)
      r = contrast(r, 1.2); g = contrast(g, 1.2); b = contrast(b, 1.2);
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = (l + 1.35 * (r - l)) * 1.05;
      g = (l + 1.35 * (g - l)) * 1.05;
      b = (l + 1.35 * (b - l)) * 1.05;
    }
    d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
  }
  ctx.putImageData(im, 0, 0);
}

function dilateMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = false;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < w && yy >= 0 && yy < h && mask[yy * w + xx]) {
            on = true;
            break;
          }
        }
      }
      out[y * w + x] = on ? 1 : 0;
    }
  }
  return out;
}

function erodeMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = true;
      for (let dy = -1; dy <= 1 && on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h || !mask[yy * w + xx]) {
            on = false;
            break;
          }
        }
      }
      out[y * w + x] = on ? 1 : 0;
    }
  }
  return out;
}

function fitXFromY(points: { x: number; y: number }[]) {
  if (points.length < 6) return null;
  let sy = 0, sx = 0, syy = 0, syx = 0;
  for (const p of points) {
    sy += p.y;
    sx += p.x;
    syy += p.y * p.y;
    syx += p.y * p.x;
  }
  const n = points.length;
  const den = n * syy - sy * sy;
  if (Math.abs(den) < 0.001) return null;
  const a = (n * syx - sy * sx) / den;
  const b = (sx - a * sy) / n;
  return { a, b };
}

function fitYFromX(points: { x: number; y: number }[]) {
  if (points.length < 6) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
  }
  const n = points.length;
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 0.001) return null;
  const a = (n * sxy - sx * sy) / den;
  const b = (sy - a * sx) / n;
  return { a, b };
}

function intersectXFromYAndYFromX(
  xFromY: { a: number; b: number },
  yFromX: { a: number; b: number },
) {
  const den = 1 - xFromY.a * yFromX.a;
  if (Math.abs(den) < 0.001) return null;
  const x = (xFromY.a * yFromX.b + xFromY.b) / den;
  return { x, y: yFromX.a * x + yFromX.b };
}

function quadArea(points: { x: number; y: number }[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function validPixelQuad(points: { x: number; y: number }[], w: number, h: number) {
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  const area = quadArea(points);
  if (area < w * h * 0.035 || area > w * h * 0.96) return false;
  const top = pointDistance(points[0], points[1]);
  const right = pointDistance(points[1], points[2]);
  const bottom = pointDistance(points[3], points[2]);
  const left = pointDistance(points[0], points[3]);
  if (Math.min(top, right, bottom, left) < Math.min(w, h) * 0.08) return false;
  const aspect = Math.max(top, bottom) / Math.max(1, Math.max(left, right));
  if (aspect < 0.32 || aspect > 3.6) return false;
  return true;
}

function normalizePixelQuad(points: { x: number; y: number }[], w: number, h: number): CardQuad {
  return [
    { x: clamp01(points[0].x / w), y: clamp01(points[0].y / h) },
    { x: clamp01(points[1].x / w), y: clamp01(points[1].y / h) },
    { x: clamp01(points[2].x / w), y: clamp01(points[2].y / h) },
    { x: clamp01(points[3].x / w), y: clamp01(points[3].y / h) },
  ];
}

function fallbackCornersFromMask(
  mask: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  let tl = { x: x0, y: y0, score: Infinity };
  let tr = { x: x1, y: y0, score: -Infinity };
  let br = { x: x1, y: y1, score: -Infinity };
  let bl = { x: x0, y: y1, score: -Infinity };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!mask[y * w + x]) continue;
      const sum = x + y;
      const diff = x - y;
      const anti = y - x;
      if (sum < tl.score) tl = { x, y, score: sum };
      if (diff > tr.score) tr = { x, y, score: diff };
      if (sum > br.score) br = { x, y, score: sum };
      if (anti > bl.score) bl = { x, y, score: anti };
    }
  }
  return [tl, tr, br, bl].map(({ x, y }) => ({ x, y }));
}

// 단일 사진에서 명함의 네 모서리를 추정. 실패하면 null 을 반환하고 기존 수동 조절로 폴백한다.
export function autoDetectCardQuad(img: HTMLImageElement): CardQuad | null {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (!W || !H) return null;
  const scale = Math.min(1, 480 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }

  let br = 0, bg = 0, bb = 0, n = 0;
  const borderDistances: number[] = [];
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    br += data[i]; bg += data[i + 1]; bb += data[i + 2]; n += 1;
  };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 0; y < h; y++) { add(0, y); add(w - 1, y); }
  br /= n; bg /= n; bb /= n;
  const addDistance = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb;
    borderDistances.push(Math.sqrt(dr * dr + dg * dg + db * db));
  };
  for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 80))) {
    addDistance(x, 0);
    addDistance(x, h - 1);
  }
  for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 80))) {
    addDistance(0, y);
    addDistance(w - 1, y);
  }
  const borderMean = borderDistances.reduce((a, b) => a + b, 0) / Math.max(1, borderDistances.length);
  const borderVar =
    borderDistances.reduce((a, b) => a + (b - borderMean) * (b - borderMean), 0) /
    Math.max(1, borderDistances.length);
  const threshold = Math.max(30, Math.min(76, borderMean + Math.sqrt(borderVar) * 2.2 + 18));

  const raw = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb;
      raw[y * w + x] = dr * dr + dg * dg + db * db > threshold * threshold ? 1 : 0;
    }
  }
  const mask = erodeMask(dilateMask(dilateMask(raw, w, h), w, h), w, h);

  const fgRow = new Array(h).fill(0);
  const fgCol = new Array(w).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      fgRow[y] += 1;
      fgCol[x] += 1;
    }
  }
  const rowMin = Math.max(3, Math.round(w * 0.06));
  const colMin = Math.max(3, Math.round(h * 0.06));
  let y0 = 0; while (y0 < h && fgRow[y0] < rowMin) y0++;
  let y1 = h - 1; while (y1 > y0 && fgRow[y1] < rowMin) y1--;
  let x0 = 0; while (x0 < w && fgCol[x0] < colMin) x0++;
  let x1 = w - 1; while (x1 > x0 && fgCol[x1] < colMin) x1--;
  if (x1 <= x0 || y1 <= y0) return null;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bw * bh < w * h * 0.035 || bw * bh > w * h * 0.96) return null;

  const leftPts: { x: number; y: number }[] = [];
  const rightPts: { x: number; y: number }[] = [];
  const topPts: { x: number; y: number }[] = [];
  const bottomPts: { x: number; y: number }[] = [];
  const rowNeed = Math.max(4, Math.round(bw * 0.28));
  const colNeed = Math.max(4, Math.round(bh * 0.28));

  for (let y = y0; y <= y1; y++) {
    let first = -1, last = -1, count = 0;
    for (let x = x0; x <= x1; x++) {
      if (!mask[y * w + x]) continue;
      if (first < 0) first = x;
      last = x;
      count++;
    }
    if (count >= rowNeed && first >= 0 && last >= 0) {
      leftPts.push({ x: first, y });
      rightPts.push({ x: last, y });
    }
  }
  for (let x = x0; x <= x1; x++) {
    let first = -1, last = -1, count = 0;
    for (let y = y0; y <= y1; y++) {
      if (!mask[y * w + x]) continue;
      if (first < 0) first = y;
      last = y;
      count++;
    }
    if (count >= colNeed && first >= 0 && last >= 0) {
      topPts.push({ x, y: first });
      bottomPts.push({ x, y: last });
    }
  }

  const left = fitXFromY(leftPts);
  const right = fitXFromY(rightPts);
  const top = fitYFromX(topPts);
  const bottom = fitYFromX(bottomPts);
  if (left && right && top && bottom) {
    const tl = intersectXFromYAndYFromX(left, top);
    const tr = intersectXFromYAndYFromX(right, top);
    const br = intersectXFromYAndYFromX(right, bottom);
    const bl = intersectXFromYAndYFromX(left, bottom);
    if (tl && tr && br && bl) {
      const quad = [tl, tr, br, bl];
      if (validPixelQuad(quad, w, h)) return normalizePixelQuad(quad, w, h);
    }
  }

  const fallback = fallbackCornersFromMask(mask, w, h, x0, y0, x1, y1);
  if (validPixelQuad(fallback, w, h)) return normalizePixelQuad(fallback, w, h);

  const padX = bw * 0.015;
  const padY = bh * 0.015;
  return bboxToQuad([
    Math.max(0, (x0 - padX) / w),
    Math.max(0, (y0 - padY) / h),
    Math.min(1, (x1 + padX) / w),
    Math.min(1, (y1 + padY) / h),
  ]);
}

// 배경과 명함을 구분해 카드가 차지하는 사각형 영역을 자동 추정 → [x0,y0,x1,y1] (0~1).
// 명함을 비교적 단색 배경(책상 등) 위에 찍었을 때 잘 동작. 애매하면 null(수동 크롭).
export function autoDetectCardBBox(
  img: HTMLImageElement,
): [number, number, number, number] | null {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (!W || !H) return null;
  const scale = Math.min(1, 320 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }

  // 배경색 추정: 네 변(테두리) 픽셀 평균
  let br = 0, bg = 0, bb = 0, n = 0;
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    br += data[i]; bg += data[i + 1]; bb += data[i + 2]; n += 1;
  };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 0; y < h; y++) { add(0, y); add(w - 1, y); }
  br /= n; bg /= n; bb /= n;

  // 배경과의 색 거리로 전경(명함) 마스크 → 행·열별 전경 픽셀 수
  const TH = 42;
  const fgRow = new Array(h).fill(0);
  const fgCol = new Array(w).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb;
      if (dr * dr + dg * dg + db * db > TH * TH) { fgRow[y] += 1; fgCol[x] += 1; }
    }
  }
  const rowMin = Math.max(2, Math.round(w * 0.06));
  const colMin = Math.max(2, Math.round(h * 0.06));
  let y0 = 0; while (y0 < h && fgRow[y0] < rowMin) y0++;
  let y1 = h - 1; while (y1 > y0 && fgRow[y1] < rowMin) y1--;
  let x0 = 0; while (x0 < w && fgCol[x0] < colMin) x0++;
  let x1 = w - 1; while (x1 > x0 && fgCol[x1] < colMin) x1--;
  if (x1 <= x0 || y1 <= y0) return null;

  const padX = w * 0.012, padY = h * 0.012;
  const nx0 = Math.max(0, (x0 - padX) / w);
  const ny0 = Math.max(0, (y0 - padY) / h);
  const nx1 = Math.min(1, (x1 + padX) / w);
  const ny1 = Math.min(1, (y1 + padY) / h);
  const aw = nx1 - nx0, ah = ny1 - ny0;
  if (aw < 0.12 || ah < 0.12) return null; // 너무 작음 → 오검출
  if (aw > 0.985 && ah > 0.985) return null; // 사실상 전체 → 의미 없음
  return [nx0, ny0, nx1, ny1];
}

// 시트(여러 명함이 한 장에)에서 개별 명함 영역들을 글자(엣지) 밀도로 추정.
// 카드/배경 색 대비와 무관 — 글자가 있는 카드면 잡힘. 반환: 정규화 bbox 배열(위→아래, 좌→우).
export function detectCardRegions(
  img: HTMLImageElement,
  maxCards = 12,
): [number, number, number, number][] {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (!W || !H) return [];
  const scale = Math.min(1, 640 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return [];
  }

  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // 엣지 에너지를 셀 그리드에 집계
  const cell = 10;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const energy = new Float32Array(cols * rows);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx = Math.abs(gray[idx + 1] - gray[idx - 1]);
      const gy = Math.abs(gray[idx + w] - gray[idx - w]);
      if (gx + gy > 30) energy[Math.floor(y / cell) * cols + Math.floor(x / cell)] += 1;
    }
  }
  const minPix = cell * cell * 0.05;
  const content = new Uint8Array(cols * rows);
  for (let i = 0; i < energy.length; i++) content[i] = energy[i] >= minPix ? 1 : 0;

  // 1셀 팽창 (카드 내부 텍스트 사이 간격 잇기)
  const dil = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (content[r * cols + c]) { dil[r * cols + c] = 1; continue; }
      let any = false;
      for (let dr = -1; dr <= 1 && !any; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && content[rr * cols + cc]) { any = true; break; }
        }
      }
      dil[r * cols + c] = any ? 1 : 0;
    }
  }

  // 연결요소 → 카드 후보
  const label = new Int32Array(cols * rows).fill(-1);
  const comps: { minc: number; minr: number; maxc: number; maxr: number; n: number }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < cols * rows; start++) {
    if (!dil[start] || label[start] >= 0) continue;
    const id = comps.length;
    label[start] = id;
    stack.length = 0;
    stack.push(start);
    let minc = cols, minr = rows, maxc = 0, maxr = 0, n = 0;
    while (stack.length) {
      const cur = stack.pop() as number;
      const cr = Math.floor(cur / cols), cc = cur % cols;
      n++;
      if (cc < minc) minc = cc;
      if (cc > maxc) maxc = cc;
      if (cr < minr) minr = cr;
      if (cr > maxr) maxr = cr;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = cr + dr, ccc = cc + dc;
          if (rr < 0 || rr >= rows || ccc < 0 || ccc >= cols) continue;
          const ni = rr * cols + ccc;
          if (dil[ni] && label[ni] < 0) { label[ni] = id; stack.push(ni); }
        }
      }
    }
    comps.push({ minc, minr, maxc, maxr, n });
  }

  const gridArea = cols * rows;
  return comps
    .filter((c) => {
      const bw = c.maxc - c.minc + 1;
      const bh = c.maxr - c.minr + 1;
      const area = bw * bh;
      if (c.n < 5) return false;
      if (area < gridArea * 0.012) return false; // 너무 작음
      if (area > gridArea * 0.82) return false; // 거의 전체
      const ar = bw / bh;
      if (ar < 0.22 || ar > 4.5) return false; // 카드 비율 벗어남
      if (c.n / area < 0.32) return false; // 성긴 잡음
      return true;
    })
    .map((c) => {
      const x0 = (c.minc * cell) / w;
      const y0 = (c.minr * cell) / h;
      const x1 = Math.min(1, ((c.maxc + 1) * cell) / w);
      const y1 = Math.min(1, ((c.maxr + 1) * cell) / h);
      const px = (x1 - x0) * 0.06, py = (y1 - y0) * 0.06;
      return [
        Math.max(0, x0 - px), Math.max(0, y0 - py),
        Math.min(1, x1 + px), Math.min(1, y1 + py),
      ] as [number, number, number, number];
    })
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .slice(0, maxCards);
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
