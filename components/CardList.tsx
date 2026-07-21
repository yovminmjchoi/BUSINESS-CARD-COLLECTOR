"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import CardListItem, { type CardListData } from "@/components/CardListItem";
import { initialOf } from "@/lib/hangul";

export interface CardListEntry {
  card: CardListData;
  thumbUrl: string | null;
  groupCount: number;
}

// 정렬 기준에 따라 섹션 색인 라벨 계산 (이름/회사 정렬일 때만 헤더 표시)
function sectionLabel(card: CardListData, sort: string): string | null {
  if (sort.startsWith("name")) return initialOf(card.name_ko || card.name_en);
  if (sort.startsWith("company")) return initialOf(card.company_ko || card.company_en);
  return null;
}

export default function CardList({
  entries,
  sort = "",
}: {
  entries: CardListEntry[];
  sort?: string;
}) {
  const router = useRouter();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`${ids.length}개 명함을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/cards/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        exitSelect();
        router.refresh();
      } else {
        const d = await res.json();
        alert(d.error ?? "삭제 실패");
      }
    } catch {
      alert("네트워크 오류. 다시 시도하세요.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      {/* 선택 툴바 */}
      <div className="flex items-center justify-between px-4 py-2 text-sm">
        {selectMode ? (
          <>
            <button type="button" onClick={exitSelect} className="text-gray-500">
              취소
            </button>
            <span className="text-gray-500">{selected.size}개 선택</span>
            <button
              type="button"
              onClick={deleteSelected}
              disabled={selected.size === 0 || deleting}
              className="font-medium text-red-600 disabled:opacity-40"
            >
              {deleting ? "삭제 중…" : "삭제"}
            </button>
          </>
        ) : (
          <>
            <span className="text-gray-400">그림을 누르면 상세로 이동</span>
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              className="font-medium text-gray-700"
            >
              선택
            </button>
          </>
        )}
      </div>

      <ul>
        {entries.map((e, i) => {
          const label = sectionLabel(e.card, sort);
          const prev = i > 0 ? sectionLabel(entries[i - 1].card, sort) : null;
          const showHeader = label !== null && label !== prev;
          return (
            <Fragment key={e.card.id}>
              {showHeader && (
                <li className="sticky top-0 bg-gray-50 px-4 py-1 text-xs font-semibold text-gray-500">
                  {label}
                </li>
              )}
              <li>
                <CardListItem
                  card={e.card}
                  thumbUrl={e.thumbUrl}
                  groupCount={e.groupCount}
                  selectMode={selectMode}
                  selected={selected.has(e.card.id)}
                  onToggle={() => toggle(e.card.id)}
                />
              </li>
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}
