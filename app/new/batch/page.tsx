"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CameraCapture from "@/components/CameraCapture";
import ImageCropper, { type SuggestedBox } from "@/components/ImageCropper";
import { pickUnusedColor, type Tag } from "@/components/TagSelector";
import { downscale, loadImage, cropBboxToBlob } from "@/lib/client-image";
import type { CardExtraction } from "@/lib/gemini";

interface Item {
  extraction: CardExtraction;
  blob: Blob;
  url: string;
  include: boolean;
  tagIds: string[];
  backBlob?: Blob; // 이 명함의 뒷면(선택) — 저장 시 함께 업로드
  backUrl?: string;
  backBusy?: boolean; // 뒷면 인식 중
  backFilled?: number; // 뒷면으로 채운 빈 칸 수
}

function displayName(e: CardExtraction): string {
  const ko = [e.family_name_ko, e.given_name_ko].filter(Boolean).join("");
  const en = [e.given_name_en, e.family_name_en].filter(Boolean).join(" ");
  return ko || en || e.name_ko || e.name_en || "(이름 없음)";
}

// 뒷면 추출 결과로 빈 칸만 채움 (앞면·사용자 값 보존)
const MERGE_FIELDS: (keyof CardExtraction)[] = [
  "name_ko", "name_en",
  "family_name_ko", "given_name_ko", "family_name_en", "given_name_en",
  "company_ko", "company_en", "department", "title_ko", "title_en",
  "mobile", "office_phone", "fax", "email", "website", "address_ko", "address_en",
];

function mergeEmpty(base: CardExtraction, extra: CardExtraction): { merged: CardExtraction; filled: number } {
  const merged = { ...base };
  let filled = 0;
  for (const f of MERGE_FIELDS) {
    const cur = merged[f];
    const add = extra[f];
    if ((cur === null || cur === "" || cur === undefined) && typeof add === "string" && add.trim() !== "") {
      // @ts-expect-error 문자열 필드에만 대입
      merged[f] = add.trim();
      filled += 1;
    }
  }
  return { merged, filled };
}

export default function BatchNewPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"capture" | "processing" | "review">("capture");
  const [items, setItems] = useState<Item[]>([]);
  const [tagList, setTagList] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState("");
  const scanImgRef = useRef<HTMLImageElement | null>(null);
  const backInputRef = useRef<HTMLInputElement | null>(null);
  const backTargetRef = useRef<number | null>(null);
  const [crop, setCrop] = useState<{ idx: number; src: string; suggested: SuggestedBox | null } | null>(null);
  const [backCrop, setBackCrop] = useState<{ idx: number; src: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/tags").then((r) => r.json()).then((d) => setTagList(d.tags ?? [])).catch(() => {});
  }, []);

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
          return { extraction: e, blob, url: URL.createObjectURL(blob), include: true, tagIds: [] };
        }),
      );
      setItems(built);
      setPhase("review");

      // 각 명함의 회사로 기존 태그 자동 제안 (명함별)
      built.forEach((it, i) => {
        const e = it.extraction;
        if (!(e.company_ko || e.company_en)) return;
        fetch("/api/company-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyKo: e.company_ko, companyEn: e.company_en }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (Array.isArray(d.tagIds) && d.tagIds.length > 0) {
              setItems((arr) => arr.map((x, idx) => (idx === i ? { ...x, tagIds: d.tagIds } : x)));
            }
          })
          .catch(() => {});
      });
    } catch {
      setError("처리 중 오류가 발생했습니다. 다시 시도하세요.");
      setPhase("capture");
    }
  }

  async function createTag() {
    const name = newTag.trim();
    if (!name) return;
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: pickUnusedColor(tagList.map((t) => t.color)) }),
    });
    const d = await res.json();
    if (res.ok && d.tag) {
      setTagList((t) => [...t, d.tag]);
      setNewTag("");
    }
  }

  function toggleCardTag(i: number, tagId: string) {
    setItems((arr) =>
      arr.map((it, idx) =>
        idx === i
          ? { ...it, tagIds: it.tagIds.includes(tagId) ? it.tagIds.filter((x) => x !== tagId) : [...it.tagIds, tagId] }
          : it,
      ),
    );
  }

  // 포함된 명함 전체에 토글 (모두 갖고 있으면 해제, 아니면 추가)
  function applyAll(tagId: string) {
    setItems((arr) => {
      const included = arr.filter((x) => x.include);
      const allHave = included.length > 0 && included.every((x) => x.tagIds.includes(tagId));
      return arr.map((it) =>
        !it.include
          ? it
          : { ...it, tagIds: allHave ? it.tagIds.filter((x) => x !== tagId) : [...new Set([...it.tagIds, tagId])] },
      );
    });
  }

  // 이 명함의 뒷면 촬영/선택 → 추출 → 빈 칸 채우기
  function pickBack(i: number) {
    backTargetRef.current = i;
    backInputRef.current?.click();
  }

  // 뒷면 선택 → 축소 후 크롭 화면 먼저 (앞면과 동일하게 크롭·문서필터 거침)
  async function addBack(file: File) {
    const i = backTargetRef.current;
    backTargetRef.current = null;
    if (i === null) return;
    setError("");
    const small = await downscale(file);
    setBackCrop({ idx: i, src: URL.createObjectURL(small) });
  }

  function closeBackCrop() {
    if (backCrop) URL.revokeObjectURL(backCrop.src);
    setBackCrop(null);
  }

  // 크롭 적용된 뒷면 → 추출 → 빈 칸 채우기 + 저장용 blob 보관
  async function finishBack(blob: Blob) {
    if (!backCrop) return;
    const i = backCrop.idx;
    closeBackCrop();
    setItems((arr) => arr.map((x, idx) => (idx === i ? { ...x, backBusy: true } : x)));
    try {
      const bUrl = URL.createObjectURL(blob);
      // 뒷면 이미지 단독 추출 (보통 영문면)
      const form = new FormData();
      form.append("mode", "detect");
      form.append("front", new File([blob], "back.jpg", { type: "image/jpeg" }));
      form.append("front_cropped", "1");
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();
      const backEx = (data.extraction ?? null) as CardExtraction | null;
      setItems((arr) =>
        arr.map((x, idx) => {
          if (idx !== i) return x;
          if (x.backUrl) URL.revokeObjectURL(x.backUrl);
          const { merged, filled } = backEx
            ? mergeEmpty(x.extraction, backEx)
            : { merged: x.extraction, filled: 0 };
          return { ...x, extraction: merged, backBlob: blob, backUrl: bUrl, backBusy: false, backFilled: filled };
        }),
      );
    } catch {
      setItems((arr) => arr.map((x, idx) => (idx === i ? { ...x, backBusy: false } : x)));
      setError("뒷면 인식에 실패했어요. 다시 시도하세요.");
    }
  }

  async function openCrop(i: number) {
    const img = scanImgRef.current;
    if (!img) return;
    const bbox = items[i].extraction.card_bbox ?? [0, 0, 1, 1];
    const [x0, y0, x1, y1] = bbox;
    const cw = x1 - x0;
    const ch = y1 - y0;
    const mx = Math.min(0.25, cw * 0.25);
    const my = Math.min(0.45, ch * 0.9);
    const rx0 = Math.max(0, x0 - mx);
    const ry0 = Math.max(0, y0 - my);
    const rx1 = Math.min(1, x1 + mx);
    const ry1 = Math.min(1, y1 + my);
    const regionBlob = await cropBboxToBlob(img, [rx0, ry0, rx1, ry1]);
    const src = URL.createObjectURL(regionBlob);
    const rw = rx1 - rx0;
    const rh = ry1 - ry0;
    setCrop({
      idx: i,
      src,
      suggested: { x0: (x0 - rx0) / rw, y0: (y0 - ry0) / rh, x1: (x1 - rx0) / rw, y1: (y1 - ry0) / rh },
    });
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
        const storeForm = new FormData();
        storeForm.append("mode", "store");
        storeForm.append("front", new File([it.blob], "card.jpg", { type: "image/jpeg" }));
        storeForm.append("front_cropped", "1");
        if (it.backBlob) {
          storeForm.append("back", new File([it.backBlob], "back.jpg", { type: "image/jpeg" }));
        }
        const sres = await fetch("/api/extract", { method: "POST", body: storeForm });
        const sdata = await sres.json();
        if (!sres.ok) throw new Error(sdata.error ?? "이미지 저장 실패");

        const cres = await fetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            values: it.extraction,
            extraction: it.extraction,
            imageFrontPath: sdata.imageFrontPath,
            imageBackPath: sdata.imageBackPath ?? null,
            tagIds: it.tagIds,
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
          여러 명함이 한 이미지에 있으면 한 번에 인식해요. 명함마다 태그·뒷면을 따로 달 수 있어요.
        </p>
      </header>

      {phase === "capture" && <CameraCapture label="스캔 촬영" onSelect={handleScan} />}

      {phase === "processing" && (
        <div className="flex flex-col items-center gap-3 p-10 text-gray-500">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
          <p>명함들을 인식하는 중…</p>
        </div>
      )}

      {/* 뒷면 촬영/선택용 숨김 입력 (명함별 공용) */}
      <input
        ref={backInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) addBack(f);
          e.target.value = "";
        }}
      />

      {phase === "review" && (
        <>
          {/* 태그 만들기 + 전체 적용 */}
          <div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createTag()}
                placeholder="새 태그 만들기"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
              />
              <button type="button" onClick={createTag} disabled={!newTag.trim()} className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-40">
                추가
              </button>
            </div>
            {tagList.length > 0 && (
              <div>
                <span className="text-xs text-gray-400">전체 적용 (선택한 명함 모두):</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {tagList.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyAll(t.id)}
                      className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-600"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                  <img src={it.url} alt="" className="h-16 w-24 flex-shrink-0 rounded border border-gray-200 bg-gray-50 object-contain" />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium text-gray-900">{displayName(e)}</div>
                    {(company || title) && (
                      <div className="truncate text-gray-500">{[company, title].filter(Boolean).join(" · ")}</div>
                    )}
                    {contact && <div className="truncate text-xs text-gray-400">{contact}</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <button type="button" onClick={() => openCrop(i)} className="text-xs text-blue-600 underline">
                        사진 크롭
                      </button>
                      <button
                        type="button"
                        onClick={() => pickBack(i)}
                        disabled={it.backBusy}
                        className="text-xs text-blue-600 underline disabled:opacity-50"
                      >
                        {it.backBusy ? "뒷면 인식 중…" : it.backUrl ? "뒷면 다시" : "뒷면 추가"}
                      </button>
                      {it.backUrl && !it.backBusy && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.backUrl} alt="뒷면" className="h-8 w-12 rounded border border-gray-200 bg-gray-50 object-contain" />
                      )}
                    </div>
                    {typeof it.backFilled === "number" && !it.backBusy && (
                      <div className={"mt-0.5 text-[11px] " + (it.backFilled > 0 ? "text-green-600" : "text-gray-400")}>
                        {it.backFilled > 0 ? `뒷면에서 ${it.backFilled}칸 채움` : "뒷면에서 새로 채운 칸 없음"}
                      </div>
                    )}
                    {/* 이 명함의 태그 */}
                    {tagList.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {tagList.map((t) => {
                          const on = it.tagIds.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => toggleCardTag(i, t.id)}
                              className={"rounded-full border px-2 py-0.5 text-[11px] " + (on ? "text-white" : "text-gray-500")}
                              style={on ? { backgroundColor: t.color ?? "#374151", borderColor: t.color ?? "#374151" } : { borderColor: "#d1d5db" }}
                            >
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
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

      {backCrop && (
        <ImageCropper
          src={backCrop.src}
          onApply={finishBack}
          onCancel={closeBackCrop}
          cancelLabel="취소"
        />
      )}
    </main>
  );
}
