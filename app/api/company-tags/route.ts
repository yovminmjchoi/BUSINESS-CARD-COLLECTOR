import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickCompanyNormalized } from "@/lib/normalize";

export const runtime = "nodejs";

// 같은 회사(company_normalized)의 기존 명함들이 쓰는 태그 id 목록.
// 새 명함 저장 시 자동 제안용 — "같은 회사면 같은 태그".
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: { companyKo?: string | null; companyEn?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ tagIds: [] });
  }

  const normalized = pickCompanyNormalized(body.companyKo, body.companyEn);
  if (!normalized) return NextResponse.json({ tagIds: [] });

  const { data: cards } = await supabase
    .from("cards")
    .select("id")
    .eq("company_normalized", normalized)
    .limit(300);
  const ids = (cards ?? []).map((c) => c.id as string);
  if (ids.length === 0) return NextResponse.json({ tagIds: [] });

  const { data: ct } = await supabase
    .from("card_tags")
    .select("tag_id")
    .in("card_id", ids);
  const tagIds = [...new Set((ct ?? []).map((r) => r.tag_id as string))];

  return NextResponse.json({ tagIds });
}
