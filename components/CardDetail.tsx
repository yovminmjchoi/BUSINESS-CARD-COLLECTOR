"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const FIELDS: { key: string; label: string }[] = [
  { key: "name_ko", label: "이름 (한글)" },
  { key: "name_en", label: "이름 (영문)" },
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
  { key: "person_note", label: "인물 메모" },
  { key: "company_note", label: "회사 메모" },
];

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  FIELDS.map((f) => [f.key, f.label]),
);

export interface CardEdit {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  source: string;
  edited_at: string;
}

export default function CardDetail({
  card,
  edits,
  frontUrl,
  backUrl,
}: {
  card: Record<string, string | null>;
  edits: CardEdit[];
  frontUrl: string | null;
  backUrl: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of FIELDS) init[f.key] = (card[f.key] as string | null) ?? "";
    return init;
  });
  const [status, setStatus] = useState(card.status ?? "confirmed");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: form, status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage([data.error, data.detail].filter(Boolean).join(" — "));
        setSaving(false);
        return;
      }
      setMessage("저장되었습니다.");
      setSaving(false);
      router.refresh();
    } catch {
      setMessage("네트워크 오류. 다시 시도하세요.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("이 명함을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/cards/${card.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setMessage([data.error, data.detail].filter(Boolean).join(" — "));
        setDeleting(false);
        return;
      }
      router.push("/");
    } catch {
      setMessage("네트워크 오류. 다시 시도하세요.");
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6 pb-16">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-gray-500">
          ← 목록
        </Link>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="confirmed">확인됨</option>
          <option value="review_needed">검토 필요</option>
        </select>
      </header>

      {frontUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={frontUrl}
          alt="명함 앞면"
          className="w-full rounded-lg border border-gray-200 object-contain"
        />
      )}
      {backUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={backUrl}
          alt="명함 뒷면"
          className="w-full rounded-lg border border-gray-200 object-contain"
        />
      )}

      <div className="flex flex-col gap-3">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">{label}</span>
            <input
              type="text"
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-900 focus:outline-none"
            />
          </label>
        ))}
      </div>

      {message && <p className="text-center text-sm text-gray-600">{message}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
      >
        {saving ? "저장 중…" : "저장"}
      </button>

      {/* 편집 이력 */}
      <div className="mt-2 border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="text-sm text-gray-500"
        >
          편집 이력 {showHistory ? "숨기기" : "보기"} ({edits.length})
        </button>
        {showHistory && (
          <ul className="mt-2 flex flex-col gap-2">
            {edits.length === 0 && (
              <li className="text-sm text-gray-400">이력이 없습니다.</li>
            )}
            {edits.map((e) => (
              <li key={e.id} className="rounded-lg bg-gray-50 p-2 text-xs">
                <div className="flex justify-between text-gray-500">
                  <span>{FIELD_LABELS[e.field] ?? e.field}</span>
                  <span>
                    {e.source === "ai_extract" ? "AI 추출" : "수정"} ·{" "}
                    {new Date(e.edited_at).toLocaleString("ko-KR")}
                  </span>
                </div>
                <div className="mt-1 text-gray-700">
                  <span className="text-gray-400 line-through">
                    {e.old_value ?? "(없음)"}
                  </span>{" "}
                  → <span>{e.new_value ?? "(없음)"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="mt-2 text-center text-sm text-red-600 disabled:opacity-50"
      >
        {deleting ? "삭제 중…" : "이 명함 삭제"}
      </button>
    </main>
  );
}
