"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TabBar from "@/components/TabBar";
import { loadProfile } from "@/lib/profile";

type CalView = "month" | "week" | "day";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function monthCells(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay()); // 그 주 일요일로
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
function weekCells(cursor: Date): Date[] {
  const start = new Date(cursor);
  start.setDate(cursor.getDate() - cursor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

interface CardMini {
  name_ko: string | null;
  name_en: string | null;
  company_ko: string | null;
  company_en: string | null;
}

interface CardSearchResult extends CardMini {
  id: string;
  title_ko: string | null;
  title_en: string | null;
  email: string | null;
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

const ACTIVITIES = [
  "dinner meeting",
  "lunch meeting",
  "meeting",
  "call",
  "site visit",
  "coffee chat",
];

function contactOf(m: Meeting): { name: string; company: string } {
  const c = Array.isArray(m.cards) ? m.cards[0] : m.cards;
  return {
    name: c?.name_ko || c?.name_en || "(이름 없음)",
    company: c?.company_ko || c?.company_en || "",
  };
}

function cardName(card: CardSearchResult): string {
  return card.name_ko || card.name_en || "(이름 없음)";
}

function cardCompany(card: CardSearchResult): string {
  return card.company_ko || card.company_en || "";
}

export default function CalendarPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [view, setView] = useState<CalView>("month");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selDate, setSelDate] = useState<string>(() => ymd(new Date()));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [cardQuery, setCardQuery] = useState("");
  const [cardResults, setCardResults] = useState<CardSearchResult[]>([]);
  const [selectedCard, setSelectedCard] = useState<CardSearchResult | null>(null);
  const [searchingCards, setSearchingCards] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activity, setActivity] = useState("dinner meeting");
  const [rawNotes, setRawNotes] = useState("");
  const [activityNote, setActivityNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/meetings");
      const data = await res.json();
      setMeetings(data.meetings ?? []);
    } catch {
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  useEffect(() => {
    if (!composerOpen) return;

    let ignore = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchingCards(true);
      fetch(`/api/cards?q=${encodeURIComponent(cardQuery)}&limit=20`, {
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data) => {
          if (!ignore) setCardResults(data.cards ?? []);
        })
        .catch(() => {
          if (!ignore) setCardResults([]);
        })
        .finally(() => {
          if (!ignore) setSearchingCards(false);
        });
    }, 250);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cardQuery, composerOpen]);

  async function copy(m: Meeting) {
    try {
      await navigator.clipboard.writeText(m.sf_note || m.raw_notes || "");
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1500);
    } catch {
      /* 무시 */
    }
  }

  function startEdit(m: Meeting) {
    setEditingId(m.id);
    setEditText(m.sf_note || m.raw_notes || "");
  }

  async function saveEdit(id: string) {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sfNote: editText }),
      });
      if (res.ok) {
        setMeetings((list) => list.map((x) => (x.id === id ? { ...x, sf_note: editText } : x)));
        setEditingId(null);
      }
    } finally {
      setEditSaving(false);
    }
  }

  async function generate() {
    if (!selectedCard) {
      setError("먼저 명함을 선택하세요.");
      return;
    }
    if (!rawNotes.trim()) {
      setError("미팅 메모를 먼저 적어주세요.");
      return;
    }

    setGenerating(true);
    setError("");
    try {
      const profile = loadProfile();
      const myName = profile.fields.nameEn || profile.fields.nameKo || "MJ";
      const res = await fetch("/api/meetings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          myName,
          rawNotes,
          activity,
          contactName: cardName(selectedCard),
          contactCompany: cardCompany(selectedCard),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "생성에 실패했습니다.");
      } else {
        setActivityNote(data.note ?? "");
      }
    } catch {
      setError("네트워크 오류. 다시 시도하세요.");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!selectedCard) {
      setError("먼저 명함을 선택하세요.");
      return;
    }
    if (!rawNotes.trim() && !activityNote.trim()) {
      setError("미팅 메모 또는 활동 기록을 입력하세요.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: selectedCard.id,
          meetingDate: date,
          activity,
          rawNotes,
          sfNote: activityNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "저장 실패");
        return;
      }

      await loadMeetings();
      setComposerOpen(false);
      setSelectedCard(null);
      setCardQuery("");
      setCardResults([]);
      setRawNotes("");
      setActivityNote("");
    } catch {
      setError("네트워크 오류. 다시 시도하세요.");
    } finally {
      setSaving(false);
    }
  }

  // 날짜(yyyy-mm-dd) → 미팅들
  const byDate = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const m of meetings) {
      const arr = map.get(m.meeting_date) ?? [];
      arr.push(m);
      map.set(m.meeting_date, arr);
    }
    return map;
  }, [meetings]);

  const todayKey = ymd(new Date());
  const cells = view === "week" ? weekCells(cursor) : monthCells(cursor);
  const title =
    view === "day"
      ? selDate
      : `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월${view === "week" ? ` ${Math.ceil((cursor.getDate() + new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay()) / 7)}주` : ""}`;

  function shift(dir: 1 | -1) {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
    if (view === "day") setSelDate(ymd(d));
  }

  const dayMeetings = byDate.get(selDate) ?? [];

  return (
    <main className="mx-auto min-h-screen max-w-md pb-24">
      <div className="border-b border-gray-100 p-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold">미팅 {meetings.length > 0 && `(${meetings.length})`}</h1>
          <button
            type="button"
            onClick={() => {
              setComposerOpen((open) => !open);
              setError("");
            }}
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white"
          >
            {composerOpen ? "닫기" : "+ 미팅 추가"}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          명함에서 사람을 찾아 미팅 메모를 남기고, 붙여넣기용 활동 기록으로 정리해요.
        </p>
      </div>

      {composerOpen && (
        <section className="border-b border-gray-100 bg-gray-50 p-4">
          <div className="flex flex-col gap-3">
            <label className="relative flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">만난 사람</span>
              <input
                value={cardQuery}
                onChange={(e) => {
                  setCardQuery(e.target.value);
                  setSelectedCard(null);
                }}
                placeholder="이름, 회사, 이메일로 명함 검색"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
              />
              {!selectedCard && cardResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {cardResults.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => {
                        setSelectedCard(card);
                        setCardQuery([cardName(card), cardCompany(card)].filter(Boolean).join(" · "));
                        setCardResults([]);
                      }}
                      className="block w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0"
                    >
                      <span className="block text-sm font-medium text-gray-900">{cardName(card)}</span>
                      <span className="block truncate text-xs text-gray-400">
                        {[cardCompany(card), card.title_ko || card.title_en, card.email].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!selectedCard && searchingCards && (
                <span className="text-xs text-gray-400">검색 중…</span>
              )}
              {selectedCard && (
                <span className="text-xs font-medium text-blue-600">
                  선택됨: {[cardName(selectedCard), cardCompany(selectedCard)].filter(Boolean).join(" · ")}
                </span>
              )}
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">날짜</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">활동</span>
                <select
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                >
                  {ACTIVITIES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">미팅 메모</span>
              <textarea
                rows={4}
                value={rawNotes}
                onChange={(e) => setRawNotes(e.target.value)}
                placeholder="논의한 호텔, 프로모션, 그룹명, 일정, 다음 액션을 거칠게 적어도 돼요."
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
              />
            </label>

            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 disabled:opacity-50"
            >
              {generating ? "생성 중…" : "붙여넣기용 기록 생성"}
            </button>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">붙여넣기용 활동 기록</span>
              <textarea
                rows={5}
                value={activityNote}
                onChange={(e) => setActivityNote(e.target.value)}
                placeholder="생성된 영문 기록을 확인하고 필요하면 수정하세요."
                className="whitespace-pre-wrap rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed focus:border-gray-900 focus:outline-none"
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "저장 중…" : "미팅 저장"}
            </button>
          </div>
        </section>
      )}

      {/* 달력 툴바 */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} className="rounded-lg border border-gray-300 px-2 py-1 text-sm">‹</button>
          <span className="min-w-[7rem] text-center text-sm font-semibold text-gray-800">{title}</span>
          <button type="button" onClick={() => shift(1)} className="rounded-lg border border-gray-300 px-2 py-1 text-sm">›</button>
          <button
            type="button"
            onClick={() => { const n = new Date(); setCursor(n); setSelDate(ymd(n)); }}
            className="ml-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600"
          >오늘</button>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-gray-300 text-xs">
          {(["month", "week", "day"] as CalView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={"px-2.5 py-1 " + (view === v ? "bg-gray-900 text-white" : "text-gray-600")}
            >
              {v === "month" ? "월" : v === "week" ? "주" : "일"}
            </button>
          ))}
        </div>
      </div>

      {/* 월/주 그리드 */}
      {view !== "day" && (
        <div className="px-4 pt-2">
          <div className="grid grid-cols-7 text-center text-[11px] text-gray-400">
            {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
          </div>
          <div className={"grid grid-cols-7 gap-1 " + (view === "week" ? "" : "")}>
            {cells.map((d) => {
              const key = ymd(d);
              const inMonth = view === "week" || d.getMonth() === cursor.getMonth();
              const count = (byDate.get(key) ?? []).length;
              const isSel = key === selDate;
              const isToday = key === todayKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setSelDate(key); if (view === "week") setCursor(d); }}
                  className={
                    "flex aspect-square flex-col items-center justify-center rounded-lg text-sm " +
                    (isSel ? "bg-blue-600 text-white" : inMonth ? "text-gray-800" : "text-gray-300") +
                    (isToday && !isSel ? " ring-1 ring-blue-400" : "")
                  }
                >
                  <span>{d.getDate()}</span>
                  {count > 0 && (
                    <span className={"mt-0.5 h-1.5 w-1.5 rounded-full " + (isSel ? "bg-white" : "bg-blue-500")} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 선택한 날의 미팅 */}
      <div className="flex flex-col gap-2 p-4">
        <div className="text-xs font-semibold text-gray-500">{selDate} · {dayMeetings.length}건</div>
        {loading ? (
          <p className="py-6 text-center text-sm text-gray-400">불러오는 중…</p>
        ) : dayMeetings.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">이 날 미팅이 없어요. 위 “미팅 추가”로 남겨보세요.</p>
        ) : (
          dayMeetings.map((m) => {
            const c = contactOf(m);
            const note = m.sf_note || m.raw_notes || "";
            return (
              <div key={m.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    {m.card_id ? (
                      <Link href={`/card/${m.card_id}`} className="truncate text-sm font-medium text-gray-900 underline">{c.name}</Link>
                    ) : (
                      <span className="text-sm font-medium text-gray-900">{c.name}</span>
                    )}
                    <span className="ml-1 text-xs text-gray-400">{[c.company, m.activity].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div className="flex flex-shrink-0 gap-2 text-xs">
                    <button type="button" onClick={() => startEdit(m)} className="text-gray-500 underline">수정</button>
                    <button type="button" onClick={() => copy(m)} className="text-blue-600 underline">
                      {copiedId === m.id ? "복사됨 ✓" : "복사"}
                    </button>
                  </div>
                </div>
                {editingId === m.id ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <textarea
                      rows={5}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="whitespace-pre-wrap rounded border border-gray-300 px-2 py-1.5 text-sm leading-relaxed focus:border-gray-900 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => saveEdit(m.id)} disabled={editSaving} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                        {editSaving ? "저장 중…" : "저장"}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600">취소</button>
                    </div>
                  </div>
                ) : (
                  note && <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm text-gray-800">{note}</pre>
                )}
              </div>
            );
          })
        )}
      </div>

      <TabBar />
    </main>
  );
}
