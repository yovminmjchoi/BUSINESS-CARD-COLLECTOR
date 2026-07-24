import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const NONE = "__none__";

function clean(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: { name?: string; note?: string | null; companyKeys?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const name = clean(body.name);
  const note = clean(body.note);
  const keys = [...new Set((body.companyKeys ?? []).map((k) => k.trim()).filter((k) => k && k !== NONE))];
  if (!name) {
    return NextResponse.json({ error: "묶음 이름을 입력하세요." }, { status: 400 });
  }
  if (keys.length < 2) {
    return NextResponse.json({ error: "회사 2개 이상을 선택하세요." }, { status: 400 });
  }

  const { data: cardRows, error: cardError } = await supabase
    .from("cards")
    .select("company_normalized,company_ko,company_en")
    .in("company_normalized", keys);

  if (cardError) {
    return NextResponse.json({ error: cardError.message }, { status: 500 });
  }

  const displayByKey = new Map<string, string>();
  for (const row of (cardRows ?? []) as {
    company_normalized: string | null;
    company_ko: string | null;
    company_en: string | null;
  }[]) {
    if (!row.company_normalized) continue;
    if (!displayByKey.has(row.company_normalized)) {
      displayByKey.set(row.company_normalized, row.company_ko || row.company_en || row.company_normalized);
    }
  }

  const missing = keys.filter((k) => !displayByKey.has(k));
  if (missing.length > 0) {
    return NextResponse.json({ error: "선택한 회사 중 찾을 수 없는 회사가 있습니다." }, { status: 400 });
  }

  const { data: group, error: groupError } = await supabase
    .from("company_groups")
    .insert({ owner_id: user.id, name, note })
    .select("id,name")
    .single();

  if (groupError || !group) {
    if (groupError?.code === "23505") {
      return NextResponse.json({ error: "이미 있는 묶음 이름입니다." }, { status: 409 });
    }
    return NextResponse.json({ error: groupError?.message ?? "묶음 생성에 실패했습니다." }, { status: 500 });
  }

  const { error: memberError } = await supabase
    .from("company_group_members")
    .insert(
      keys.map((companyKey) => ({
        group_id: group.id,
        owner_id: user.id,
        company_normalized: companyKey,
        display_name: displayByKey.get(companyKey) ?? companyKey,
      })),
    );

  if (memberError) {
    await supabase.from("company_groups").delete().eq("id", group.id);
    if (memberError.code === "23505") {
      return NextResponse.json({ error: "이미 다른 묶음에 들어간 회사가 있습니다." }, { status: 409 });
    }
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ group });
}
