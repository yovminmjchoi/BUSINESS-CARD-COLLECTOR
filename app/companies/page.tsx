import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CardListItem, {
  type CardListData,
  type CardListTag,
} from "@/components/CardListItem";
import CompanyGroupManager, {
  type CompanyGroupSummary,
  type CompanyOption,
} from "@/components/CompanyGroupManager";
import CompanyGroupEditor from "@/components/CompanyGroupEditor";
import CompanySearchBar from "@/components/CompanySearchBar";
import TabBar from "@/components/TabBar";

export const dynamic = "force-dynamic";

const NONE = "__none__"; // 회사 미상 그룹 키

type CardRow = Omit<CardListData, "tags"> & {
  company_normalized: string | null;
  card_tags: { tags: CardListTag | CardListTag[] | null }[] | null;
};

type CompanyRow = {
  company_normalized: string | null;
  company_ko: string | null;
  company_en: string | null;
};

type GroupMemberRow = {
  company_normalized: string;
  display_name: string | null;
};

type GroupRow = {
  id: string;
  name: string;
  note: string | null;
  company_group_members: GroupMemberRow[] | null;
};

function toCards(rows: CardRow[]): CardListData[] {
  return rows.map((row) => ({
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
}

function displayCompany(row: CompanyRow): string {
  return row.company_ko || row.company_en || "회사 미상";
}

function matchesSearch(values: (string | null | undefined)[], term: string): boolean {
  if (!term) return true;
  return values.some((value) => (value ?? "").toLowerCase().includes(term));
}

function companiesHref(
  q: string,
  sort: string,
  view: "companies" | "groups" = "companies",
): string {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (sort) p.set("s", sort);
  if (view === "groups") p.set("view", "groups");
  const qs = p.toString();
  return qs ? `/companies?${qs}` : "/companies";
}

function companyDetailHref(key: string, q: string, sort: string): string {
  const p = new URLSearchParams({ c: key });
  if (q) p.set("q", q);
  if (sort) p.set("s", sort);
  return `/companies?${p.toString()}`;
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; g?: string; q?: string; s?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const selected = sp.c;
  const selectedGroup = sp.g;
  const searchQuery = (sp.q ?? "").trim();
  const searchTerm = searchQuery.toLowerCase();
  const sortBy = sp.s ?? ""; // "" 많은순 / "name" 가나다 / "name_desc" 역순
  const viewMode = sp.view === "groups" ? "groups" : "companies";
  const supabase = await createClient();

  if (selectedGroup) {
    const { data: groupData } = await supabase
      .from("company_groups")
      .select("id,name,note,company_group_members(company_normalized,display_name)")
      .eq("id", selectedGroup)
      .maybeSingle();

    const group = groupData as unknown as GroupRow | null;
    const members = group?.company_group_members ?? [];
    const keys = members.map((m) => m.company_normalized).filter(Boolean);

    let rows: CardRow[] = [];
    if (keys.length > 0) {
      const { data } = await supabase
        .from("cards")
        .select(
          "id,name_ko,name_en,company_ko,company_en,title_ko,title_en,status,image_front_path,company_normalized,card_tags(tags(id,name,color))",
        )
        .in("company_normalized", keys)
        .order("name_ko", { ascending: true, nullsFirst: false });
      rows = (data ?? []) as unknown as CardRow[];
    }

    const cards = toCards(rows);

    const { data: allCompanyData } = await supabase
      .from("cards")
      .select("company_normalized,company_ko,company_en");
    const allCompanies = new Map<string, { name: string; count: number }>();
    for (const row of (allCompanyData ?? []) as CompanyRow[]) {
      const key = row.company_normalized ?? NONE;
      if (key === NONE) continue;
      const existing = allCompanies.get(key);
      const name = displayCompany(row);
      if (existing) {
        existing.count += 1;
        if (existing.name === "회사 미상" && name !== "회사 미상") existing.name = name;
      } else {
        allCompanies.set(key, { name, count: 1 });
      }
    }

    const { data: allGroupData } = await supabase
      .from("company_groups")
      .select("id,name,company_group_members(company_normalized)")
      .order("name");
    const memberLookup = new Map<string, { groupId: string; groupName: string }>();
    for (const g of (allGroupData ?? []) as unknown as {
      id: string;
      name: string;
      company_group_members: { company_normalized: string }[] | null;
    }[]) {
      for (const member of g.company_group_members ?? []) {
        memberLookup.set(member.company_normalized, { groupId: g.id, groupName: g.name });
      }
    }
    const companyOptions: CompanyOption[] = [...allCompanies.entries()]
      .map(([key, value]) => {
        const linked = memberLookup.get(key);
        return {
          key,
          name: value.name,
          count: value.count,
          groupId: linked?.groupId ?? null,
          groupName: linked?.groupName ?? null,
        };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));

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
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 p-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <Link href={companiesHref(searchQuery, sortBy, "groups")} className="text-sm text-gray-500">
              ← 회사
            </Link>
            <h1 className="truncate text-lg font-bold">
              {group?.name ?? "회사 묶음"} ({cards.length})
            </h1>
          </div>
          {members.length > 0 && (
            <p className="mt-1 truncate pl-12 text-xs text-gray-400">
              {members.map((m) => m.display_name || m.company_normalized).join(", ")}
            </p>
          )}
        </div>
        {group && (
          <CompanyGroupEditor
            group={{
              id: group.id,
              name: group.name,
              note: group.note,
              memberKeys: members.map((m) => m.company_normalized),
            }}
            companies={companyOptions}
          />
        )}
        {cards.length === 0 ? (
          <p className="p-12 text-center text-sm text-gray-400">
            이 묶음에 표시할 명함이 없습니다.
          </p>
        ) : (
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
        )}
        <TabBar />
      </main>
    );
  }

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
    const rows = (data ?? []) as unknown as CardRow[];
    const cards = toCards(rows);
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
          <Link href={companiesHref(searchQuery, sortBy)} className="text-sm text-gray-500">
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

  // ── 회사 목록 모드: company_normalized 로 그룹핑 + 회사 묶음 표시 ──
  const { data } = await supabase
    .from("cards")
    .select("company_normalized,company_ko,company_en");

  const companies = new Map<string, { name: string; count: number }>();
  for (const row of (data ?? []) as CompanyRow[]) {
    const key = row.company_normalized ?? NONE;
    const existing = companies.get(key);
    const name = displayCompany(row);
    if (existing) {
      existing.count += 1;
      if (existing.name === "회사 미상" && name !== "회사 미상") existing.name = name;
    } else {
      companies.set(key, { name, count: 1 });
    }
  }

  const list = [...companies.entries()].map(([key, v]) => ({ key, ...v }));
  if (sortBy === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  } else if (sortBy === "name_desc") {
    list.sort((a, b) => b.name.localeCompare(a.name, "ko"));
  } else {
    list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
  }

  const { data: groupData, error: groupError } = await supabase
    .from("company_groups")
    .select("id,name,note,company_group_members(company_normalized,display_name)")
    .order("name");

  const rawGroups = groupError ? [] : ((groupData ?? []) as unknown as GroupRow[]);
  const companyByKey = new Map(list.map((c) => [c.key, c]));
  const memberLookup = new Map<string, { groupId: string; groupName: string }>();

  const groups: CompanyGroupSummary[] = rawGroups.map((group) => {
    const members = group.company_group_members ?? [];
    for (const member of members) {
      memberLookup.set(member.company_normalized, { groupId: group.id, groupName: group.name });
    }
    return {
      id: group.id,
      name: group.name,
      note: group.note,
      count: members.reduce((sum, member) => sum + (companyByKey.get(member.company_normalized)?.count ?? 0), 0),
      memberNames: members.map((member) => companyByKey.get(member.company_normalized)?.name ?? member.display_name ?? member.company_normalized),
    };
  });

  if (sortBy === "name") {
    groups.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  } else if (sortBy === "name_desc") {
    groups.sort((a, b) => b.name.localeCompare(a.name, "ko"));
  } else {
    groups.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
  }

  const companyOptions: CompanyOption[] = list
    .filter((c) => c.key !== NONE)
    .map((c) => {
      const group = memberLookup.get(c.key);
      return {
        ...c,
        groupId: group?.groupId ?? null,
        groupName: group?.groupName ?? null,
      };
    });

  const standaloneList = list.filter((company) => company.key === NONE || !memberLookup.has(company.key));
  const visibleGroups = searchTerm
    ? groups.filter((group) =>
        matchesSearch([group.name, group.note, ...group.memberNames], searchTerm),
      )
    : groups;
  const visibleStandaloneList = searchTerm
    ? standaloneList.filter((company) => matchesSearch([company.name], searchTerm))
    : standaloneList;
  const visibleCount = viewMode === "groups" ? visibleGroups.length : visibleStandaloneList.length;

  const SORTS = [
    { v: "", label: "많은순" },
    { v: "name", label: "가나다" },
    { v: "name_desc", label: "역순" },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-md pb-24">
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-gray-100 bg-white/95 p-4 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold">
            회사 {list.length > 0 && `(${list.length})`}
          </h1>
          <div className="flex gap-1.5">
            {SORTS.map((s) => {
              const active = sortBy === s.v;
              return (
                <Link
                  key={s.v}
                  href={companiesHref(searchQuery, s.v, viewMode)}
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
        <CompanySearchBar
          q={searchQuery}
          sort={sortBy}
          view={viewMode}
          placeholder={viewMode === "groups" ? "묶음·회사·소개 검색" : "회사 검색"}
        />
        <div className="grid grid-cols-2 rounded-lg bg-gray-100 p-1 text-sm">
          <Link
            href={companiesHref(searchQuery, sortBy, "companies")}
            className={
              "rounded-md px-3 py-2 text-center font-medium " +
              (viewMode === "companies" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")
            }
          >
            회사
          </Link>
          <Link
            href={companiesHref(searchQuery, sortBy, "groups")}
            className={
              "rounded-md px-3 py-2 text-center font-medium " +
              (viewMode === "groups" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")
            }
          >
            묶음 관리{groups.length > 0 ? ` (${groups.length})` : ""}
          </Link>
        </div>
        {searchQuery && (
          <p className="text-xs text-gray-400">검색 결과 {visibleCount}개</p>
        )}
      </div>

      {viewMode === "groups" ? (
        <CompanyGroupManager
          companies={companyOptions}
          groups={visibleGroups}
          searchActive={Boolean(searchTerm)}
        />
      ) : visibleStandaloneList.length === 0 ? (
        <p className="p-12 text-center text-sm text-gray-400">
          {searchTerm ? "검색 결과가 없습니다." : "아직 저장된 명함이 없습니다."}
        </p>
      ) : (
        <ul>
          {visibleStandaloneList.map((g) => (
            <li key={g.key}>
              <Link
                href={companyDetailHref(g.key, searchQuery, sortBy)}
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
