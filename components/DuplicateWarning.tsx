"use client";

import Link from "next/link";

export interface DupCandidate {
  id: string;
  personId: string;
  name: string;
  company: string;
  title: string;
  reasons: string[];
}

export default function DuplicateWarning({
  candidates,
  busy,
  onMerge,
  onOverwrite,
  onLinkPerson,
}: {
  candidates: DupCandidate[];
  busy: boolean;
  onMerge: (id: string) => void;
  onOverwrite: (id: string) => void;
  onLinkPerson: (personId: string) => void;
}) {
  if (candidates.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-900">
        비슷한 명함이 이미 있습니다. 어떻게 할까요?
      </p>

      <div className="mt-2 flex flex-col gap-2">
        {candidates.map((c) => {
          const sub = [c.company, c.title].filter(Boolean).join(" · ");
          return (
            <div key={c.id} className="rounded-lg border border-amber-200 bg-white p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-900">{c.name}</div>
                  {sub && <div className="truncate text-xs text-gray-500">{sub}</div>}
                  <div className="mt-0.5 text-[11px] text-amber-700">
                    {c.reasons.join(", ")}
                  </div>
                </div>
                <Link
                  href={`/card/${c.id}`}
                  target="_blank"
                  className="flex-shrink-0 text-xs text-blue-600 underline"
                >
                  기존 보기
                </Link>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onLinkPerson(c.personId)}
                  disabled={busy}
                  className="flex-1 rounded-lg bg-amber-600 px-2 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  같은 사람 (새 명함·이력 연결)
                </button>
                <div className="flex w-full gap-2">
                  <button
                    type="button"
                    onClick={() => onMerge(c.id)}
                    disabled={busy}
                    className="flex-1 rounded-lg border border-amber-600 px-2 py-1.5 text-sm text-amber-700 disabled:opacity-50"
                  >
                    병합
                  </button>
                  <button
                    type="button"
                    onClick={() => onOverwrite(c.id)}
                    disabled={busy}
                    className="flex-1 rounded-lg border border-amber-600 px-2 py-1.5 text-sm text-amber-700 disabled:opacity-50"
                  >
                    덮어쓰기
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-amber-800">
        또는 아래 <b>저장</b>을 누르면 새 명함으로 따로 보관합니다.
      </p>
    </div>
  );
}
