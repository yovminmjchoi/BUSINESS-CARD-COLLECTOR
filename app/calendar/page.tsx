"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TabBar from "@/components/TabBar";

interface CardMini {
  name_ko: string | null;
  name_en: string | null;
  company_ko: string | null;
  company_en: string | null;
}
interface Meeting {
  id: string;
  card_id: string | null;
  meeting_date: string;
  activity: string;
  sf_note: string | null;
  raw_notes: string | null;
  cards: CardMini | CardMini[] | null;
}

function contactOf(m: Meeting): { name: string; company: string } {
  const c = Array.isArray(m.cards) ? m.cards[0] : m.cards;
  return {
    name: c?.name_ko || c?.name_en || "(이름 없음)",
    company: c?.company_ko || c?.company_en || "",
  };
}

export default function CalendarPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/meetings")
      .then((r) => r.json())
      .then((d) => setMeetings(d.meetings ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function copy(m: Meeting) {
    try {
      await navigator.clipboard.writeText(m.sf_note || m.raw_notes || "");
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1500);
    } catch {
      /* 무시 */
    }
  }

  // 날짜별 그룹 (이미 date desc 정렬됨)
  const groups: { date: string; items: Meeting[] }[] = [];
  for (const m of meetings) {
    const last = groups[groups.length - 1];
    if (last && last.date === m.meeting_date) last.items.push(m);
    else groups.push({ date: m.meeting_date, items: [m] });
  }

  return (
    <main className="mx-auto min-h-screen max-w-md pb-24">
      <div className="border-b border-gray-100 p-4">
        <h1 className="text-lg font-bold">미팅 {meetings.length > 0 && `(${meetings.length})`}</h1>
        <p className="mt-1 text-xs text-gray-400">
          명함 상세의 “미팅 기록”에서 추가해요. 여기선 날짜순으로 모아 봐요.
        </p>
      </div>

      {loading ? (
        <p className="p-8 text-center text-sm text-gray-400">불러오는 중…</p>
      ) : meetings.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-400">
          아직 미팅 기록이 없어요. 명함을 열어 “미팅 기록 › 미팅 추가”로 남겨보세요.
        </p>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          {groups.map((g) => (
            <div key={g.date} className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-gray-500">{g.date}</div>
              {g.items.map((m) => {
                const c = contactOf(m);
                return (
                  <div key={m.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        {m.card_id ? (
                          <Link href={`/card/${m.card_id}`} className="truncate text-sm font-medium text-gray-900 underline">
                            {c.name}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-gray-900">{c.name}</span>
                        )}
                        <span className="ml-1 text-xs text-gray-400">
                          {[c.company, m.activity].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copy(m)}
                        className="flex-shrink-0 text-xs text-blue-600 underline"
                      >
                        {copiedId === m.id ? "복사됨 ✓" : "복사"}
                      </button>
                    </div>
                    {m.sf_note && (
                      <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm text-gray-800">
                        {m.sf_note}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <TabBar />
    </main>
  );
}
