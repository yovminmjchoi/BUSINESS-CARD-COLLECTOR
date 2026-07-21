"use client";

import { useRouter } from "next/navigation";

const STATUSES = [
  { v: "", label: "전체" },
  { v: "review_needed", label: "검토 필요" },
  { v: "confirmed", label: "확인됨" },
];

const SORTS = [
  { v: "", label: "최근순" },
  { v: "company", label: "회사 가나다" },
  { v: "company_desc", label: "회사 역순" },
  { v: "name", label: "이름 가나다" },
  { v: "name_desc", label: "이름 역순" },
];

export default function FilterChips({
  q,
  status,
  sort,
  tag,
}: {
  q: string;
  status: string;
  sort: string;
  tag: string;
}) {
  const router = useRouter();

  function go(nextStatus: string, nextSort: string) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (nextStatus) p.set("status", nextStatus);
    if (nextSort) p.set("sort", nextSort);
    if (tag) p.set("tag", tag);
    const qs = p.toString();
    router.replace(qs ? `/?${qs}` : "/");
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex gap-1.5">
        {STATUSES.map((s) => (
          <button
            key={s.v}
            type="button"
            onClick={() => go(s.v, sort)}
            className={
              "rounded-full px-3 py-1 text-sm " +
              (status === s.v
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600")
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      <select
        value={sort}
        onChange={(e) => go(status, e.target.value)}
        className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
      >
        {SORTS.map((s) => (
          <option key={s.v} value={s.v}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
