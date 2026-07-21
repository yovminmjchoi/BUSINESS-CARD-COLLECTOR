"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import ImageCropper from "@/components/ImageCropper";
import { downscale } from "@/lib/client-image";

type Side = "front" | "back";

interface ExtractState {
  state: "idle" | "running" | "done" | "error";
  data?: Record<string, unknown>;
  error?: string;
}

export default function NewCardPage() {
  const router = useRouter();
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [cropTarget, setCropTarget] = useState<{ side: Side; file: File; url: string } | null>(null);
  const [extract, setExtract] = useState<ExtractState>({ state: "idle" });

  const abortRef = useRef<AbortController | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const navigatedRef = useRef(false);

  // 촬영 화면 진입 시 서버 함수 워밍업 (콜드스타트 선제거)
  useEffect(() => {
    fetch("/api/extract").catch(() => {});
  }, []);

  // 인식 완료 → 자동으로 확인 화면 이동 (뒷면 작업 중이면 대기)
  useEffect(() => {
    if (extract.state === "done" && extract.data && !cropTarget && !navigatedRef.current) {
      navigatedRef.current = true;
      sessionStorage.setItem("cardDraft", JSON.stringify(extract.data));
      router.push("/new/review");
    }
  }, [extract, cropTarget, router]);

  function setImage(side: Side, file: File) {
    const url = URL.createObjectURL(file);
    if (side === "front") {
      setFront(file);
      setFrontUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    } else {
      setBack(file);
      setBackUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    }
  }

  // 크롭 확정 즉시 백그라운드 인식 시작 (버튼 대기 없음)
  function startExtract(f: File, b: File | null) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    navigatedRef.current = false;
    setExtract({ state: "running" });

    if (!draftIdRef.current) draftIdRef.current = crypto.randomUUID();
    const form = new FormData();
    form.append("front", f);
    form.append("front_cropped", "1");
    form.append("draftId", draftIdRef.current);
    if (b) form.append("back", b);

    fetch("/api/extract", { method: "POST", body: form, signal: ctrl.signal })
      .then(async (res) => {
        const data = await res.json();
        if (ctrl.signal.aborted) return;
        if (!res.ok && !data.imageFrontPath) {
          setExtract({ state: "error", error: data.error ?? "인식에 실패했습니다." });
          return;
        }
        setExtract({ state: "done", data });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setExtract({ state: "error", error: "네트워크 오류. 다시 시도하세요." });
        }
      });
  }

  async function pick(side: Side, raw: File) {
    const small = await downscale(raw);
    setCropTarget({ side, file: small, url: URL.createObjectURL(small) });
  }

  function finishCrop(useBlob: Blob | null) {
    if (!cropTarget) return;
    const { side, file, url } = cropTarget;
    const finalFile = useBlob
      ? new File([useBlob], "card.jpg", { type: "image/jpeg" })
      : file;
    setImage(side, finalFile);
    URL.revokeObjectURL(url);
    setCropTarget(null);

    const f = side === "front" ? finalFile : front;
    const b = side === "back" ? finalFile : back;
    if (f) startExtract(f, b);
  }

  const buttonLabel =
    extract.state === "running"
      ? "인식 중… 끝나면 자동으로 넘어가요"
      : extract.state === "error"
        ? "다시 인식하기"
        : extract.state === "done"
          ? "결과 확인 →"
          : "명함을 촬영하세요";

  function handleButton() {
    if (extract.state === "error" && front) {
      startExtract(front, back);
    } else if (extract.state === "done" && extract.data && !navigatedRef.current) {
      navigatedRef.current = true;
      sessionStorage.setItem("cardDraft", JSON.stringify(extract.data));
      router.push("/new/review");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6">
      <header>
        <h1 className="text-xl font-bold">명함 촬영</h1>
        <p className="mt-1 text-sm text-gray-500">
          찍고 영역만 맞추면 자동으로 인식됩니다.
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
            + 뒷면도 찍기 (찍으면 다시 인식)
          </button>
        )
      )}

      {extract.state === "error" && (
        <p className="text-sm text-red-600">{extract.error}</p>
      )}

      <button
        type="button"
        onClick={handleButton}
        disabled={!front || extract.state === "running"}
        className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-40"
      >
        {extract.state === "running" && (
          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white align-middle" />
        )}
        {buttonLabel}
      </button>

      {cropTarget && (
        <ImageCropper
          src={cropTarget.url}
          onApply={(blob) => finishCrop(blob)}
          onCancel={() => finishCrop(null)}
          cancelLabel="그대로 사용"
        />
      )}
    </main>
  );
}
