"use client";

import { useRef } from "react";

// 촬영(카메라) + 사진에서 선택(앨범/파일) 둘 다 제공.
//   - capture="environment" 입력: 폰 카메라 바로 실행
//   - capture 없는 입력: 사진 앨범/파일에서 선택 (받은 명함 사진 업로드용)
export default function CameraCapture({
  label,
  onSelect,
}: {
  label: string;
  onSelect: (file: File) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onSelect(file);
    e.target.value = ""; // 같은 파일 재선택 허용
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        className="flex-1 rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white"
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() => libraryRef.current?.click()}
        className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-base font-medium text-gray-700"
      >
        사진에서 선택
      </button>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handle}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handle}
      />
    </div>
  );
}
