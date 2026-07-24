"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function CompanySearchBar({
  q,
  sort,
  view = "companies",
  placeholder = "회사 검색",
}: {
  q: string;
  sort: string;
  view?: "companies" | "groups";
  placeholder?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setValue(q), [q]);

  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  function update(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = new URLSearchParams();
      if (next.trim()) p.set("q", next.trim());
      if (sort) p.set("s", sort);
      if (view === "groups") p.set("view", "groups");
      const qs = p.toString();
      router.replace(qs ? `/companies?${qs}` : "/companies");
    }, 300);
  }

  return (
    <input
      type="search"
      inputMode="search"
      aria-label="회사 검색"
      value={value}
      onChange={(e) => update(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-base focus:border-gray-900 focus:outline-none"
    />
  );
}
