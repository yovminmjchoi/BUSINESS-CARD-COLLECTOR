"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CardExtraction } from "@/lib/gemini";

interface BatchItem {
  draftId: string;
  imageFrontPath: string;
  extraction: CardExtraction;
}

function displayName(e: CardExtraction): string {
  const ko = [e.family_name_ko, e.given_name_ko].filter(Boolean).join("");
  const en = [e.given_name_en, e.family_name_en].filter(Boolean).join(" ");
  return ko || en || e.name_ko || e.name_en || "(이름 없음)";
}

export default function BatchReviewPage() {
  const router = useRouter();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [include, setInclude] = useState<boolean[]>([]);
  const [thumbs, setThumbs] = useState<(string | null)[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("batchDraft");
    if (!raw) {
      router.replace("/new/batch");
      return;
    }
    const parsed: BatchItem[] = JSON.parse(raw);
    setItems(parsed);
    setInclude(parsed.map(() => true));
    setThumbs(parsed.map(() => null));

    const supabase = createClient();
    parsed.forEach((it, i) => {
      supabase.storage
        .from("card-images")
        .createSignedUrl(it.imageFrontPath, 600)
        .then(({ data }) => {
          if (data?.signedUrl)
            setThumbs((t) => {
              const n = [...t];
              n[i] = data.signedUrl;
              return n;
            });
        });
    });
  }, [router]);

  const selectedCount = include.filter(Boolean).length;

  async function saveAll() {
    setSaving(true);
    setError("");
    let done = 0;
    try {
      for (let i = 0; i < items.length; i++) {
        if (!include[i]) continue;
        const it = items[i];
        const res = await fetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            values: it.extraction,
            extraction: it.extraction,
            imageFrontPath: it.imageFrontPath,
            imageBackPath: null,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          setError(`${done}개 저장 후 실패: ${d.error ?? ""}`);
          setSaving(false);
          return;
        }
        done += 1;
        setProgress(done);
      }
      sessionStorage.removeItem("batchDraft");
      router.push(`/?done=batch&n=${done}`);
    } catch {
      setError("네트워크 오류. 다시 시도하세요.");
      setSaving(false);
    }
  }

  if (items.length === 0) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-3 p-6 pb-28">
      <header>
        <h1 className="text-xl font-bold">인식된 명함 {items.length}장</h1>
        <p className="mt-1 text-sm text-gray-500">
          저장할 명함을 확인하세요. 세부 수정은 저장 후 각 명함에서 할 수 있어요.
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {items.map((it, i) => {
          const e = it.extraction;
          const company = e.company_ko || e.company_en || "";
          const title = e.title_ko || e.title_en || "";
          const contact = e.mobile || e.email || "";
          return (
            <li
              key={it.draftId}
              className={
                "flex gap-3 rounded-lg border p-2 " +
                (include[i] ? "border-blue-300 bg-blue-50/40" : "border-gray-200 opacity-50")
              }
            >
              <button
                type="button"
                onClick={() =>
                  setInclude((v) => v.map((x, idx) => (idx === i ? !x : x)))
                }
                className={
                  "mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[11px] " +
                  (include[i] ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-transparent")
                }
              >
                ✓
              </button>
              {thumbs[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbs[i]!} alt="" className="h-14 w-20 flex-shrink-0 rounded object-cover" />
              ) : (
                <div className="h-14 w-20 flex-shrink-0 rounded bg-gray-100" />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium text-gray-900">{displayName(e)}</div>
                {(company || title) && (
                  <div className="truncate text-gray-500">
                    {[company, title].filter(Boolean).join(" · ")}
                  </div>
                )}
                {contact && <div className="truncate text-xs text-gray-400">{contact}</div>}
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-gray-200 bg-white p-4">
        <button
          type="button"
          onClick={saveAll}
          disabled={saving || selectedCount === 0}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-40"
        >
          {saving
            ? `저장 중… (${progress}/${selectedCount})`
            : `${selectedCount}개 저장`}
        </button>
      </div>
    </main>
  );
}
