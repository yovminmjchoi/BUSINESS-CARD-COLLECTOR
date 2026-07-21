"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  const [detecting, setDetecting] = useState(false); // 인식 진행 중(특히 뒷면 추가 후)

  // 최신 추출 결과와 진행 중인 인식 요청을 ref 로 추적.
  //  - 뒷면 인식은 크롭 뒤 비동기로 도는데, 저장을 먼저 누르면 앞면만 저장되던 문제 방지.
  //  - 저장 시 pendingDetectRef 를 await 하고 extractionRef(최신)를 사용.
  const extractionRef = useRef<CardExtraction | null>(null);
  const pendingDetectRef = useRef<Promise<void> | null>(null);
  const detectSeqRef = useRef(0);

  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState("");
  // 앞면 크롭 직후 "뒷면도 있나요?" 프롬프트 (연속 촬영). 한 번만 자동 노출.
  const [askBack, setAskBack] = useState(false);
  const backPromptedRef = useRef(false);

  function applyExtraction(e: CardExtraction) {
    extractionRef.current = e;
    setExtraction(e);
  }

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

  // AI 감지: bbox → 크롭 박스 자동 맞춤, 추출 결과는 확인 화면으로.
  // 뒷면 추가 시 앞+뒤로 재호출됨. 순서가 뒤바뀐 응답(앞면만)이 최신 결과를 덮어쓰지
  // 않도록 시퀀스로 방어하고, 진행 중 promise 를 저장 시 await 한다.
  function detect(f: File, b: File | null): Promise<void> {
    const seq = ++detectSeqRef.current;
    setDetecting(true);
    const p = (async () => {
      const form = new FormData();
      form.append("mode", "detect");
      form.append("front", f);
      form.append("front_cropped", ready(f));
      if (b) form.append("back", b);
      try {
        const res = await fetch("/api/extract", { method: "POST", body: form });
        const data = await res.json();
        if (seq !== detectSeqRef.current) return; // 더 최신 요청이 있으면 무시
        if (data.extraction) {
          applyExtraction(data.extraction);
          const bb = data.extraction.card_bbox as [number, number, number, number] | null;
          if (bb) setSuggested({ x0: bb[0], y0: bb[1], x1: bb[2], y1: bb[3] });
        }
      } catch {
        /* 감지 실패는 무시 — 수동 크롭 가능 */
      } finally {
        if (seq === detectSeqRef.current) setDetecting(false);
      }
    })();
    pendingDetectRef.current = p;
    return p;
  }

  function applyCrop(blob: Blob) {
    if (!crop) return;
    const file = new File([blob], "card.jpg", { type: "image/jpeg" });
    const url = URL.createObjectURL(file);
    if (crop.side === "front") {
      if (frontUrl) URL.revokeObjectURL(frontUrl);
      setFrontCropped(file);
      setFrontUrl(url);
      // 앞면 완료 → 바로 뒷면 촬영으로 이어지도록 프롬프트 (최초 1회)
      if (!backCropped && !backPromptedRef.current) {
        backPromptedRef.current = true;
        setAskBack(true);
      }
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
    // 진행 중인 인식(특히 방금 추가한 뒷면)을 기다린 뒤 최신 결과를 사용.
    // 이걸 안 하면 뒷면 인식이 끝나기 전에 저장돼 뒷면 내용이 누락됨.
    if (pendingDetectRef.current) {
      try {
        await pendingDetectRef.current;
      } catch {
        /* 무시 */
      }
    }
    const finalExtraction = extractionRef.current;
    const form = new FormData();
    // 감지가 이미 끝났으면 저장만(빠름). 아직이면 이 요청에서 추출까지(중복 호출 방지).
    form.append("mode", finalExtraction ? "store" : "");
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
          extraction: finalExtraction ?? data.extraction ?? null,
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
        {status === "saving"
          ? detecting
            ? "인식 마무리 중…"
            : "저장 중…"
          : detecting
            ? "인식 중… (눌러도 됨)"
            : "추출 결과 확인 →"}
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

      {/* 앞면 크롭 직후: 이어서 뒷면 촬영 (연속 흐름) */}
      {askBack && !crop && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/50">
          <div className="mx-auto w-full max-w-md rounded-t-2xl bg-white p-5 pb-8">
            <h2 className="text-base font-semibold">앞면 완료 · 뒷면도 있나요?</h2>
            <p className="mt-1 text-sm text-gray-500">
              뒷면(영문면 등)이 있으면 이어서 찍어 크롭하세요. 없으면 건너뛰면 돼요.
            </p>
            <div className="mt-4">
              <CameraCapture
                label="뒷면 촬영"
                onSelect={(f) => {
                  setAskBack(false);
                  pick("back", f);
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setAskBack(false)}
              className="mt-3 w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-600"
            >
              뒷면 없음 · 건너뛰기
            </button>
          </div>
        </div>
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
      if (!backCropped && !backPromptedRef.current) {
        backPromptedRef.current = true;
        setAskBack(true);
      }
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
