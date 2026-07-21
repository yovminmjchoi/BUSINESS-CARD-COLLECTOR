"use client";

import { useEffect, useState } from "react";
import TabBar from "@/components/TabBar";
import { TAG_COLORS, pickUnusedColor, type Tag } from "@/components/TagSelector";

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null); // 방금 저장됨 표시

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []))
      .finally(() => setLoading(false));
  }, []);

  function flashSaved(id: string) {
    setSavedId(id);
    setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 1500);
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setError("");
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: pickUnusedColor(tags.map((t) => t.color)) }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "추가 실패");
      return;
    }
    setTags((t) => [...t, d.tag].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
  }

  async function patch(id: string, body: { name?: string; color?: string }) {
    setError("");
    const res = await fetch(`/api/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (res.ok && d.tag) {
      setTags((ts) => ts.map((t) => (t.id === id ? d.tag : t)));
      flashSaved(id);
    } else {
      setError(d.error ?? "변경 실패");
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTags((ts) => ts.filter((t) => t.id !== id));
      setConfirmingId(null);
    }
  }

  // 다른 태그가 이미 쓰는 색 집합 (중복 방지 표시용)
  function colorsUsedByOthers(id: string): Set<string> {
    return new Set(
      tags
        .filter((t) => t.id !== id && t.color)
        .map((t) => (t.color as string).toLowerCase()),
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md pb-24">
      <div className="border-b border-gray-100 p-4">
        <h1 className="text-lg font-bold">태그</h1>
        <p className="mt-1 text-xs text-gray-400">
          이름을 고치면 자동 저장돼요. 색은 팔레트에서 고르거나 “직접 선택”으로 아무 색이나 지정할 수 있어요.
        </p>
      </div>

      <div className="flex gap-2 p-4">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="새 태그 이름"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-gray-900 focus:outline-none"
        />
        <button
          type="button"
          onClick={create}
          disabled={!newName.trim()}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          추가
        </button>
      </div>

      {error && <p className="px-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="p-8 text-center text-sm text-gray-400">불러오는 중…</p>
      ) : tags.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-400">태그가 없습니다.</p>
      ) : (
        <ul className="flex flex-col">
          {tags.map((t) => {
            const usedByOthers = colorsUsedByOthers(t.id);
            return (
              <li
                key={t.id}
                className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: t.color ?? "#6b7280" }}
                  />
                  <input
                    type="text"
                    defaultValue={t.name}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== t.name) patch(t.id, { name });
                    }}
                    className="min-w-0 flex-1 rounded border border-transparent px-1 py-1 text-base focus:border-gray-300 focus:outline-none"
                  />
                  {savedId === t.id && (
                    <span className="flex-shrink-0 text-xs font-medium text-green-600">
                      ✓ 저장됨
                    </span>
                  )}
                  {confirmingId === t.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => remove(t.id)}
                        className="flex-shrink-0 rounded bg-red-600 px-2 py-1 text-sm text-white"
                      >
                        삭제
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="flex-shrink-0 text-sm text-gray-500"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(t.id)}
                      className="flex-shrink-0 text-sm text-gray-400"
                      aria-label="태그 삭제"
                    >
                      ⋯
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-6">
                  {TAG_COLORS.map((c) => {
                    const isCurrent = (t.color ?? "").toLowerCase() === c.toLowerCase();
                    const taken = usedByOthers.has(c.toLowerCase());
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-label={taken ? `색 ${c} (다른 태그 사용 중)` : `색 ${c}`}
                        title={taken ? "다른 태그가 사용 중" : ""}
                        onClick={() => patch(t.id, { color: c })}
                        className={
                          "relative h-6 w-6 rounded-full " +
                          (isCurrent ? "ring-2 ring-gray-900 ring-offset-1" : "") +
                          (taken && !isCurrent ? " opacity-40" : "")
                        }
                        style={{ backgroundColor: c }}
                      >
                        {taken && !isCurrent && (
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white">
                            ●
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {/* 자유 색 선택 */}
                  <label className="ml-1 flex items-center gap-1 text-xs text-gray-500">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-400 text-sm text-gray-500"
                      aria-hidden
                    >
                      +
                    </span>
                    직접 선택
                    <input
                      type="color"
                      value={t.color ?? "#6b7280"}
                      onChange={(e) => patch(t.id, { color: e.target.value })}
                      className="h-0 w-0 opacity-0"
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TabBar />
    </main>
  );
}
