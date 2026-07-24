"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TabBar from "@/components/TabBar";
import {
  loadProfile,
  saveProfile,
  buildSignature,
  type MyProfile,
} from "@/lib/profile";

const FIELDS: { key: keyof MyProfile; label: string; placeholder?: string }[] = [
  { key: "name", label: "이름" },
  { key: "company", label: "회사" },
  { key: "title", label: "직함" },
  { key: "mobile", label: "휴대폰" },
  { key: "officePhone", label: "유선전화" },
  { key: "email", label: "이메일 (회사 메일 권장)" },
];

const EMPTY: MyProfile = {
  name: "", company: "", title: "", mobile: "", officePhone: "", email: "", extra: "",
};

export default function MyProfilePage() {
  const [profile, setProfile] = useState<MyProfile>(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  function set(key: keyof MyProfile, value: string) {
    setProfile((p) => ({ ...p, [key]: value }));
    setSaved(false);
  }

  function save() {
    saveProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const signature = buildSignature(profile);

  return (
    <main className="mx-auto min-h-screen max-w-md pb-24">
      <div className="border-b border-gray-100 p-4">
        <h1 className="text-lg font-bold">내 정보 (내 명함)</h1>
        <p className="mt-1 text-xs text-gray-400">
          메일 보낼 때 본문 아래 <b>서명</b>으로 자동으로 붙어요. 이 기기에 저장됩니다.
        </p>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">{label}</span>
            <input
              type="text"
              value={profile[key]}
              onChange={(e) => set(key, e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-900 focus:outline-none"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">추가 서명 (회사 주소·웹사이트 등, 선택)</span>
          <textarea
            rows={2}
            value={profile.extra}
            onChange={(e) => set("extra", e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-900 focus:outline-none"
          />
        </label>

        {/* 서명 미리보기 */}
        <div className="rounded-lg bg-gray-50 p-3">
          <span className="text-xs font-medium text-gray-400">메일 서명 미리보기</span>
          {signature ? (
            <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm text-gray-700">
              {signature}
            </pre>
          ) : (
            <p className="mt-1 text-sm text-gray-400">위 정보를 채우면 서명이 만들어져요.</p>
          )}
        </div>

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
