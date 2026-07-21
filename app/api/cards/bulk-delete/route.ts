import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// 여러 명함 한번에 삭제 (+ 스토리지 이미지 정리). RLS 로 소유자 것만 삭제됨.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "선택된 명함이 없습니다." }, { status: 400 });
  }

  // 이미지 경로 수집 후 스토리지 정리
  const { data: cards } = await supabase
    .from("cards")
    .select("image_front_path,image_back_path")
    .in("id", ids);
  const paths = (cards ?? [])
    .flatMap((c) => [c.image_front_path, c.image_back_path])
    .filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    await supabase.storage.from("card-images").remove(paths); // best-effort
  }

  const { error } = await supabase.from("cards").delete().in("id", ids);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: ids.length });
}
