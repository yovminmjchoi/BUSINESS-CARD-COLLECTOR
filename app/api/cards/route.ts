import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickCompanyNormalized } from "@/lib/normalize";
import type { CardExtraction } from "@/lib/gemini";

export const runtime = "nodejs";

// card_edits 로 이력을 남길 텍스트 필드 (card 컬럼명과 1:1)
const TRACKED_FIELDS: (keyof CardExtraction)[] = [
  "name_ko", "name_en",
  "family_name_ko", "given_name_ko", "family_name_en", "given_name_en",
  "company_ko", "company_en", "department",
  "title_ko", "title_en", "mobile", "office_phone", "fax",
  "email", "website", "address_ko", "address_en",
];

interface SaveBody {
  values: CardExtraction;
  extraction: CardExtraction | null; // AI 원본 (수동 입력 시 null)
  imageFrontPath: string | null;
  imageBackPath: string | null;
  personNote?: string | null;
  companyNote?: string | null;
  tagIds?: string[];
  personId?: string | null; // 같은 사람으로 연결 시 기존 명함의 person_id
  setPrimary?: boolean; // 이 명함을 사람 그룹의 현재(대표) 명함으로
}

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

  let body: SaveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body?.values) {
    return NextResponse.json({ error: "저장할 데이터가 없습니다." }, { status: 400 });
  }

  const v = body.values;
  const companyNormalized = pickCompanyNormalized(v.company_ko, v.company_en);

  // 상태: 확신도 low 또는 이름·이메일·전화 모두 비면 검토 필요
  const hasCore =
    clean(v.name_ko) || clean(v.name_en) || clean(v.email) ||
    clean(v.mobile) || clean(v.office_phone);
  const status =
    v.confidence === "low" || !hasCore ? "review_needed" : "confirmed";

  // 카드 INSERT (owner_id 는 RLS/기본값이 auth.uid() 이지만 명시)
  const { data: inserted, error: insertError } = await supabase
    .from("cards")
    .insert({
      owner_id: user.id,
      ...(body.personId ? { person_id: body.personId } : {}),
      status,
      name_ko: clean(v.name_ko),
      name_en: clean(v.name_en),
      family_name_ko: clean(v.family_name_ko),
      given_name_ko: clean(v.given_name_ko),
      family_name_en: clean(v.family_name_en),
      given_name_en: clean(v.given_name_en),
      company_ko: clean(v.company_ko),
      company_en: clean(v.company_en),
      company_normalized: companyNormalized,
      department: clean(v.department),
      title_ko: clean(v.title_ko),
      title_en: clean(v.title_en),
      mobile: clean(v.mobile),
      office_phone: clean(v.office_phone),
      fax: clean(v.fax),
      email: clean(v.email)?.toLowerCase() ?? null,
      website: clean(v.website),
      address_ko: clean(v.address_ko),
      address_en: clean(v.address_en),
      language: v.language ?? null,
      confidence: v.confidence ?? null,
      person_note: clean(body.personNote),
      company_note: clean(body.companyNote),
      image_front_path: body.imageFrontPath,
      image_back_path: body.imageBackPath,
      extraction_notes: clean(body.extraction?.notes),
      extraction_raw: body.extraction ?? null,
    })
    .select("id,person_id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: "저장에 실패했습니다.", detail: insertError?.message },
      { status: 500 },
    );
  }

  // card_edits: AI 원본 스냅샷 + 사용자가 바꾼 값 기록
  const ai = body.extraction;
  const edits: {
    card_id: string;
    field: string;
    old_value: string | null;
    new_value: string | null;
    source: "ai_extract" | "user_edit";
  }[] = [];

  for (const field of TRACKED_FIELDS) {
    const aiVal = clean(ai?.[field]);
    const finalVal = clean(v[field]);
    if (aiVal !== null) {
      edits.push({ card_id: inserted.id, field, old_value: null, new_value: aiVal, source: "ai_extract" });
    }
    if (finalVal !== aiVal) {
      edits.push({ card_id: inserted.id, field, old_value: aiVal, new_value: finalVal, source: "user_edit" });
    }
  }

  if (edits.length > 0) {
    // 이력 실패는 저장 성공을 막지 않음 (best-effort)
    await supabase.from("card_edits").insert(edits);
  }

  // 태그 연결
  if (Array.isArray(body.tagIds) && body.tagIds.length > 0) {
    await supabase.from("card_tags").insert(
      body.tagIds.map((tagId) => ({ card_id: inserted.id, tag_id: tagId })),
    );
  }

  // 현재(대표) 명함 지정: 같은 사람의 나머지 해제 후 이 명함만 지정
  if (body.setPrimary) {
    await supabase
      .from("cards")
      .update({ is_primary: false })
      .eq("person_id", inserted.person_id);
    await supabase
      .from("cards")
      .update({ is_primary: true })
      .eq("id", inserted.id);
  }

  return NextResponse.json({ id: inserted.id, status });
}
