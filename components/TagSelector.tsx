"use client";

import { useEffect, useState } from "react";

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export const TAG_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#d946ef", "#ec4899", "#f43f5e", "#6b7280",
];

export default function TagSelector({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []))
      .catch(() => setTags([]));
  }, []);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  async function create() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          color: TAG_COLORS[tags.length % TAG_COLORS.length],
        }),
      });
      const d = await res.json();
      if (res.ok && d.tag) {
        setTags((t) => [...t, d.tag]);
        onChange([...value, d.tag.id]);
        setNewName("");
      } else if (res.status === 409) {
        // 이미 있으면 해당 태그 선택
        const existing = tags.find((t) => t.name === name);
        if (existing && !value.includes(existing.id)) onChange([...value, existing.id]);
        setNewName("");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-500">태그</span>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => {
          const selected = value.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className={
                "rounded-full border px-2.5 py-1 text-sm " +
                (selected ? "text-white" : "text-gray-600")
              }
              style={
                selected
                  ? { backgroundColor: t.color ?? "#374151", borderColor: t.color ?? "#374151" }
                  : { borderColor: "#d1d5db" }
              }
            >
              {t.name}
            </button>
          );
        })}
        {tags.length === 0 && (
          <span className="text-sm text-gray-400">태그가 없습니다. 아래에서 추가하세요.</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              create();
            }
          }}
          placeholder="새 태그 이름"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
        <button
          type="button"
          onClick={create}
          disabled={creating || !newName.trim()}
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-40"
        >
          추가
        </button>
      </div>
    </div>
  );
}
