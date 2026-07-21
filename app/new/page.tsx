"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import CameraCapture from "@/components/CameraCapture";

// 업로드 전 클라이언트 축소: 원본(3~5MB)을 장변 2000px JPEG(~0.3MB)로.
// 브라우저가 못 읽는 포맷(데스크톱 HEIC 등)이면 원본 그대로 → 서버가 변환.
async function downscale(file: File): Promise<File> {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
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
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("toBlob failed");
    return new File([blob], "card.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function NewCardPage() {
  const router = useRouter();
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState("");

  function pickFront(file: File) {
    setFront(file);
    if (frontUrl) URL.revokeObjectURL(frontUrl);
    setFrontUrl(URL.createObjectURL(file));
  }
  function pickBack(file: File) {
    setBack(file);
    if (backUrl) URL.revokeObjectURL(backUrl);
    setBackUrl(URL.createObjectURL(file));
  }

  async function handleExtract() {
    if (!front) return;
    setStatus("submitting");
    setError("");

    // 업로드 전 축소 (속도 개선의 핵심)
    const [frontSmall, backSmall] = await Promise.all([
      downscale(front),
      back ? downscale(back) : Promise.resolve(null),
    ]);

    const form = new FormData();
    form.append("front", frontSmall);
    if (backSmall) form.append("back", backSmall);

    try {
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();

      // 추출 실패(502)여도 이미지 경로가 있으면 수동 입력용으로 넘어감
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
          한 컷에 명함 한 장. 앞면을 찍고, 필요하면 뒷면도 이어 찍으세요.
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
        <CameraCapture
          label={front ? "앞면 다시 찍기" : "앞면 촬영"}
          onSelect={pickFront}
        />
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
            onSelect={pickBack}
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
    </main>
  );
}
