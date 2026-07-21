"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import CameraCapture from "@/components/CameraCapture";
import { downscale } from "@/lib/client-image";

export default function BatchNewPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "working">("idle");
  const [error, setError] = useState("");

  async function handle(raw: File) {
    setStatus("working");
    setError("");
    try {
      const small = await downscale(raw);
      const form = new FormData();
      form.append("front", small);
      form.append("front_cropped", small.type === "image/jpeg" ? "1" : "0");
      const res = await fetch("/api/extract-multi", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "인식에 실패했습니다.");
        setStatus("idle");
        return;
      }
      sessionStorage.setItem("batchDraft", JSON.stringify(data.cards));
      router.push("/new/batch/review");
    } catch {
      setError("네트워크 오류. 잠시 후 다시 시도하세요.");
      setStatus("idle");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6">
      <header>
        <Link href="/new" className="text-sm text-gray-500">
          ← 한 장씩 촬영
        </Link>
        <h1 className="mt-2 text-xl font-bold">여러 명함 한 번에</h1>
        <p className="mt-1 text-sm text-gray-500">
          여러 명함이 한 이미지(스캔·사진)에 있으면 한 번에 인식합니다. 각 명함을
          잘라 개별로 저장해요.
        </p>
      </header>

      {status === "working" ? (
        <div className="flex flex-col items-center gap-3 p-10 text-gray-500">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
          <p>명함들을 인식하는 중… (여러 장이면 조금 걸려요)</p>
        </div>
      ) : (
        <CameraCapture label="스캔 촬영" onSelect={handle} />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
