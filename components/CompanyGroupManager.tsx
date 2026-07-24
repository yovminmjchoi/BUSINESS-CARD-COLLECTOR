"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface CompanyOption {
  key: string;
  name: string;
  count: number;
  groupId: string | null;
  groupName: string | null;
}

export interface CompanyGroupSummary {
  id: string;
  name: string;
  note: string | null;
  count: number;
  memberNames: string[];
}

export default function CompanyGroupManager({
  companies,
  groups,
}: {
  companies: CompanyOption[];
  groups: CompanyGroupSummary[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const visibleCompanies = useMemo(() => {
    const term = q.trim().toLowerCase();
    return companies
      .filter((c) => !term || c.name.toLowerCase().includes(term))
      .slice(0, 80);
  }, [companies, q]);

  function toggle(key: string) {
    setSelected((cur) => cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/company-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, note, companyKeys: selected }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "묶음을 만들지 못했습니다.");
      return;
    }
    setName("");
    setNote("");
    setQ("");
    setSelected([]);
    setOpen(false);
    if (typeof data.group?.id === "string") {
      router.push(`/companies?g=${encodeURIComponent(data.group.id)}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function deleteGroup(id: string) {
    setError("");
    const res = await fetch(`/api/company-groups/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "묶음을 해제하지 못했습니다.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <section className="border-b border-gray-100 bg-white">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">회사 묶음</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            {groups.length > 0 ? `${groups.length}개 묶음 · 누르면 같이 보기` : "여러 회사를 한 덩어리로 보기"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-shrink-0 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white"
        >
          {open ? "닫기" : "묶기"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="flex flex-col gap-2 px-4 pb-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="묶음 이름"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="메모"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="회사 찾기"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          <div className="max-h-64 overflow-auto rounded-lg border border-gray-200">
            {visibleCompanies.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-gray-400">회사 없음</p>
            ) : (
              visibleCompanies.map((company) => {
                const checked = selected.includes(company.key);
                const disabled = Boolean(company.groupId);
                return (
                  <button
                    key={company.key}
                    type="button"
                    onClick={() => !disabled && toggle(company.key)}
                    disabled={disabled}
                    className={
                      "flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2 text-left last:border-b-0 " +
                      (checked ? "bg-blue-50" : "bg-white") +
                      (disabled ? " opacity-45" : " active:bg-gray-50")
                    }
                  >
                    <span
                      className={
                        "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[11px] " +
                        (checked ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-transparent")
                      }
                    >
                      ✓
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {company.name}
                      </span>
                      <span className="block truncate text-xs text-gray-400">
                        {disabled ? `${company.groupName}에 포함` : `${company.count}장`}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <button
            type="submit"
            disabled={pending || !name.trim() || selected.length < 2}
            className="rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-40"
          >
            {pending ? "저장 중..." : `${selected.length}개 회사 묶기`}
          </button>
        </form>
      )}

      {groups.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pb-4">
          {groups.map((group) => (
            <div key={group.id} className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
              <Link href={`/companies?g=${encodeURIComponent(group.id)}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="flex-shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white">
                    묶음
                  </span>
                  <span className="truncate text-sm font-medium text-gray-900">{group.name}</span>
                  <span className="flex-shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-blue-700">
                    {group.count}장
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-400">
                  {group.memberNames.join(", ")}
                </p>
                {group.note && (
                  <p className="mt-0.5 truncate text-xs text-blue-700">{group.note}</p>
                )}
              </Link>
              <Link
                href={`/companies?g=${encodeURIComponent(group.id)}`}
                className="flex-shrink-0 rounded border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-700"
              >
                열기
              </Link>
              <button
                type="button"
                onClick={() => deleteGroup(group.id)}
                disabled={pending}
                className="flex-shrink-0 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-500 disabled:opacity-40"
              >
                해제
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="px-4 pb-4 text-sm text-red-600">{error}</p>}
    </section>
  );
}
