"use client";

import { useEffect, useRef, useState } from "react";
import ReactCrop, { type Crop } from "react-image-crop";
import { canvasToJpeg, rotate90 } from "@/lib/client-image";

// AI 가 감지한 명함 영역 [x0,y0,x1,y1] (0~1). 도착하면 크롭 박스를 자동으로 맞춤.
export interface SuggestedBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// 문서 스캔 정리 필터 — 오래되고 얼룩진 명함을 깔끔하게.
// CSS 필터 문자열은 미리보기(<img>)와 최종 캔버스(ctx.filter)에 동일 적용 → WYSIWYG.
type FilterMode = "none" | "color" | "doc";
const FILTERS: { id: FilterMode; label: string; css: string }[] = [
  { id: "none", label: "원본", css: "none" },
  { id: "color", label: "선명", css: "contrast(1.2) saturate(1.35) brightness(1.05)" },
  { id: "doc", label: "흑백 문서", css: "grayscale(1) brightness(1.18) contrast(1.8)" },
];

// 전체 화면 크롭 오버레이. 모서리/변 드래그로 영역 조절 (스캔 앱 스타일).
export default function ImageCropper({
  src,
  suggested,
  onApply,
  onCancel,
  cancelLabel = "취소",
}: {
  src: string;
  suggested?: SuggestedBox | null;
  onApply: (cropped: Blob) => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [displaySrc, setDisplaySrc] = useState(src);
  const [crop, setCrop] = useState<Crop>({
    unit: "%",
    x: 4,
    y: 4,
    width: 92,
    height: 92,
  });
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("none");
  const touchedRef = useRef(false); // 사용자가 박스를 만졌는지

  const filterCss = FILTERS.find((f) => f.id === filter)?.css ?? "none";

  async function rotate() {
    setBusy(true);
    try {
      const rotated = await rotate90(displaySrc);
      setDisplaySrc(rotated);
      touchedRef.current = true; // 회전 후엔 자동 제안 박스 무시
      setCrop({ unit: "%", x: 4, y: 4, width: 92, height: 92 });
    } finally {
      setBusy(false);
    }
  }

  // AI 감지 박스 도착 시, 사용자가 아직 안 만졌으면 자동 스냅 (여유 3%)
  useEffect(() => {
    if (!suggested || touchedRef.current) return;
    const M = 0.03;
    const x = Math.max(0, suggested.x0 - M) * 100;
    const y = Math.max(0, suggested.y0 - M) * 100;
    const x1 = Math.min(1, suggested.x1 + M) * 100;
    const y1 = Math.min(1, suggested.y1 + M) * 100;
    setCrop({ unit: "%", x, y, width: Math.max(5, x1 - x), height: Math.max(5, y1 - y) });
  }, [suggested]);

  async function apply() {
    const img = imgRef.current;
    if (!img) return;
    setBusy(true);
    try {
      const nW = img.naturalWidth;
      const nH = img.naturalHeight;
      // 현재 크롭 박스(crop)를 원본 픽셀로 환산 (단위 %/px 모두 대응)
      let sx: number, sy: number, sw: number, sh: number;
      if (crop.unit === "%") {
        sx = (crop.x / 100) * nW;
        sy = (crop.y / 100) * nH;
        sw = (crop.width / 100) * nW;
        sh = (crop.height / 100) * nH;
      } else {
        const kx = nW / img.width;
        const ky = nH / img.height;
        sx = crop.x * kx;
        sy = crop.y * ky;
        sw = crop.width * kx;
        sh = crop.height * ky;
      }
      if (sw < 1 || sh < 1) {
        sx = 0; sy = 0; sw = nW; sh = nH; // 박스가 없으면 전체
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      // 문서 정리 필터를 결과에 굽기 (미리보기와 동일). 미지원 브라우저면 원본.
      if (filterCss !== "none" && "filter" in ctx) ctx.filter = filterCss;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      onApply(await canvasToJpeg(canvas));
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="text-sm font-medium">
          {suggested ? "명함 영역 자동 감지됨 · 필요하면 조절" : "명함 영역을 맞추세요"}
        </span>
        <button
          type="button"
          onClick={rotate}
          disabled={busy}
          className="rounded-lg border border-white/40 px-3 py-1 text-sm disabled:opacity-50"
        >
          ↻ 회전
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden p-2">
        <ReactCrop
          crop={crop}
          onChange={(c) => {
            touchedRef.current = true;
            setCrop(c);
          }}
          keepSelection
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={displaySrc}
            alt="크롭 대상"
            className="max-h-[70vh] w-auto max-w-full"
            style={{ filter: filterCss }}
          />
        </ReactCrop>
      </div>

      {/* 문서 정리 필터 선택 */}
      <div className="flex justify-center gap-2 px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={
              "rounded-full px-3 py-1 text-sm " +
              (filter === f.id
                ? "bg-white font-medium text-gray-900"
                : "border border-white/40 text-white")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 p-4 pb-8">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex-1 rounded-lg border border-white/40 px-4 py-3 text-base text-white disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={busy}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {busy ? "처리 중…" : "크롭 적용"}
        </button>
      </div>
    </div>
  );
}
