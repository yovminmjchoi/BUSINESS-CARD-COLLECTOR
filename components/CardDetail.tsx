"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import TagSelector from "@/components/TagSelector";
import ImageCropper from "@/components/ImageCropper";
import { downscale } from "@/lib/client-image";
import { loadProfile, buildMailto, hasProfile, type MyProfile } from "@/lib/profile";

const FIELDS: { key: string; label: string }[] = [
  { key: "family_name_ko", label: "성 (한글)" },
  { key: "given_name_ko", label: "이름 (한글)" },
  { key: "family_name_en", label: "성 (영문)" },
  { key: "given_name_en", label: "이름 (영문)" },
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

export interface OtherCard {
  id: string;
  company: string;
  title: string;
  createdAt: string;
}

export default function CardDetail({
  card,
  edits,
  initialTagIds,
  otherCards,
  isPrimary,
  frontUrl,
  backUrl,
}: {
  card: Record<string, string | null>;
  edits: CardEdit[];
  initialTagIds: string[];
  otherCards: OtherCard[];
  isPrimary: boolean;
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
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [reanalyzed, setReanalyzed] = useState<{
    filled: number;
    labels: string[];
    hasBack: boolean;
  } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [settingPrimary, setSettingPrimary] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [profile, setProfile] = useState<MyProfile | null>(null);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);
  const [cropState, setCropState] = useState<{ side: "front" | "back"; src: string } | null>(null);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  // 사진 교체/추가: 새 파일 업로드 → 서버가 경로 갱신 → 화면 새로고침
  async function uploadImage(side: "front" | "back", blob: Blob) {
    setImgBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("side", side);
      form.append("file", new File([blob], "card.jpg", { type: "image/jpeg" }));
      const res = await fetch(`/api/cards/${card.id}/image`, { method: "POST", body: form });
      if (!res.ok) {
        const d = await res.json();
        setMessage(d.error ?? "사진 저장 실패");
        setImgBusy(false);
        return;
      }
      window.location.reload();
    } catch {
      setMessage("네트워크 오류. 다시 시도하세요.");
      setImgBusy(false);
    }
  }

  async function retake(side: "front" | "back", file: File) {
    const small = await downscale(file);
    // 다시 찍은 사진도 크롭 화면 거치기
    setCropState({ side, src: URL.createObjectURL(small) });
  }

  // 저장된 사진 크롭: 서명 URL → blob → 크롭 오버레이
  async function cropExisting(side: "front" | "back", url: string) {
    setImgBusy(true);
    try {
      const r = await fetch(url);
      const b = await r.blob();
      setCropState({ side, src: URL.createObjectURL(b) });
    } catch {
      setMessage("이미지를 불러오지 못했습니다.");
    } finally {
      setImgBusy(false);
    }
  }

  async function deleteImage(side: "front" | "back") {
    if (!confirm("이 사진을 삭제할까요? (명함 정보는 유지됩니다)")) return;
    setImgBusy(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/image?side=${side}`, { method: "DELETE" });
      if (res.ok) window.location.reload();
      else {
        const d = await res.json();
        setMessage(d.error ?? "삭제 실패");
        setImgBusy(false);
      }
    } catch {
      setMessage("네트워크 오류. 다시 시도하세요.");
      setImgBusy(false);
    }
  }

  // 지정한 카드를 사람 그룹의 대표로. 목록 캐시를 완전히 우회하도록 하드 리로드.
  async function makePrimary(targetId: string | null) {
    if (!targetId) return;
    setSettingPrimary(true);
    try {
      const res = await fetch(`/api/cards/${targetId}/primary`, { method: "POST" });
      if (res.ok) {
        window.location.href = "/?done=primary";
      } else {
        const d = await res.json();
        setMessage(d.error ?? "지정 실패");
        setSettingPrimary(false);
      }
    } catch {
      setMessage("네트워크 오류. 다시 시도하세요.");
      setSettingPrimary(false);
    }
  }

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
        body: JSON.stringify({ values: form, status, tagIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage([data.error, data.detail].filter(Boolean).join(" — "));
        setSaving(false);
        return;
      }
      // 저장 후 목록으로 (수정 완료를 배너로 확인)
      router.push("/?done=saved");
    } catch {
      setMessage("네트워크 오류. 다시 시도하세요.");
      setSaving(false);
    }
  }

  async function handleReanalyze() {
    if (!confirm("사진으로 다시 인식해 빈 칸을 채울까요? (이미 입력된 값은 유지됩니다)")) return;
    setImgBusy(true);
    setMessage("");
    setReanalyzed(null);
    try {
      const res = await fetch(`/api/cards/${card.id}/reanalyze`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setMessage(d.error ?? "다시 인식 실패");
        setImgBusy(false);
        return;
      }
      // 반환된 값을 폼의 빈 칸에만 병합 (리로드 없이 즉시 반영 → 무엇이 채워졌는지 보임).
      const vals = (d.values ?? {}) as Record<string, string | null>;
      const filledLabels: string[] = [];
      setForm((prev) => {
        const next = { ...prev };
        for (const f of FIELDS) {
          const v = vals[f.key];
          if (typeof v === "string" && v.trim() !== "" && !next[f.key].trim()) {
            next[f.key] = v.trim();
            filledLabels.push(f.label);
          }
        }
        return next;
      });
      setReanalyzed({
        filled: d.filled ?? 0,
        labels: filledLabels,
        hasBack: Boolean(backUrl),
      });
      setImgBusy(false);
    } catch {
      setMessage("네트워크 오류. 다시 시도하세요.");
      setImgBusy(false);
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

      {/* 메일 보내기: 상대 이메일로 폰 메일 앱 열기(내 정보=서명 자동 삽입) */}
      {(() => {
        const emailAddr = (form.email || (card.email as string | null) || "").trim();
        if (!emailAddr) return null;
        const href = profile ? buildMailto(emailAddr, profile) : `mailto:${emailAddr}`;
        return (
          <div className="flex flex-col gap-1">
            <a
              href={href}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white"
            >
              ✉️ 메일 보내기
            </a>
            {profile && !hasProfile(profile) && (
              <Link href="/me" className="text-center text-xs text-gray-400 underline">
                내 서명 설정 (설정 › 내 정보)
              </Link>
            )}
          </div>
        );
      })()}

      {/* 앞면 사진 + 관리 */}
      <div className="flex flex-col gap-1.5">
        {frontUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frontUrl}
            alt="명함 앞면"
            className="w-full rounded-lg border border-gray-200 object-contain"
          />
        ) : (
          <div className="flex h-24 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">
            앞면 사진 없음
          </div>
        )}
        <div className="flex gap-2 text-xs">
          {frontUrl && (
            <button type="button" disabled={imgBusy} onClick={() => cropExisting("front", frontUrl)} className="rounded border border-gray-300 px-2 py-1 text-gray-600 disabled:opacity-50">
              크롭
            </button>
          )}
          <button type="button" disabled={imgBusy} onClick={() => frontInputRef.current?.click()} className="rounded border border-gray-300 px-2 py-1 text-gray-600 disabled:opacity-50">
            {frontUrl ? "다시 찍기" : "앞면 사진 추가"}
          </button>
          {frontUrl && (
            <button type="button" disabled={imgBusy} onClick={() => deleteImage("front")} className="rounded border border-red-200 px-2 py-1 text-red-500 disabled:opacity-50">
              사진 삭제
            </button>
          )}
        </div>
      </div>

      {/* 뒷면 사진 + 관리 */}
      <div className="flex flex-col gap-1.5">
        {backUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backUrl}
            alt="명함 뒷면"
            className="w-full rounded-lg border border-gray-200 object-contain"
          />
        )}
        <div className="flex gap-2 text-xs">
          {backUrl && (
            <button type="button" disabled={imgBusy} onClick={() => cropExisting("back", backUrl)} className="rounded border border-gray-300 px-2 py-1 text-gray-600 disabled:opacity-50">
              크롭
            </button>
          )}
          <button type="button" disabled={imgBusy} onClick={() => backInputRef.current?.click()} className="rounded border border-gray-300 px-2 py-1 text-gray-600 disabled:opacity-50">
            {backUrl ? "뒷면 다시 찍기" : "뒷면 사진 추가"}
          </button>
          {backUrl && (
            <button type="button" disabled={imgBusy} onClick={() => deleteImage("back")} className="rounded border border-red-200 px-2 py-1 text-red-500 disabled:opacity-50">
              사진 삭제
            </button>
          )}
        </div>
      </div>

      {/* 사진 교체용 숨김 입력 */}
      <input
        ref={frontInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) retake("front", f);
          e.target.value = "";
        }}
      />
      <input
        ref={backInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) retake("back", f);
          e.target.value = "";
        }}
      />

      {cropState && (
        <ImageCropper
          src={cropState.src}
          onApply={(blob) => {
            const side = cropState.side;
            URL.revokeObjectURL(cropState.src);
            setCropState(null);
            uploadImage(side, blob);
          }}
          onCancel={() => {
            URL.revokeObjectURL(cropState.src);
            setCropState(null);
          }}
          cancelLabel="취소"
        />
      )}

      {otherCards.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-500">
              경력 이력 (같은 사람 명함 {otherCards.length}장)
            </span>
            {isPrimary ? (
              <span className="flex-shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                현재 명함
              </span>
            ) : (
              <button
                type="button"
                onClick={() => makePrimary(card.id)}
                disabled={settingPrimary}
                className="flex-shrink-0 rounded-full border border-indigo-300 px-2 py-0.5 text-[11px] font-medium text-indigo-700 disabled:opacity-50"
              >
                현재 명함으로 지정
              </button>
            )}
          </div>
          <ul className="flex flex-col gap-1">
            {otherCards.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <Link
                  href={`/card/${o.id}`}
                  className="min-w-0 flex-1 truncate text-sm text-gray-700 underline"
                >
                  {o.company}
                  {o.title ? ` · ${o.title}` : ""}
                </Link>
                <button
                  type="button"
                  onClick={() => makePrimary(o.id)}
                  disabled={settingPrimary}
                  className="flex-shrink-0 rounded-full border border-indigo-300 px-2 py-0.5 text-[11px] font-medium text-indigo-700 disabled:opacity-50"
                >
                  대표로
                </button>
              </li>
            ))}
          </ul>
        </div>
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

      <TagSelector value={tagIds} onChange={setTagIds} />

      {reanalyzed && (
        <div
          className={
            "rounded-lg p-3 text-sm " +
            (reanalyzed.labels.length > 0
              ? "bg-green-50 text-green-800"
              : "bg-amber-50 text-amber-800")
          }
        >
          {reanalyzed.labels.length > 0 ? (
            <>
              <div className="font-medium">
                ✓ {reanalyzed.labels.length}개 항목을 채웠어요{reanalyzed.hasBack ? " (앞·뒷면)" : ""}. 확인 후 아래 저장을 누르세요.
              </div>
              <div className="mt-1 text-xs">{reanalyzed.labels.join(", ")}</div>
            </>
          ) : (
            <div className="font-medium">
              새로 채운 항목이 없어요 — 빈 칸이 없거나 사진에서 더 읽을 내용이 없습니다{reanalyzed.hasBack ? " (뒷면 포함해 확인함)" : ""}.
            </div>
          )}
        </div>
      )}

      {message && <p className="text-center text-sm text-gray-600">{message}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
      >
        {saving ? "저장 중…" : "저장"}
      </button>

      <button
        type="button"
        onClick={handleReanalyze}
        disabled={imgBusy}
        className="text-center text-sm text-gray-500 underline disabled:opacity-50"
      >
        사진으로 다시 인식 (빈 칸 채우기)
      </button>

      {/* 편집 이력 — 직접 수정한 내역만. AI 최초 추출은 한 줄 요약. */}
      {(() => {
        const userEdits = edits.filter((e) => e.source === "user_edit");
        const aiEdits = edits.filter((e) => e.source === "ai_extract");
        const firstExtractAt = aiEdits[0]?.edited_at ?? null;
        return (
          <div className="mt-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-sm text-gray-500"
            >
              편집 이력 {showHistory ? "숨기기" : "보기"} ({userEdits.length})
            </button>
            {showHistory && (
              <ul className="mt-2 flex flex-col gap-2">
                {firstExtractAt && (
                  <li className="rounded-lg bg-gray-50 p-2 text-xs text-gray-500">
                    최초 AI 추출 ·{" "}
                    {new Date(firstExtractAt).toLocaleString("ko-KR")} ·{" "}
                    {aiEdits.length}개 필드 자동 입력
                  </li>
                )}
                {userEdits.length === 0 && (
                  <li className="text-sm text-gray-400">
                    직접 수정한 내역이 없습니다.
                  </li>
                )}
                {userEdits.map((e) => (
                  <li key={e.id} className="rounded-lg bg-blue-50 p-2 text-xs">
                    <div className="flex justify-between text-gray-500">
                      <span>{FIELD_LABELS[e.field] ?? e.field}</span>
                      <span>
                        수정 · {new Date(e.edited_at).toLocaleString("ko-KR")}
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
        );
      })()}

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
