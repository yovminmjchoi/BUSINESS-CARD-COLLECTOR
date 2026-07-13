import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SearchBar from "@/components/SearchBar";
import FilterChips from "@/components/FilterChips";
import CardListItem, { type CardListData } from "@/components/CardListItem";
import TabBar from "@/components/TabBar";

export const dynamic = "force-dynamic";

const SEARCH_COLUMNS = [
  "name_ko", "name_en", "company_ko", "company_en",
  "title_ko", "title_en", "email", "person_note", "company_note",
];

export default async function ListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "";
  const sort = sp.sort ?? "";

  const supabase = await createClient();

  let query = supabase
    .from("cards")
    .select(
      "id,name_ko,name_en,company_ko,company_en,title_ko,title_en,status,image_front_path",
    );

  if (status === "review_needed" || status === "confirmed") {
    query = query.eq("status", status);
  }

  if (q) {
    // PostgREST or() 필터 구문을 깨는 문자 제거 후 부분일치(ILIKE, 와일드카드 *)
    const term = q.replace(/[,()*%]/g, " ").trim();
    if (term) {
      query = query.or(
        SEARCH_COLUMNS.map((c) => `${c}.ilike.*${term}*`).join(","),
      );
    }
  }

  if (sort === "company") {
    query = query.order("company_normalized", { ascending: true, nullsFirst: false });
  } else if (sort === "name") {
    query = query.order("name_ko", { ascending: true, nullsFirst: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data } = await query;
  const cards = (data ?? []) as CardListData[];

  // 썸네일 서명 URL 일괄 발급
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
    <main className="mx-auto min-h-screen max-w-md pb-28">
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-gray-100 bg-white/95 p-4 backdrop-blur">
        <h1 className="text-lg font-bold">명함 {cards.length > 0 && `(${cards.length})`}</h1>
        <SearchBar q={q} status={status} sort={sort} />
        <FilterChips q={q} status={status} sort={sort} />
      </div>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-12 text-center text-gray-400">
          <p>{q || status ? "조건에 맞는 명함이 없습니다." : "아직 저장된 명함이 없습니다."}</p>
          {!q && !status && <p className="text-sm">아래 + 버튼으로 첫 명함을 촬영하세요.</p>}
        </div>
      ) : (
        <ul>
          {cards.map((card) => (
            <li key={card.id}>
              <CardListItem
                card={card}
                thumbUrl={card.image_front_path ? thumbMap.get(card.image_front_path) ?? null : null}
              />
            </li>
          ))}
        </ul>
      )}

      {/* 촬영 FAB */}
      <Link
        href="/new"
        className="fixed bottom-20 left-1/2 z-20 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-blue-600 text-3xl leading-none text-white shadow-lg"
        aria-label="명함 촬영"
      >
        +
      </Link>

      <TabBar />
    </main>
  );
}
