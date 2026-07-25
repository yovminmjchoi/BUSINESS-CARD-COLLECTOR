"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "목록" },
  { href: "/companies", label: "회사" },
  { href: "/calendar", label: "캘린더" },
  { href: "/tags", label: "태그" },
  { href: "/settings", label: "설정" },
];

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-gray-200 bg-white">
      {TABS.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs " +
              (active ? "font-semibold text-gray-900" : "text-gray-400")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
