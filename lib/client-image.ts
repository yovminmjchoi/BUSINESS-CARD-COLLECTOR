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
  const cell = 8;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const energy = new Float32Array(cols * rows);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx = Math.abs(gray[idx + 1] - gray[idx - 1]);
      const gy = Math.abs(gray[idx + w] - gray[idx - w]);
      if (gx + gy > 36) energy[Math.floor(y / cell) * cols + Math.floor(x / cell)] += 1;
    }
  }
  const minPix = cell * cell * 0.06;
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
      if (c.n < 6) return false;
      if (area < gridArea * 0.015) return false; // 너무 작음
      if (area > gridArea * 0.75) return false; // 거의 전체
      const ar = bw / bh;
      if (ar < 0.25 || ar > 4) return false; // 카드 비율 벗어남
      if (c.n / area < 0.35) return false; // 성긴 잡음
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
