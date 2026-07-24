"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TabBar from "@/components/TabBar";
import {
  loadProfile,
  saveProfile,
  buildOutlookSignature,
  type MyProfile,
  type SigFields,
} from "@/lib/profile";
import { openAddressSearch } from "@/lib/postcode";

const FIELD_DEFS: { key: keyof SigFields; label: string }[] = [
  { key: "nameEn", label: "이름 (영문)" },
  { key: "nameKo", label: "이름 (한글)" },
  { key: "title", label: "직함" },
  { key: "company", label: "회사" },
  { key: "tagline", label: "회사 한 줄 소개" },
  { key: "mobile", label: "휴대폰" },
  { key: "officePhone", label: "유선전화" },
  { key: "email", label: "이메일 (회사 메일 권장)" },
  { key: "website", label: "웹사이트" },
  { key: "address", label: "주소" },
];

const EMPTY_FIELDS: SigFields = {
  nameEn: "", nameKo: "", title: "", company: "", tagline: "",
  mobile: "", officePhone: "", email: "", website: "", address: "",
};

export default function MyProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<MyProfile>({ signature: "", fields: EMPTY_FIELDS, mailApp: "default" });
  const [saved, setSaved] = useState(false);
  const [showFields, setShowFields] = useState(true);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  function setField(key: keyof SigFields, value: string) {
    setProfile((p) => ({ ...p, fields: { ...p.fields, [key]: value } }));
    setSaved(false);
  }

  function setSignature(value: string) {
    setProfile((p) => ({ ...p, signature: value }));
    setSaved(false);
  }

  function generate() {
    const sig = buildOutlookSignature(profile.fields);
    if (profile.signature.trim() && profile.signature.trim() !== sig && !confirm("아래 서명을 새로 생성한 내용으로 바꿀까요?")) return;
    setSignature(sig);
  }

  function save() {
    saveProfile(profile);
    setSaved(true);
    // 저장 후 설정으로 돌아가기
    router.push("/settings");
  }

  return (
    <main className="mx-auto min-h-screen max-w-md pb-24">
      <div className="border-b border-gray-100 p-4">
        <h1 className="text-lg font-bold">내 정보 (메일 서명)</h1>
        <p className="mt-1 text-xs text-gray-400">
          아래 서명이 메일 본문 <b>맨 아래에 그대로</b> 들어가요. 이 기기에 저장됩니다.
        </p>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {/* 빠른 입력 → 아웃룩 형식 생성 */}
        <div className="rounded-lg border border-gray-200">
          <button
            type="button"
            onClick={() => setShowFields((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-gray-700"
          >
            <span>빠른 입력 (아웃룩 형식 생성)</span>
            <span className="text-gray-400">{showFields ? "▲" : "▼"}</span>
          </button>
          {showFields && (
            <div className="flex flex-col gap-2 border-t border-gray-100 p-3">
              {FIELD_DEFS.map(({ key, label }) => (
                <label key={key} className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-gray-400">{label}</span>
                  {key === "address" ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={profile.fields.address}
                        onChange={(e) => setField("address", e.target.value)}
                        className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => openAddressSearch((a) => setField("address", a))}
                        className="flex-shrink-0 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-600"
                      >
                        주소 검색
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={profile.fields[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                    />
                  )}
                </label>
              ))}
              <button
                type="button"
                onClick={generate}
                className="mt-1 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white"
              >
                아웃룩 형식으로 서명 생성 ↓
              </button>
            </div>
          )}
        </div>

        {/* 최종 서명 (그대로 삽입) — 직접 수정·붙여넣기 가능 */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">메일 서명 (그대로 들어감 · 직접 수정 가능)</span>
          <textarea
            rows={12}
            value={profile.signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={"위에서 채우고 '생성'을 누르거나, 아웃룩 서명을 여기에 그대로 붙여넣어도 돼요."}
            className="whitespace-pre-wrap rounded-lg border border-gray-300 px-3 py-2 font-sans text-sm leading-relaxed focus:border-gray-900 focus:outline-none"
          />
        </label>
        <p className="text-xs text-gray-400">
          이미 아웃룩에 서명이 있으면 그걸 복사해 여기 붙여넣는 게 제일 빨라요. 줄바꿈 그대로 유지됩니다.
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
