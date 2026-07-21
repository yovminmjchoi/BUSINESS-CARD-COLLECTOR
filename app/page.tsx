import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SearchBar from "@/components/SearchBar";
import FilterChips from "@/components/FilterChips";
import CardListItem, {
  type CardListData,
  type CardListTag,
} from "@/components/CardListItem";
import TagFilter from "@/components/TagFilter";
import TabBar from "@/components/TabBar";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store"; // is_primary 등 변경 즉시 반영

const SEARCH_COLUMNS = [
  "name_ko", "name_en", "company_ko", "company_en",
  "title_ko", "title_en", "email", "person_note", "company_note",
];

export default async function ListPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    sort?: string;
    tag?: string;
    done?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "";
  const sort = sp.sort ?? "";
  const tag = sp.tag ?? "";
  const flash =
    sp.done === "saved"
      ? "저장되었습니다."
      : sp.done === "merged"
        ? "기존 명함에 병합되었습니다."
        : sp.done === "updated"
          ? "기존 명함을 덮어썼습니다."
          : sp.done === "primary"
            ? "현재 명함으로 지정했습니다."
            : null;

  const supabase = await createClient();

  let query = supabase
    .from("cards")
    .select(
      "id,person_id,is_primary,name_ko,name_en,company_ko,company_en,title_ko,title_en,status,image_front_path,card_tags(tags(id,name,color))",
    );

  if (status === "review_needed" || status === "confirmed") {
    query = query.eq("status", status);
  }

  // 태그 필터: 해당 태그를 가진 card_id 로 제한
  if (tag) {
    const { data: ct } = await supabase
      .from("card_tags")
      .select("card_id")
      .eq("tag_id", tag);
    const ids = (ct ?? []).map((r) => r.card_id as string);
    query = query.in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
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

  type Row = Omit<CardListData, "tags"> & {
    person_id: string;
    is_primary: boolean;
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

  // 같은 사람(person_id) 명함 개수 — "외 N장" 표시용
  const { data: allPersonIds } = await supabase.from("cards").select("person_id");
  const personCount = new Map<string, number>();
  for (const r of (allPersonIds ?? []) as { person_id: string }[]) {
    personCount.set(r.person_id, (personCount.get(r.person_id) ?? 0) + 1);
  }
  const cardPersonId = new Map<string, string>();
  const cardPrimary = new Map<string, boolean>();
  rows.forEach((r) => {
    cardPersonId.set(r.id, r.person_id);
    cardPrimary.set(r.id, r.is_primary === true);
  });

  // 같은 사람 명함을 한 줄로 접기.
  //   대표 = "현재 명함" 지정(is_primary)이 있으면 그것, 없으면 정렬상 첫(기본 최근 등록순).
  //   태그는 그 사람의 (현재 화면에 보이는) 카드들 것을 합쳐서 대표에 표시.
  const personTagMap = new Map<string, Map<string, CardListTag>>();
  for (const c of cards) {
    const pid = cardPersonId.get(c.id) ?? c.id;
    let m = personTagMap.get(pid);
    if (!m) {
      m = new Map();
      personTagMap.set(pid, m);
    }
    for (const t of c.tags) m.set(t.id, t);
  }
  const repByPerson = new Map<string, CardListData>();
  for (const c of cards) {
    const pid = cardPersonId.get(c.id) ?? c.id;
    const rep = repByPerson.get(pid);
    if (!rep) {
      repByPerson.set(pid, c); // 첫 등장(정렬 순서 유지)
    } else if (cardPrimary.get(c.id) && !cardPrimary.get(rep.id)) {
      repByPerson.set(pid, c); // 지정된 현재 명함이 우선 (Map 키 위치는 유지)
    }
  }
  const displayCards: CardListData[] = [...repByPerson.values()].map((c) => ({
    ...c,
    tags: [...(personTagMap.get(cardPersonId.get(c.id) ?? c.id)?.values() ?? [])],
  }));

  const { data: allTags } = await supabase
    .from("tags")
    .select("id,name,color")
    .order("name");

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
        <h1 className="text-lg font-bold">
          명함{" "}
          {cards.length > 0 &&
            (cards.length === displayCards.length
              ? `(${cards.length})`
              : `(${displayCards.length}명 · ${cards.length}장)`)}
        </h1>
        <SearchBar q={q} status={status} sort={sort} tag={tag} />
        <FilterChips q={q} status={status} sort={sort} tag={tag} />
        <TagFilter
          tags={(allTags ?? []) as CardListTag[]}
          q={q}
          status={status}
          sort={sort}
          tag={tag}
        />
      </div>

      {flash && (
        <div className="mx-4 mt-3 rounded-lg bg-green-50 p-3 text-center text-sm font-medium text-green-800">
          ✓ {flash}
        </div>
      )}

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-12 text-center text-gray-400">
          <p>{q || status ? "조건에 맞는 명함이 없습니다." : "아직 저장된 명함이 없습니다."}</p>
          {!q && !status && <p className="text-sm">아래 + 버튼으로 첫 명함을 촬영하세요.</p>}
        </div>
      ) : (
        <ul>
          {displayCards.map((card) => (
            <li key={card.id}>
              <CardListItem
                card={card}
                thumbUrl={card.image_front_path ? thumbMap.get(card.image_front_path) ?? null : null}
                groupCount={personCount.get(cardPersonId.get(card.id) ?? "") ?? 1}
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
