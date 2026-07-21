import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickCompanyNormalized, composeNameKo, composeNameEn } from "@/lib/normalize";

export const runtime = "nodejs";

const TEXT_FIELDS = [
  "name_ko", "name_en",
  "family_name_ko", "given_name_ko", "family_name_en", "given_name_en",
  "company_ko", "company_en", "department",
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

  let body: {
    values?: Record<string, unknown>;
    status?: string;
    tagIds?: string[];
    merge?: boolean; // true=빈 칸만 채움(기존 우선), false=덮어쓰기(신규 우선)
    imageFrontPath?: string | null;
    imageBackPath?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const values = body.values ?? {};
  const merge = body.merge === true;

  const { data: existing, error: fetchError } = await supabase
    .from("cards")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError || !existing) {
    return NextResponse.json({ error: "명함을 찾을 수 없습니다." }, { status: 404 });
  }

  // merge=병합(기존 값 우선, 빈 칸만 신규로 채움) / 아니면 신규 값으로 덮어쓰기
  const update: Record<string, string | null> = {};
  for (const f of TEXT_FIELDS) {
    const incoming = clean(values[f]);
    update[f] = merge
      ? (clean(existing[f]) ?? incoming)
      : incoming;
  }
  update.email = update.email ? update.email.toLowerCase() : null;
  // 표시용 전체 이름은 성/이름으로 재합성 (편집 폼엔 성/이름만 있으므로).
  // 편집 폼이 성/이름 키를 보내면(=사용자가 그 칸을 편집) 비웠을 때 실제로 비워지도록
  // 기존 name_ko 로 되돌리지 않는다. merge(병합)이거나 그 키가 아예 없을 때만 기존값 유지.
  const koEdited = "family_name_ko" in values || "given_name_ko" in values;
  const enEdited = "family_name_en" in values || "given_name_en" in values;
  update.name_ko = composeNameKo(
    update.family_name_ko,
    update.given_name_ko,
    merge || !koEdited ? (existing.name_ko as string | null) : null,
  );
  update.name_en = composeNameEn(
    update.family_name_en,
    update.given_name_en,
    merge || !enEdited ? (existing.name_en as string | null) : null,
  );
  const companyNormalized = pickCompanyNormalized(
    update.company_ko,
    update.company_en,
  );

  const updatePayload: Record<string, string | null> = {
    ...update,
    company_normalized: companyNormalized,
  };

  // 새 이미지 경로 (병합/덮어쓰기 시 전달됨)
  if ("imageFrontPath" in body) {
    updatePayload.image_front_path = merge
      ? ((existing.image_front_path as string | null) ?? body.imageFrontPath ?? null)
      : (body.imageFrontPath ?? (existing.image_front_path as string | null));
  }
  if ("imageBackPath" in body) {
    updatePayload.image_back_path = merge
      ? ((existing.image_back_path as string | null) ?? body.imageBackPath ?? null)
      : (body.imageBackPath ?? (existing.image_back_path as string | null));
  }

  // 상태: 명시되면 사용, 아니면 결과값 기준 재판정
  if (body.status === "confirmed" || body.status === "review_needed") {
    updatePayload.status = body.status;
  } else if (merge || "imageFrontPath" in body) {
    const hasCore =
      update.name_ko || update.name_en || update.email ||
      update.mobile || update.office_phone;
    updatePayload.status =
      existing.confidence === "low" || !hasCore ? "review_needed" : "confirmed";
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

  // 태그 재설정 (tagIds 가 전달된 경우에만): 기존 연결 삭제 후 재삽입
  if (Array.isArray(body.tagIds)) {
    await supabase.from("card_tags").delete().eq("card_id", id);
    if (body.tagIds.length > 0) {
      await supabase.from("card_tags").insert(
        body.tagIds.map((tagId) => ({ card_id: id, tag_id: tagId })),
      );
    }
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
