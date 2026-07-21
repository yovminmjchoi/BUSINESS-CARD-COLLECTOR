import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// 이 명함을 사람 그룹의 "현재 명함"으로 지정 (같은 person_id 의 나머지는 해제)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: card } = await supabase
    .from("cards")
    .select("person_id")
    .eq("id", id)
    .single();
  if (!card) {
    return NextResponse.json({ error: "명함을 찾을 수 없습니다." }, { status: 404 });
  }

  // 같은 사람의 모든 명함 해제 후 이 명함만 지정
  await supabase
    .from("cards")
    .update({ is_primary: false })
    .eq("person_id", card.person_id);
  const { error } = await supabase
    .from("cards")
    .update({ is_primary: true })
    .eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "지정에 실패했습니다.", detail: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
