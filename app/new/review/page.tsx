"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TagSelector from "@/components/TagSelector";
import DuplicateWarning, { type DupCandidate } from "@/components/DuplicateWarning";
import type { CardExtraction } from "@/lib/gemini";

interface Draft {
  draftId: string;
  imageFrontPath: string | null;
  imageBackPath: string | null;
  extraction: CardExtraction | null;
  error?: string;
}

// 편집 폼에 노출할 필드 (순서·라벨)
const FIELDS: { key: keyof CardExtraction; label: string }[] = [
  { key: "name_ko", label: "이름 (한글)" },
  { key: "name_en", label: "이름 (영문)" },
  { key: "family_name", label: "성" },
  { key: "given_name", label: "이름" },
  { key: "company_ko", label: "회사 (한글)" },
  { key: "company_en", label: "회사 (영문)" },
  { key: "department", label: "부서" },
  { key: "title_ko", label: "직함 (한글)" },
  { key: "title_en", label: "직함 (영문)" },
  { key: "mobile", label: "휴대폰" },
  { key: "office_phone", label: "유선전화" },
  { key: "fax", label: "팩스" },
  { key: "email", label: "이메일" },
  { key: "website", label: "웹사이트" },
  { key: "address_ko", label: "주소 (한글)" },
  { key: "address_en", label: "주소 (영문)" },
];

const EMPTY: CardExtraction = {
  name_ko: null, name_en: null, family_name: null, given_name: null,
  company_ko: null, company_en: null,
  department: null, title_ko: null, title_en: null, mobile: null,
  office_phone: null, fax: null, email: null, website: null,
  address_ko: null, address_en: null, language: null, confidence: null, notes: null,
  card_bbox: null,
};

export default function ReviewPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form, setForm] = useState<CardExtraction>(EMPTY);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [personNote, setPersonNote] = useState("");
  const [companyNote, setCompanyNote] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [candidates, setCandidates] = useState<DupCandidate[]>([]);

  useEffect(() => {
    const raw = sessionStorage.getItem("cardDraft");
    if (!raw) {
      router.replace("/new");
      return;
    }
    const parsed: Draft = JSON.parse(raw);
    setDraft(parsed);
    setForm(parsed.extraction ?? EMPTY);

    // 중복 후보 조회 (추출값 기준)
    const ex = parsed.extraction;
    if (ex) {
      fetch("/api/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: ex.email,
          mobile: ex.mobile,
          name: ex.name_ko || ex.name_en,
          companyKo: ex.company_ko,
          companyEn: ex.company_en,
        }),
      })
        .then((r) => r.json())
        .then((d) => setCandidates(d.candidates ?? []))
        .catch(() => setCandidates([]));
    }

    // 비공개 버킷 이미지 → 서명 URL (RLS: 소유자만)
    if (parsed.imageFrontPath) {
      const supabase = createClient();
      supabase.storage
        .from("card-images")
        .createSignedUrl(parsed.imageFrontPath, 300)
        .then(({ data }) => {
          if (data?.signedUrl) setImageUrl(data.signedUrl);
        });
    }
  }, [router]);

  if (!draft) return null;

  const needsReview =
    draft.extraction === null ||
    form.confidence === "low" ||
    (!form.name_ko && !form.name_en && !form.email && !form.mobile);

  function set(key: keyof CardExtraction, value: string) {
    setForm((f) => ({ ...f, [key]: value === "" ? null : value }));
  }

  // personId 지정 시 같은 사람으로 연결(새 명함), 없으면 독립 새 명함.
  // primary=true 면 이 새 명함을 사람 그룹의 대표로.
  async function handleSave(personId?: string, primary?: boolean) {
    if (!draft) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: form,
          extraction: draft.extraction,
          imageFrontPath: draft.imageFrontPath,
          imageBackPath: draft.imageBackPath,
          personNote,
          companyNote,
          tagIds,
          personId: personId ?? null,
          setPrimary: primary ?? false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(
          [data.error, data.detail].filter(Boolean).join(" — ") ||
            "저장에 실패했습니다.",
        );
        setSaving(false);
        return;
      }
      sessionStorage.removeItem("cardDraft");
      router.push(`/?done=saved`);
    } catch {
      setSaveError("네트워크 오류. 잠시 후 다시 시도하세요.");
      setSaving(false);
    }
  }

  // 기존 명함에 병합(merge=true) 또는 덮어쓰기(merge=false)
  async function saveToExisting(targetId: string, merge: boolean) {
    if (!draft) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/cards/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: {
            ...form,
            person_note: personNote || null,
            company_note: companyNote || null,
          },
          merge,
          imageFrontPath: draft.imageFrontPath,
          imageBackPath: draft.imageBackPath,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(
          [data.error, data.detail].filter(Boolean).join(" — ") ||
            "저장에 실패했습니다.",
        );
        setSaving(false);
        return;
      }
      sessionStorage.removeItem("cardDraft");
      router.push(`/?done=${merge ? "merged" : "updated"}`);
    } catch {
      setSaveError("네트워크 오류. 잠시 후 다시 시도하세요.");
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
      <header>
        <h1 className="text-xl font-bold">추출 결과 확인</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gemini가 읽은 내용입니다. 명함과 비교해 확인하세요.
        </p>
      </header>

      {draft.error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          추출 실패: {draft.error} — 아래에서 직접 입력할 수 있습니다.
        </div>
      )}

      {needsReview && !draft.error && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          검토 필요 — 핵심 정보가 비었거나 판독 확신도가 낮습니다.
        </div>
      )}

      <DuplicateWarning
        candidates={candidates}
        busy={saving}
        onMerge={(id) => saveToExisting(id, true)}
        onOverwrite={(id) => saveToExisting(id, false)}
        onLinkPrimary={(personId) => handleSave(personId, true)}
        onLinkHistory={(personId) => handleSave(personId, false)}
      />

      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt="명함"
          className="w-full rounded-lg border border-gray-200 object-contain"
        />
      )}

      <div className="flex flex-col gap-3">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">{label}</span>
            <input
              type="text"
              value={(form[key] as string | null) ?? ""}
              onChange={(e) => set(key, e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-900 focus:outline-none"
            />
          </label>
        ))}
      </div>

      {/* 태그 */}
      <TagSelector value={tagIds} onChange={setTagIds} />

      {/* 메모 */}
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">인물 메모</span>
          <textarea
            rows={2}
            value={personNote}
            onChange={(e) => setPersonNote(e.target.value)}
            placeholder="예: 소개로 만남, 후속 미팅 필요"
            className="rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-900 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">회사 메모</span>
          <textarea
            rows={2}
            value={companyNote}
            onChange={(e) => setCompanyNote(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-900 focus:outline-none"
          />
        </label>
      </div>

      <div className="rounded-lg bg-gray-100 p-3 text-xs text-gray-600">
        <div>언어: {form.language ?? "-"} · 확신도: {form.confidence ?? "-"}</div>
        {form.notes && <div className="mt-1">판독 메모: {form.notes}</div>}
      </div>

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      <button
        type="button"
        onClick={() => handleSave()}
        disabled={saving}
        className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
      >
        {saving
          ? "저장 중…"
          : candidates.length > 0
            ? "새 명함으로 따로 저장 (다른 사람)"
            : "저장"}
      </button>
    </main>
  );
}
