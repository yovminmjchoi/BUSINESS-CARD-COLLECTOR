"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TabBar from "@/components/TabBar";
import {
  loadProfile,
  saveProfile,
  SIGNATURE_TEMPLATE,
  type MyProfile,
} from "@/lib/profile";

export default function MyProfilePage() {
  const [profile, setProfile] = useState<MyProfile>({ signature: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  function setSignature(value: string) {
    setProfile({ signature: value });
    setSaved(false);
  }

  function save() {
    saveProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function insertTemplate() {
    if (profile.signature.trim() && !confirm("현재 내용을 기본 양식으로 바꿀까요?")) return;
    setSignature(SIGNATURE_TEMPLATE);
  }

  return (
    <main className="mx-auto min-h-screen max-w-md pb-24">
      <div className="border-b border-gray-100 p-4">
        <h1 className="text-lg font-bold">내 정보 (메일 서명)</h1>
        <p className="mt-1 text-xs text-gray-400">
          여기 적은 내용이 메일 본문 <b>맨 아래에 그대로</b> 들어가요. 이 기기에 저장됩니다.
        </p>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">메일 서명</span>
          <button
            type="button"
            onClick={insertTemplate}
            className="text-xs text-blue-600 underline"
          >
            기본 양식 넣기
          </button>
        </div>
        <textarea
          rows={12}
          value={profile.signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder={SIGNATURE_TEMPLATE}
          className="whitespace-pre-wrap rounded-lg border border-gray-300 px-3 py-2 font-sans text-sm leading-relaxed focus:border-gray-900 focus:outline-none"
        />
        <p className="text-xs text-gray-400">
          영문·한글 인사와 이름·직함·회사·주소를 원하는 형식으로 자유롭게 적으면 돼요.
          줄바꿈도 그대로 유지됩니다.
        </p>

        <button
          type="button"
          onClick={save}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white"
        >
          {saved ? "✓ 저장됨" : "저장"}
        </button>

        <Link href="/settings" className="text-center text-sm text-gray-500 underline">
          ← 설정으로
        </Link>
      </div>

      <TabBar />
    </main>
  );
}
