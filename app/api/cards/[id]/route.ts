import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickCompanyNormalized } from "@/lib/normalize";

export const runtime = "nodejs";

const TEXT_FIELDS = [
  "name_ko", "name_en", "company_ko", "company_en", "department",
  "title_ko", "title_en", "mobile", "office_phone", "fax",
  "email", "website", "address_ko", "address_en",
  "person_note", "company_note",
] as const;

function clean(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function PATCH(
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

  let body: { values?: Record<string, unknown>; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const values = body.values ?? {};

  const { data: existing, error: fetchError } = await supabase
    .from("cards")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError || !existing) {
    return NextResponse.json({ error: "명함을 찾을 수 없습니다." }, { status: 404 });
  }

  const update: Record<string, string | null> = {};
  for (const f of TEXT_FIELDS) update[f] = clean(values[f]);
  update.email = update.email ? update.email.toLowerCase() : null;
  const companyNormalized = pickCompanyNormalized(
    update.company_ko,
    update.company_en,
  );

  const updatePayload: Record<string, string | null> = {
    ...update,
    company_normalized: companyNormalized,
  };
  if (body.status === "confirmed" || body.status === "review_needed") {
    updatePayload.status = body.status;
  }

  const { error: updateError } = await supabase
    .from("cards")
    .update(updatePayload)
    .eq("id", id);
  if (updateError) {
    return NextResponse.json(
      { error: "수정에 실패했습니다.", detail: updateError.message },
      { status: 500 },
    );
  }

  // 바뀐 필드만 card_edits 기록
  const edits = [];
  for (const f of TEXT_FIELDS) {
    const oldV = (existing[f] as string | null) ?? null;
    const newV = update[f];
    if ((oldV ?? "") !== (newV ?? "")) {
      edits.push({
        card_id: id,
        field: f,
        old_value: oldV,
        new_value: newV,
        source: "user_edit" as const,
      });
    }
  }
  if (edits.length > 0) {
    await supabase.from("card_edits").insert(edits);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
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
    .select("image_front_path,image_back_path")
    .eq("id", id)
    .single();

  // 스토리지 이미지 정리 (best-effort)
  const paths = [card?.image_front_path, card?.image_back_path].filter(
    (p): p is string => Boolean(p),
  );
  if (paths.length > 0) {
    await supabase.storage.from("card-images").remove(paths);
  }

  const { error } = await supabase.from("cards").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "삭제에 실패했습니다.", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
