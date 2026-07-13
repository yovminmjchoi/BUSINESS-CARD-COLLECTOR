"use client";

import { useRef } from "react";

// 폰 기본 카메라 앱을 띄우는 파일 캡처 입력 래퍼 (MVP 방식).
// accept=image/* + capture=environment → iOS/안드로이드 모두 후면 카메라.
export default function CameraCapture({
  label,
  onSelect,
}: {
  label: string;
  onSelect: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white"
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          // 같은 파일 재선택 허용
          e.target.value = "";
        }}
      />
    </>
  );
}
