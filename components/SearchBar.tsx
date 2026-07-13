"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// 검색어 입력 → 디바운스 후 URL(?q=) 갱신. status·sort 는 유지.
export default function SearchBar({
  q,
  status,
  sort,
}: {
  q: string;
  status: string;
  sort: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setValue(q), [q]);

  function update(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = new URLSearchParams();
      if (next.trim()) p.set("q", next.trim());
      if (status) p.set("status", status);
      if (sort) p.set("sort", sort);
      const qs = p.toString();
      router.replace(qs ? `/?${qs}` : "/");
    }, 300);
  }

  return (
    <input
      type="search"
      inputMode="search"
      value={value}
      onChange={(e) => update(e.target.value)}
      placeholder="이름·회사·직함·이메일·메모 검색"
      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-base focus:border-gray-900 focus:outline-none"
    />
  );
}
