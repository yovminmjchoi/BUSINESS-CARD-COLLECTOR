"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import ImageCropper from "@/components/ImageCropper";
import { downscale } from "@/lib/client-image";

type Side = "front" | "back";

export default function NewCardPage() {
  const router = useRouter();
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState("");
  // 크롭 오버레이 대상: 촬영 직후 축소본을 들고 있다가 적용/스킵 결정
  const [cropTarget, setCropTarget] = useState<{ side: Side; file: File; url: string } | null>(null);

  function setImage(side: Side, file: File) {
    const url = URL.createObjectURL(file);
    if (side === "front") {
      if (frontUrl) URL.revokeObjectURL(frontUrl);
      setFront(file);
      setFrontUrl(url);
    } else {
      if (backUrl) URL.revokeObjectURL(backUrl);
      setBack(file);
      setBackUrl(url);
    }
  }

  // 촬영/선택 → 축소 → 크롭 화면 열기
  async function pick(side: Side, raw: File) {
    setError("");
    const small = await downscale(raw);
    setCropTarget({ side, file: small, url: URL.createObjectURL(small) });
  }

  function applyCrop(blob: Blob) {
    if (!cropTarget) return;
    const file = new File([blob], "card.jpg", { type: "image/jpeg" });
    setImage(cropTarget.side, file);
    URL.revokeObjectURL(cropTarget.url);
    setCropTarget(null);
  }

  function skipCrop() {
    if (!cropTarget) return;
    setImage(cropTarget.side, cropTarget.file);
    URL.revokeObjectURL(cropTarget.url);
    setCropTarget(null);
  }

  async function handleExtract() {
    if (!front) return;
    setStatus("submitting");
    setError("");

    const form = new FormData();
    form.append("front", front);
    form.append("front_cropped", "1"); // 크롭 화면을 거쳤으므로 서버 자동크롭 생략
    if (back) form.append("back", back);

    try {
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok && !data.imageFrontPath) {
        setError(data.error ?? "추출에 실패했습니다.");
        setStatus("idle");
        return;
      }
      sessionStorage.setItem("cardDraft", JSON.stringify(data));
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
          한 컷에 명함 한 장. 촬영 후 명함 영역을 잘라낼 수 있어요.
        </p>
      </header>

      {/* 앞면 */}
      <section className="flex flex-col gap-2">
        <span className="text-sm font-medium text-gray-700">앞면</span>
        {frontUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frontUrl}
            alt="앞면 미리보기"
            className="w-full rounded-lg border border-gray-200 object-contain"
          />
        )}
        <div className="flex gap-2">
          <div className="flex-1">
            <CameraCapture
              label={front ? "앞면 다시 찍기" : "앞면 촬영"}
              onSelect={(f) => pick("front", f)}
            />
          </div>
          {front && frontUrl && (
            <button
              type="button"
              onClick={() => setCropTarget({ side: "front", file: front, url: frontUrl })}
              className="rounded-lg border border-gray-300 px-3 text-sm text-gray-700"
            >
              다시 크롭
            </button>
          )}
        </div>
      </section>

      {/* 뒷면 (선택) */}
      {showBack || back ? (
        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium text-gray-700">뒷면 (선택)</span>
          {backUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backUrl}
              alt="뒷면 미리보기"
              className="w-full rounded-lg border border-gray-200 object-contain"
            />
          )}
          <CameraCapture
            label={back ? "뒷면 다시 찍기" : "뒷면 촬영"}
            onSelect={(f) => pick("back", f)}
          />
        </section>
      ) : (
        front && (
          <button
            type="button"
            onClick={() => setShowBack(true)}
            className="text-sm text-gray-500 underline"
          >
            + 뒷면도 찍기
          </button>
        )
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleExtract}
        disabled={!front || status === "submitting"}
        className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-40"
      >
        {status === "submitting" ? "추출 중… (잠시만요)" : "추출하기"}
      </button>

      {cropTarget && (
        <ImageCropper
          src={cropTarget.url}
          onApply={applyCrop}
          onCancel={skipCrop}
          cancelLabel="그대로 사용"
        />
      )}
    </main>
  );
}
