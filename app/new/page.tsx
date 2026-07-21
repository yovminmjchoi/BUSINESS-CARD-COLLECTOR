"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import ImageCropper, { type SuggestedBox } from "@/components/ImageCropper";
import { downscale } from "@/lib/client-image";
import type { CardExtraction } from "@/lib/gemini";

type Side = "front" | "back";

// 이미 JPEG(축소/크롭)면 서버 재인코딩 생략 플래그
function ready(file: File) {
  return file.type === "image/jpeg" ? "1" : "0";
}

export default function NewCardPage() {
  const router = useRouter();
  // 확정된(크롭 완료) 이미지
  const [frontFull, setFrontFull] = useState<File | null>(null);
  const [frontCropped, setFrontCropped] = useState<File | null>(null);
  const [backCropped, setBackCropped] = useState<File | null>(null);
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);

  // 크롭 오버레이 대상
  const [crop, setCrop] = useState<{ side: Side; url: string; full: File } | null>(null);
  const [suggested, setSuggested] = useState<SuggestedBox | null>(null);
  const [extraction, setExtraction] = useState<CardExtraction | null>(null);

  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/extract").catch(() => {}); // 워밍업
  }, []);

  // 사진 선택/촬영 → 축소 → 크롭 오버레이 열고, 앞면이면 백그라운드 감지(bbox+추출)
  async function pick(side: Side, raw: File) {
    setError("");
    const small = await downscale(raw);
    setCrop({ side, url: URL.createObjectURL(small), full: small });
    if (side === "front") {
      setFrontFull(small);
      setSuggested(null);
      detect(small, null);
    }
  }

  // AI 감지: bbox → 크롭 박스 자동 맞춤, 추출 결과는 확인 화면으로
  async function detect(f: File, b: File | null) {
    const form = new FormData();
    form.append("mode", "detect");
    form.append("front", f);
    form.append("front_cropped", ready(f));
    if (b) form.append("back", b);
    try {
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();
      if (data.extraction) {
        setExtraction(data.extraction);
        const bb = data.extraction.card_bbox as [number, number, number, number] | null;
        if (bb) setSuggested({ x0: bb[0], y0: bb[1], x1: bb[2], y1: bb[3] });
      }
    } catch {
      /* 감지 실패는 무시 — 수동 크롭 가능 */
    }
  }

  function applyCrop(blob: Blob) {
    if (!crop) return;
    const file = new File([blob], "card.jpg", { type: "image/jpeg" });
    const url = URL.createObjectURL(file);
    if (crop.side === "front") {
      if (frontUrl) URL.revokeObjectURL(frontUrl);
      setFrontCropped(file);
      setFrontUrl(url);
    } else {
      if (backUrl) URL.revokeObjectURL(backUrl);
      setBackCropped(file);
      setBackUrl(url);
      // 뒷면 추가 → 앞+뒤 합쳐 재감지(내용 통합)
      if (frontFull) detect(frontFull, file);
    }
    URL.revokeObjectURL(crop.url);
    setCrop(null);
  }

  // 저장: 크롭된 이미지 업로드 + (감지에서 받은) 추출 결과로 확인 화면 이동
  async function handleSave() {
    if (!frontCropped) return;
    setStatus("saving");
    setError("");
    const form = new FormData();
    // 감지가 이미 끝났으면 저장만(빠름). 아직이면 이 요청에서 추출까지(중복 호출 방지).
    form.append("mode", extraction ? "store" : "");
    form.append("front", frontCropped);
    form.append("front_cropped", "1");
    if (backCropped) form.append("back", backCropped);
    try {
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok && !data.imageFrontPath) {
        setError(data.error ?? "저장에 실패했습니다.");
        setStatus("idle");
        return;
      }
      sessionStorage.setItem(
        "cardDraft",
        JSON.stringify({
          draftId: data.draftId,
          imageFrontPath: data.imageFrontPath,
          imageBackPath: data.imageBackPath,
          extraction: extraction ?? data.extraction ?? null,
        }),
      );
      router.push("/new/review");
    } catch {
      setError("네트워크 오류. 잠시 후 다시 시도하세요.");
      setStatus("idle");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6">
      <header>
        <h1 className="text-xl font-bold">명함 촬영</h1>
        <p className="mt-1 text-sm text-gray-500">
          찍으면 명함 영역을 자동으로 잡아줘요. 확인하고 진행하세요.
        </p>
        <a href="/new/batch" className="mt-2 inline-block text-sm text-blue-600 underline">
          여러 명함이 한 장(스캔)에 있나요? → 일괄 인식
        </a>
      </header>

      {/* 앞면 */}
      <section className="flex flex-col gap-2">
        <span className="text-sm font-medium text-gray-700">앞면</span>
        {frontUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={frontUrl} alt="앞면" className="w-full rounded-lg border border-gray-200 object-contain" />
        )}
        <CameraCapture
          label={frontCropped ? "앞면 다시 찍기" : "앞면 촬영"}
          onSelect={(f) => pick("front", f)}
        />
        {frontFull && (
          <button
            type="button"
            onClick={() => setCrop({ side: "front", url: URL.createObjectURL(frontFull), full: frontFull })}
            className="self-start text-sm text-gray-500 underline"
          >
            다시 크롭
          </button>
        )}
      </section>

      {/* 뒷면 (선택) */}
      <section className="flex flex-col gap-2">
        <span className="text-sm font-medium text-gray-700">뒷면 (선택)</span>
        {backUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={backUrl} alt="뒷면" className="w-full rounded-lg border border-gray-200 object-contain" />
        )}
        {frontCropped && (
          <CameraCapture
            label={backCropped ? "뒷면 다시 찍기" : "뒷면 촬영 (영문 등)"}
            onSelect={(f) => pick("back", f)}
          />
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={!frontCropped || status === "saving"}
        className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-40"
      >
        {status === "saving" ? "저장 중…" : "추출 결과 확인 →"}
      </button>

      {crop && (
        <ImageCropper
          src={crop.url}
          suggested={crop.side === "front" ? suggested : null}
          onApply={applyCrop}
          onCancel={() => {
            // 크롭 안 하고 원본 그대로 사용
            applyCropRaw();
          }}
          cancelLabel="그대로 사용"
        />
      )}
    </main>
  );

  function applyCropRaw() {
    if (!crop) return;
    const file = crop.full;
    const url = URL.createObjectURL(file);
    if (crop.side === "front") {
      if (frontUrl) URL.revokeObjectURL(frontUrl);
      setFrontCropped(file);
      setFrontUrl(url);
    } else {
      if (backUrl) URL.revokeObjectURL(backUrl);
      setBackCropped(file);
      setBackUrl(url);
      if (frontFull) detect(frontFull, file);
    }
    URL.revokeObjectURL(crop.url);
    setCrop(null);
  }
}
