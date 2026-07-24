"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CompanyOption } from "@/components/CompanyGroupManager";

export interface EditableCompanyGroup {
  id: string;
  name: string;
  note: string | null;
  memberKeys: string[];
}

export default function CompanyGroupEditor({
  group,
  companies,
}: {
  group: EditableCompanyGroup;
  companies: CompanyOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group.name);
  const [note, setNote] = useState(group.note ?? "");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>(group.memberKeys);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const visibleCompanies = useMemo(() => {
    const term = q.trim().toLowerCase();
    return companies
      .filter((c) => !term || c.name.toLowerCase().includes(term))
      .slice(0, 80);
  }, [companies, q]);

  const selectedNames = companies
    .filter((c) => selected.includes(c.key))
    .map((c) => c.name);

  function toggle(key: string) {
    setSelected((cur) => cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch(`/api/company-groups/${group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, note, companyKeys: selected }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "묶음을 수정하지 못했습니다.");
      return;
    }
    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <section className="border-b border-gray-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white">
              묶음
            </span>
            <h2 className="truncate text-base font-semibold text-gray-900">{group.name}</h2>
          </div>
          <p className="mt-1 text-sm leading-5 text-gray-600">
            {group.note || "회사 소개가 아직 없습니다."}
          </p>
          {selectedNames.length > 0 && (
            <p className="mt-2 text-xs text-gray-400">
              {selectedNames.join(", ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
        >
          {open ? "닫기" : "수정"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="묶음 이름"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="회사 소개"
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
            {visibleCompanies.map((company) => {
              const checked = selected.includes(company.key);
              const disabled = Boolean(company.groupId && company.groupId !== group.id);
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
            })}
          </div>
          <button
            type="submit"
            disabled={pending || !name.trim() || selected.length < 2}
            className="rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-40"
          >
            {pending ? "저장 중..." : "회사 묶음 저장"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </section>
  );
}
