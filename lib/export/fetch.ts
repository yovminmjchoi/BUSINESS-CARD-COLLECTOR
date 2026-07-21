// 내보내기용 데이터 조회 공용 헬퍼: 카드 + 태그, 사람 그룹 인접 정렬.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VcardCard } from "./vcard";

// scope="primary" 면 사람당 대표 명함 1장만 (is_primary 우선, 없으면 최신)
export async function fetchCardsForExport(
  supabase: SupabaseClient,
  scope: "all" | "primary" = "all",
): Promise<VcardCard[]> {
  const { data, error } = await supabase
    .from("cards")
    .select(
      "person_id,is_primary,created_at,status,name_ko,name_en,company_ko,company_en,department,title_ko,title_en,mobile,office_phone,fax,email,website,address_ko,address_en,person_note,company_note,card_tags(tags(name))",
    );
  if (error) throw new Error(error.message);

  type Raw = Omit<VcardCard, "tags"> & {
    card_tags: { tags: { name: string } | { name: string }[] | null }[] | null;
  };
  const cards: VcardCard[] = ((data ?? []) as unknown as Raw[]).map((r) => ({
    ...r,
    is_primary: r.is_primary === true,
    tags: (r.card_tags ?? []).flatMap((ct) => {
      const t = ct.tags;
      if (!t) return [];
      return (Array.isArray(t) ? t : [t]).map((x) => x.name);
    }),
  }));

  // 사람 그룹 인접 정렬: 그룹 대표 이름순 → 그룹 내 대표 먼저, 이후 최신순
  const groups = new Map<string, VcardCard[]>();
  for (const c of cards) {
    const g = groups.get(c.person_id);
    if (g) g.push(c);
    else groups.set(c.person_id, [c]);
  }
  const sortedGroups = [...groups.values()]
    .map((g) => {
      const inner = [...g].sort((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      );
      const rep = inner.find((c) => c.is_primary);
      if (rep) {
        inner.splice(inner.indexOf(rep), 1);
        inner.unshift(rep);
      }
      return inner;
    })
    .sort((a, b) => {
      const an = a[0].name_ko || a[0].name_en || "";
      const bn = b[0].name_ko || b[0].name_en || "";
      return an.localeCompare(bn, "ko");
    });

  if (scope === "primary") {
    // 각 그룹의 첫 카드 = 대표 (위에서 대표를 맨 앞으로 정렬해둠)
    return sortedGroups.map((g) => g[0]);
  }
  return sortedGroups.flat();
}
