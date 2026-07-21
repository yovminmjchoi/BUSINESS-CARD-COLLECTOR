"use client";

import { useEffect, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import { canvasToJpeg } from "@/lib/client-image";

// AI 가 감지한 명함 영역 [x0,y0,x1,y1] (0~1). 도착하면 크롭 박스를 자동으로 맞춤.
export interface SuggestedBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

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
  const [crop, setCrop] = useState<Crop>({
    unit: "%",
    x: 4,
    y: 4,
    width: 92,
    height: 92,
  });
  const [pixelCrop, setPixelCrop] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const touchedRef = useRef(false); // 사용자가 박스를 만졌는지

  // AI 감지 박스 도착 시, 사용자가 아직 안 만졌으면 자동 스냅 (여유 3%)
  useEffect(() => {
    if (!suggested || touchedRef.current) return;
    const M = 0.03;
    const x = Math.max(0, suggested.x0 - M) * 100;
    const y = Math.max(0, suggested.y0 - M) * 100;
    const x1 = Math.min(1, suggested.x1 + M) * 100;
    const y1 = Math.min(1, suggested.y1 + M) * 100;
    setCrop({ unit: "%", x, y, width: Math.max(5, x1 - x), height: Math.max(5, y1 - y) });
    setPixelCrop(null);
  }, [suggested]);

  async function apply() {
    const img = imgRef.current;
    if (!img) return;
    setBusy(true);
    try {
      // 표시 크기 → 원본 픽셀 비율 환산
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      const pc = pixelCrop ?? {
        x: 0, y: 0, width: img.width, height: img.height, unit: "px" as const,
      };
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(pc.width * scaleX));
      canvas.height = Math.max(1, Math.round(pc.height * scaleY));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(
        img,
        pc.x * scaleX, pc.y * scaleY, pc.width * scaleX, pc.height * scaleY,
        0, 0, canvas.width, canvas.height,
      );
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
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden p-2">
        <ReactCrop
          crop={crop}
          onChange={(c) => {
            touchedRef.current = true;
            setCrop(c);
          }}
          onComplete={(c) => setPixelCrop(c)}
          keepSelection
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt="크롭 대상"
            className="max-h-[70vh] w-auto max-w-full"
          />
        </ReactCrop>
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
