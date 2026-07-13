"use client";

import { useRouter } from "next/navigation";
import type { CardListTag } from "@/components/CardListItem";

// 목록 상단 태그 필터 칩. ?tag= 갱신, 다른 파라미터 유지.
export default function TagFilter({
  tags,
  q,
  status,
  sort,
  tag,
}: {
  tags: CardListTag[];
  q: string;
  status: string;
  sort: string;
  tag: string;
}) {
  const router = useRouter();

  if (tags.length === 0) return null;

  function go(nextTag: string) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (sort) p.set("sort", sort);
    if (nextTag) p.set("tag", nextTag);
    const qs = p.toString();
    router.replace(qs ? `/?${qs}` : "/");
  }

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {tags.map((t) => {
        const active = tag === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => go(active ? "" : t.id)}
            className={
              "flex-shrink-0 rounded-full border px-2.5 py-1 text-sm " +
              (active ? "text-white" : "text-gray-600")
            }
            style={
              active
                ? { backgroundColor: t.color ?? "#374151", borderColor: t.color ?? "#374151" }
                : { borderColor: "#d1d5db" }
            }
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
