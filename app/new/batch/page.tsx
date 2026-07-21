"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Link from "next/link";
import CameraCapture from "@/components/CameraCapture";
import ImageCropper, { type SuggestedBox } from "@/components/ImageCropper";
import TagSelector from "@/components/TagSelector";
import { downscale, loadImage, cropBboxToBlob } from "@/lib/client-image";
import type { CardExtraction } from "@/lib/gemini";

interface Item {
  extraction: CardExtraction;
  blob: Blob;
  url: string;
  include: boolean;
}

function displayName(e: CardExtraction): string {
  const ko = [e.family_name_ko, e.given_name_ko].filter(Boolean).join("");
  const en = [e.given_name_en, e.family_name_en].filter(Boolean).join(" ");
  return ko || en || e.name_ko || e.name_en || "(이름 없음)";
}

export default function BatchNewPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"capture" | "processing" | "review">("capture");
  const [items, setItems] = useState<Item[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const scanImgRef = useRef<HTMLImageElement | null>(null);
  // 크롭 오버레이: 해당 명함 주변만 확대한 이미지 + 그 안에서의 명함 위치
  const [crop, setCrop] = useState<{ idx: number; src: string; suggested: SuggestedBox | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function handleScan(raw: File) {
    setPhase("processing");
    setError("");
    try {
      const small = await downscale(raw);
      const url = URL.createObjectURL(small);
      const img = await loadImage(url);
      scanImgRef.current = img;

      const form = new FormData();
      form.append("front", small);
      form.append("front_cropped", small.type === "image/jpeg" ? "1" : "0");
      const res = await fetch("/api/extract-multi", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "인식에 실패했습니다.");
        setPhase("capture");
        return;
      }
      const cards: CardExtraction[] = data.cards;
      const built: Item[] = await Promise.all(
        cards.map(async (e) => {
          const blob = e.card_bbox
            ? await cropBboxToBlob(img, e.card_bbox)
            : await cropBboxToBlob(img, [0, 0, 1, 1]);
          return { extraction: e, blob, url: URL.createObjectURL(blob), include: true };
        }),
      );
      setItems(built);
      setPhase("review");
    } catch {
      setError("처리 중 오류가 발생했습니다. 다시 시도하세요.");
      setPhase("capture");
    }
  }

  // 그 명함 주변만 확대해서 크롭 화면 열기 (전체 스캔은 너무 작아 정밀 크롭이 어려움)
  async function openCrop(i: number) {
    const img = scanImgRef.current;
    if (!img) return;
    const bbox = items[i].extraction.card_bbox ?? [0, 0, 1, 1];
    const [x0, y0, x1, y1] = bbox;
    const cw = x1 - x0;
    const ch = y1 - y0;
    // 명함 크기에 비례한 여유(위/아래 넉넉히) — 카드가 크게 보이면서 경계도 보이게
    const mx = Math.min(0.25, cw * 0.25);
    const my = Math.min(0.45, ch * 0.9);
    const rx0 = Math.max(0, x0 - mx);
    const ry0 = Math.max(0, y0 - my);
    const rx1 = Math.min(1, x1 + mx);
    const ry1 = Math.min(1, y1 + my);
    const regionBlob = await cropBboxToBlob(img, [rx0, ry0, rx1, ry1]);
    const src = URL.createObjectURL(regionBlob);
    // 확대 이미지 안에서의 명함 위치(제안 박스)
    const rw = rx1 - rx0;
    const rh = ry1 - ry0;
    const suggested: SuggestedBox = {
      x0: (x0 - rx0) / rw,
      y0: (y0 - ry0) / rh,
      x1: (x1 - rx0) / rw,
      y1: (y1 - ry0) / rh,
    };
    setCrop({ idx: i, src, suggested });
  }

  function closeCrop() {
    if (crop) URL.revokeObjectURL(crop.src);
    setCrop(null);
  }

  function applyCrop(blob: Blob) {
    if (!crop) return;
    const i = crop.idx;
    setItems((arr) =>
      arr.map((it, idx) => {
        if (idx !== i) return it;
        URL.revokeObjectURL(it.url);
        return { ...it, blob, url: URL.createObjectURL(blob) };
      }),
    );
    closeCrop();
  }

  async function saveAll() {
    setSaving(true);
    setError("");
    let done = 0;
    try {
      for (const it of items) {
        if (!it.include) continue;
        // 1) 크롭 이미지 저장
        const storeForm = new FormData();
        storeForm.append("mode", "store");
        storeForm.append("front", new File([it.blob], "card.jpg", { type: "image/jpeg" }));
        storeForm.append("front_cropped", "1");
        const sres = await fetch("/api/extract", { method: "POST", body: storeForm });
        const sdata = await sres.json();
        if (!sres.ok) throw new Error(sdata.error ?? "이미지 저장 실패");

        // 2) 카드 생성 (일괄 태그 적용)
        const cres = await fetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            values: it.extraction,
            extraction: it.extraction,
            imageFrontPath: sdata.imageFrontPath,
            imageBackPath: null,
            tagIds,
          }),
        });
        if (!cres.ok) {
          const d = await cres.json();
          throw new Error(d.error ?? "저장 실패");
        }
        done += 1;
        setProgress(done);
      }
      router.push(`/?done=batch&n=${done}`);
    } catch (e) {
      setError(`${done}개 저장 후 실패: ${e instanceof Error ? e.message : ""}`);
      setSaving(false);
    }
  }

  const selectedCount = items.filter((i) => i.include).length;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6 pb-28">
      <header>
        <Link href="/new" className="text-sm text-gray-500">← 한 장씩 촬영</Link>
        <h1 className="mt-2 text-xl font-bold">여러 명함 한 번에</h1>
        <p className="mt-1 text-sm text-gray-500">
          여러 명함이 한 이미지에 있으면 한 번에 인식해요. 각 명함을 잘라 개별로 저장합니다.
        </p>
      </header>

      {phase === "capture" && <CameraCapture label="스캔 촬영" onSelect={handleScan} />}

      {phase === "processing" && (
        <div className="flex flex-col items-center gap-3 p-10 text-gray-500">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
          <p>명함들을 인식하는 중…</p>
        </div>
      )}

      {phase === "review" && (
        <>
          <div className="rounded-lg border border-gray-200 p-3">
            <TagSelector value={tagIds} onChange={setTagIds} />
            <p className="mt-1 text-xs text-gray-400">선택한 태그가 저장하는 모든 명함에 적용됩니다.</p>
          </div>

          <p className="text-sm font-medium text-gray-700">인식된 명함 {items.length}장</p>
          <ul className="flex flex-col gap-2">
            {items.map((it, i) => {
              const e = it.extraction;
              const company = e.company_ko || e.company_en || "";
              const title = e.title_ko || e.title_en || "";
              const contact = e.mobile || e.email || "";
              return (
                <li
                  key={i}
                  className={
                    "flex gap-3 rounded-lg border p-2 " +
                    (it.include ? "border-blue-300 bg-blue-50/40" : "border-gray-200 opacity-50")
                  }
                >
                  <button
                    type="button"
                    onClick={() => setItems((a) => a.map((x, idx) => (idx === i ? { ...x, include: !x.include } : x)))}
                    className={
                      "mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[11px] " +
                      (it.include ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-transparent")
                    }
                  >
                    ✓
                  </button>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.url} alt="" className="h-16 w-24 flex-shrink-0 rounded border border-gray-200 object-cover" />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium text-gray-900">{displayName(e)}</div>
                    {(company || title) && (
                      <div className="truncate text-gray-500">{[company, title].filter(Boolean).join(" · ")}</div>
                    )}
                    {contact && <div className="truncate text-xs text-gray-400">{contact}</div>}
                    <button
                      type="button"
                      onClick={() => openCrop(i)}
                      className="mt-1 text-xs text-blue-600 underline"
                    >
                      사진 크롭
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {phase === "review" && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-gray-200 bg-white p-4">
          <button
            type="button"
            onClick={saveAll}
            disabled={saving || selectedCount === 0}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-40"
          >
            {saving ? `저장 중… (${progress}/${selectedCount})` : `${selectedCount}개 저장`}
          </button>
        </div>
      )}

      {crop && (
        <ImageCropper
          src={crop.src}
          suggested={crop.suggested}
          onApply={applyCrop}
          onCancel={closeCrop}
          cancelLabel="취소"
        />
      )}
    </main>
  );
}
