"use client";

import { useEffect, useState } from "react";
import { loadProfile } from "@/lib/profile";

interface Meeting {
  id: string;
  meeting_date: string;
  activity: string;
  raw_notes: string | null;
  sf_note: string | null;
  created_at: string;
}

const ACTIVITIES = [
  "dinner meeting",
  "lunch meeting",
  "meeting",
  "call",
  "site visit",
  "coffee chat",
];

export default function MeetingLog({
  cardId,
  contactName,
  contactCompany,
}: {
  cardId: string;
  contactName: string;
  contactCompany: string;
}) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activity, setActivity] = useState("dinner meeting");
  const [rawNotes, setRawNotes] = useState("");
  const [sfNote, setSfNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/meetings?cardId=${cardId}`)
      .then((r) => r.json())
      .then((d) => setMeetings(d.meetings ?? []))
      .catch(() => {});
  }, [cardId]);

  async function generate() {
    if (!rawNotes.trim()) {
      setError("미팅 메모를 먼저 적어주세요.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const myName = (() => {
        const p = loadProfile();
        return p.fields.nameEn || p.fields.nameKo || "";
      })();
      const res = await fetch("/api/meetings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ myName, rawNotes, activity, contactName, contactCompany }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "생성에 실패했습니다.");
      } else {
        setSfNote(d.note ?? "");
      }
    } catch {
      setError("네트워크 오류. 다시 시도하세요.");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!sfNote.trim() && !rawNotes.trim()) {
      setError("메모 또는 SF 노트를 입력하세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, meetingDate: date, activity, rawNotes, sfNote }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "저장 실패");
      } else {
        setMeetings((m) => [d.meeting, ...m]);
        setRawNotes("");
        setSfNote("");
        setOpen(false);
      }
    } catch {
      setError("네트워크 오류. 다시 시도하세요.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("이 미팅 기록을 삭제할까요?")) return;
    const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    if (res.ok) setMeetings((m) => m.filter((x) => x.id !== id));
  }

  async function copy(m: Meeting) {
    const text = m.sf_note || m.raw_notes || "";
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1500);
    } catch {
      /* 클립보드 실패 시 무시 */
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">미팅 기록 (Salesforce)</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white"
        >
          {open ? "닫기" : "+ 미팅 추가"}
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-0.5">
              <span className="text-[11px] font-medium text-gray-400">날짜</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-1 flex-col gap-0.5">
              <span className="text-[11px] font-medium text-gray-400">활동</span>
              <select
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                {ACTIVITIES.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-gray-400">메모 (키워드·논의내용·다음단계 등 거칠게)</span>
            <textarea
              rows={3}
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              placeholder="예: Expedia TAAP 프로모션, CRM 1450개 여행사, 배너지원, 호텔 전용코드. 다음: 호텔 관심 확인 후 조인미팅"
              className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            />
          </label>

          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 disabled:opacity-50"
          >
            {generating ? "생성 중…" : "✨ Salesforce 노트 생성"}
          </button>

          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-gray-400">Salesforce 노트 (수정 가능)</span>
            <textarea
              rows={5}
              value={sfNote}
              onChange={(e) => setSfNote(e.target.value)}
              placeholder="생성을 누르면 여기에 영문 활동기록이 만들어져요. 직접 수정해도 됩니다."
              className="whitespace-pre-wrap rounded border border-gray-300 px-2 py-1.5 text-sm leading-relaxed focus:border-gray-900 focus:outline-none"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "저장 중…" : "미팅 저장"}
          </button>
        </div>
      )}

      {/* 저장된 미팅 목록 */}
      {meetings.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          {meetings.map((m) => {
            const note = m.sf_note || m.raw_notes || "";
            return (
              <li key={m.id} className="rounded-lg bg-gray-50 p-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{m.meeting_date} · {m.activity}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => copy(m)} className="text-blue-600 underline">
                      {copiedId === m.id ? "복사됨 ✓" : "복사"}
                    </button>
                    <button type="button" onClick={() => remove(m.id)} className="text-red-500 underline">
                      삭제
                    </button>
                  </div>
                </div>
                {note ? (
                  <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm text-gray-800">
                    {note}
                  </pre>
                ) : (
                  <p className="mt-1 text-sm text-gray-400">메모 없음</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
