import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CardListItem, {
  type CardListData,
  type CardListTag,
} from "@/components/CardListItem";
import TabBar from "@/components/TabBar";

export const dynamic = "force-dynamic";

const NONE = "__none__"; // 회사 미상 그룹 키

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; s?: string }>;
}) {
  const sp = await searchParams;
  const selected = sp.c;
  const sortBy = sp.s ?? ""; // "" 많은순 / "name" 가나다 / "name_desc" 역순
  const supabase = await createClient();

  // ── 회사 상세 모드: 선택된 회사의 명함 목록 ──
  if (selected) {
    let q = supabase
      .from("cards")
      .select(
        "id,name_ko,name_en,company_ko,company_en,title_ko,title_en,status,image_front_path,company_normalized,card_tags(tags(id,name,color))",
      )
      .order("name_ko", { ascending: true, nullsFirst: false });
    q = selected === NONE
      ? q.is("company_normalized", null)
      : q.eq("company_normalized", selected);

    const { data } = await q;

    type Row = Omit<CardListData, "tags"> & {
      company_normalized: string | null;
      card_tags: { tags: CardListTag | CardListTag[] | null }[] | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    const cards: CardListData[] = rows.map((row) => ({
      id: row.id,
      name_ko: row.name_ko,
      name_en: row.name_en,
      company_ko: row.company_ko,
      company_en: row.company_en,
      title_ko: row.title_ko,
      title_en: row.title_en,
      status: row.status,
      image_front_path: row.image_front_path,
      tags: (row.card_tags ?? []).flatMap((ct) => {
        const tg = ct.tags;
        if (!tg) return [];
        return Array.isArray(tg) ? tg : [tg];
      }),
    }));

    const title =
      cards[0]?.company_ko || cards[0]?.company_en || "회사 미상";

    const thumbMap = new Map<string, string>();
    const paths = cards
      .map((c) => c.image_front_path)
      .filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from("card-images")
        .createSignedUrls(paths, 300);
      signed?.forEach((s) => {
        if (s.signedUrl && s.path) thumbMap.set(s.path, s.signedUrl);
      });
    }

    return (
      <main className="mx-auto min-h-screen max-w-md pb-24">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white/95 p-4 backdrop-blur">
          <Link href="/companies" className="text-sm text-gray-500">
            ← 회사
          </Link>
          <h1 className="truncate text-lg font-bold">
            {title} ({cards.length})
          </h1>
        </div>
        <ul>
          {cards.map((card) => (
            <li key={card.id}>
              <CardListItem
                card={card}
                thumbUrl={
                  card.image_front_path
                    ? thumbMap.get(card.image_front_path) ?? null
                    : null
                }
              />
            </li>
          ))}
        </ul>
        <TabBar />
      </main>
    );
  }

  // ── 회사 목록 모드: company_normalized 로 그룹핑 + 카운트 ──
  const { data } = await supabase
    .from("cards")
    .select("company_normalized,company_ko,company_en");

  type CRow = {
    company_normalized: string | null;
    company_ko: string | null;
    company_en: string | null;
  };
  const groups = new Map<string, { name: string; count: number }>();
  for (const row of (data ?? []) as CRow[]) {
    const key = row.company_normalized ?? NONE;
    const existing = groups.get(key);
    const name = row.company_ko || row.company_en || "회사 미상";
    if (existing) {
      existing.count += 1;
      if (existing.name === "회사 미상" && name !== "회사 미상") existing.name = name;
    } else {
      groups.set(key, { name, count: 1 });
    }
  }
  const list = [...groups.entries()].map(([key, v]) => ({ key, ...v }));
  if (sortBy === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  } else if (sortBy === "name_desc") {
    list.sort((a, b) => b.name.localeCompare(a.name, "ko"));
  } else {
    list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
  }

  const SORTS = [
    { v: "", label: "많은순" },
    { v: "name", label: "가나다" },
    { v: "name_desc", label: "역순" },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-md pb-24">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 p-4">
        <h1 className="text-lg font-bold">
          회사 {list.length > 0 && `(${list.length})`}
        </h1>
        <div className="flex gap-1.5">
          {SORTS.map((s) => {
            const active = sortBy === s.v;
            return (
              <Link
                key={s.v}
                href={s.v ? `/companies?s=${s.v}` : "/companies"}
                className={
                  "rounded-full px-2.5 py-1 text-xs " +
                  (active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600")
                }
              >
                {s.label}
              </Link>
            );
          })}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="p-12 text-center text-sm text-gray-400">
          아직 저장된 명함이 없습니다.
        </p>
      ) : (
        <ul>
          {list.map((g) => (
            <li key={g.key}>
              <Link
                href={`/companies?c=${encodeURIComponent(g.key)}`}
                className="flex items-center justify-between border-b border-gray-100 px-4 py-3 active:bg-gray-50"
              >
                <span className="truncate font-medium text-gray-900">
                  {g.name}
                </span>
                <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {g.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <TabBar />
    </main>
  );
}
