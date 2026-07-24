"use client";

import { useEffect, useRef, useState } from "react";
import {
  applyDocFilter,
  autoDetectCardBBox,
  autoDetectCardQuad,
  bboxToQuad,
  canvasToJpeg,
  cropQuadToCanvas,
  rotate90,
  type CardQuad,
} from "@/lib/client-image";

// AI 가 감지한 명함 영역 [x0,y0,x1,y1] (0~1). 도착하면 크롭 영역을 자동으로 맞춤.
export interface SuggestedBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type FilterMode = "none" | "color" | "doc";
const FILTERS: { id: FilterMode; label: string; css: string }[] = [
  { id: "none", label: "원본", css: "none" },
  { id: "color", label: "선명", css: "contrast(1.2) saturate(1.35) brightness(1.05)" },
  { id: "doc", label: "흑백 문서", css: "grayscale(1) brightness(1.18) contrast(1.8)" },
];

const DEFAULT_QUAD: CardQuad = [
  { x: 0.04, y: 0.04 },
  { x: 0.96, y: 0.04 },
  { x: 0.96, y: 0.96 },
  { x: 0.04, y: 0.96 },
];

const CORNER_LABELS = ["왼쪽 위", "오른쪽 위", "오른쪽 아래", "왼쪽 아래"];

function cloneQuad(quad: CardQuad): CardQuad {
  return quad.map((p) => ({ ...p })) as CardQuad;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function suggestedToQuad(suggested: SuggestedBox): CardQuad {
  const x0 = Math.max(0, suggested.x0 - 0.03);
  const y0 = Math.max(0, suggested.y0 - 0.03);
  const x1 = Math.min(1, suggested.x1 + 0.03);
  const y1 = Math.min(1, suggested.y1 + 0.03);
  return bboxToQuad([x0, y0, x1, y1]);
}

// 전체 화면 크롭 오버레이. 네 모서리를 잡아 기울어진 명함을 반듯하게 펴서 저장한다.
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
  const [quad, setQuad] = useState<CardQuad>(() => cloneQuad(DEFAULT_QUAD));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("none");
  const [autoMsg, setAutoMsg] = useState("");
  const touchedRef = useRef(false);
  const autoTriedRef = useRef(false);
  const autoAppliedRef = useRef(false);
  const ignoreSuggestedRef = useRef(false);

  const filterCss = FILTERS.find((f) => f.id === filter)?.css ?? "none";
  const polygon = quad.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");

  useEffect(() => {
    setDisplaySrc(src);
    setQuad(cloneQuad(DEFAULT_QUAD));
    setAutoMsg("");
    touchedRef.current = false;
    autoTriedRef.current = false;
    autoAppliedRef.current = false;
    ignoreSuggestedRef.current = false;
  }, [src]);

  useEffect(() => {
    if (!suggested || touchedRef.current || autoAppliedRef.current || ignoreSuggestedRef.current) return;
    setQuad(suggestedToQuad(suggested));
  }, [suggested]);

  function applyDetected(markTouched: boolean) {
    const img = imgRef.current;
    if (!img) return false;
    const detected = autoDetectCardQuad(img);
    if (detected) {
      setQuad(detected);
      autoAppliedRef.current = true;
      if (markTouched) touchedRef.current = true;
      return true;
    }
    const box = autoDetectCardBBox(img);
    if (box) {
      setQuad(bboxToQuad(box));
      autoAppliedRef.current = true;
      if (markTouched) touchedRef.current = true;
      return true;
    }
    return false;
  }

  function runAutoDetect() {
    if (applyDetected(true)) {
      setAutoMsg("");
    } else {
      setAutoMsg("자동 감지가 애매해요. 모서리 점을 손으로 맞춰주세요.");
      setTimeout(() => setAutoMsg(""), 2500);
    }
  }

  function handleImgLoad() {
    if (autoTriedRef.current || touchedRef.current) return;
    autoTriedRef.current = true;
    if (!applyDetected(false) && suggested && !ignoreSuggestedRef.current) {
      setQuad(suggestedToQuad(suggested));
    }
  }

  async function rotate() {
    setBusy(true);
    try {
      const rotated = await rotate90(displaySrc);
      setDisplaySrc(rotated);
      setQuad(cloneQuad(DEFAULT_QUAD));
      touchedRef.current = false;
      autoTriedRef.current = false;
      autoAppliedRef.current = false;
      ignoreSuggestedRef.current = true;
    } finally {
      setBusy(false);
    }
  }

  function movePoint(index: number, clientX: number, clientY: number) {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp01((clientX - rect.left) / rect.width);
    const y = clamp01((clientY - rect.top) / rect.height);
    setQuad((cur) => cur.map((p, i) => (i === index ? { x, y } : p)) as CardQuad);
    touchedRef.current = true;
  }

  useEffect(() => {
    if (dragIndex === null) return;
    const onMove = (event: PointerEvent) => {
      event.preventDefault();
      movePoint(dragIndex, event.clientX, event.clientY);
    };
    const onUp = () => setDragIndex(null);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragIndex]);

  function nudgePoint(index: number, dx: number, dy: number) {
    setQuad((cur) =>
      cur.map((p, i) =>
        i === index ? { x: clamp01(p.x + dx), y: clamp01(p.y + dy) } : p,
      ) as CardQuad,
    );
    touchedRef.current = true;
  }

  async function apply() {
    const img = imgRef.current;
    if (!img) return;
    setBusy(true);
    try {
      const canvas = cropQuadToCanvas(img, quad);
      applyDocFilter(canvas, filter);
      onApply(await canvasToJpeg(canvas));
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between gap-2 p-4 text-white">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {suggested ? "명함 영역 자동 감지됨 · 필요하면 조절" : "명함 모서리를 맞추세요"}
        </span>
        <button
          type="button"
          onClick={runAutoDetect}
          disabled={busy}
          className="flex-shrink-0 rounded-lg border border-white/40 px-3 py-1 text-sm disabled:opacity-50"
        >
          자동 맞춤
        </button>
        <button
          type="button"
          onClick={rotate}
          disabled={busy}
          className="flex-shrink-0 rounded-lg border border-white/40 px-3 py-1 text-sm disabled:opacity-50"
        >
          회전
        </button>
      </div>
      {autoMsg && (
        <div className="px-4 pb-1 text-center text-xs text-amber-300">{autoMsg}</div>
      )}

      <div className="flex flex-1 items-center justify-center overflow-hidden p-2">
        <div className="relative inline-block max-h-[70vh] max-w-full touch-none select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={displaySrc}
            alt="크롭 대상"
            draggable={false}
            onLoad={handleImgLoad}
            className="block max-h-[70vh] w-auto max-w-full"
            style={{ filter: filterCss }}
          />
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polygon points={polygon} fill="rgba(37,99,235,0.16)" stroke="white" strokeWidth="0.7" />
            <polyline points={`${polygon} ${quad[0].x * 100},${quad[0].y * 100}`} fill="none" stroke="#2563eb" strokeWidth="0.9" />
          </svg>
          {quad.map((p, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${CORNER_LABELS[i]} 모서리`}
              onPointerDown={(event) => {
                event.preventDefault();
                setDragIndex(i);
                movePoint(i, event.clientX, event.clientY);
              }}
              onKeyDown={(event) => {
                const amount = event.shiftKey ? 0.025 : 0.008;
                if (event.key === "ArrowLeft") nudgePoint(i, -amount, 0);
                if (event.key === "ArrowRight") nudgePoint(i, amount, 0);
                if (event.key === "ArrowUp") nudgePoint(i, 0, -amount);
                if (event.key === "ArrowDown") nudgePoint(i, 0, amount);
              }}
              className="absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow-lg outline-none ring-blue-300 focus:ring-4"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            />
          ))}
        </div>
      </div>

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
          {busy ? "처리 중..." : "크롭 적용"}
        </button>
      </div>
    </div>
  );
}
