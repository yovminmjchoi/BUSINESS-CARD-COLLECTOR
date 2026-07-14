"use client";

import { useEffect, useState } from "react";
import TabBar from "@/components/TabBar";
import { TAG_COLORS, type Tag } from "@/components/TagSelector";

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setError("");
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: TAG_COLORS[tags.length % TAG_COLORS.length] }),
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
    const res = await fetch(`/api/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (res.ok && d.tag) {
      setTags((ts) => ts.map((t) => (t.id === id ? d.tag : t)));
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

  return (
    <main className="mx-auto min-h-screen max-w-md pb-24">
      <div className="border-b border-gray-100 p-4">
        <h1 className="text-lg font-bold">태그</h1>
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
          {tags.map((t) => (
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
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== t.name) patch(t.id, { name });
                  }}
                  className="min-w-0 flex-1 rounded border border-transparent px-1 py-1 text-base focus:border-gray-300 focus:outline-none"
                />
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
              <div className="flex flex-wrap gap-1.5 pl-6">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`색 ${c}`}
                    onClick={() => patch(t.id, { color: c })}
                    className={
                      "h-5 w-5 rounded-full " +
                      (t.color === c ? "ring-2 ring-gray-900 ring-offset-1" : "")
                    }
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <TabBar />
    </main>
  );
}
