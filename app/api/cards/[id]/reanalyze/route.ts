import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickCompanyNormalized, composeNameKo, composeNameEn } from "@/lib/normalize";
import { extractBusinessCard, type CardImage } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "card-images";

// AI 로 다시 인식 → 빈 칸만 채움(기존 값·사용자 편집 보존) + 회사 정규화 재계산.
// 처리 규칙(이름 분리 등)이 바뀐 뒤 기존 명함을 최신화할 때 사용.
const FILL_FIELDS = [
  "family_name_ko", "given_name_ko", "family_name_en", "given_name_en",
  "company_ko", "company_en", "department",
  "title_ko", "title_en", "mobile", "office_phone", "fax",
  "email", "website", "address_ko", "address_en",
] as const;

function clean(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

async function toBase64(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null,
): Promise<CardImage | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).download(path);
  if (!data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return { data: buf.toString("base64"), mimeType: "image/jpeg" };
}

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
    .select("*")
    .eq("id", id)
    .single<Record<string, string | null>>();
  if (!card) {
    return NextResponse.json({ error: "명함을 찾을 수 없습니다." }, { status: 404 });
  }

  const images = (
    await Promise.all([
      toBase64(supabase, card.image_front_path),
      toBase64(supabase, card.image_back_path),
    ])
  ).filter((x): x is CardImage => x !== null);

  if (images.length === 0) {
    return NextResponse.json(
      { error: "다시 인식할 사진이 없습니다." },
      { status: 400 },
    );
  }

  let fresh;
  try {
    fresh = await extractBusinessCard(images);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "인식 실패" },
      { status: 502 },
    );
  }

  // 빈 칸만 채움
  const update: Record<string, string | null> = {};
  const edits = [];
  for (const f of FILL_FIELDS) {
    const existing = clean(card[f]);
    if (existing !== null) continue; // 기존 값·편집 보존
    const filled = clean((fresh as unknown as Record<string, unknown>)[f]);
    if (filled !== null) {
      update[f] = f === "email" ? filled.toLowerCase() : filled;
      edits.push({
        card_id: id,
        field: f,
        old_value: null,
        new_value: update[f],
        source: "ai_extract" as const,
      });
    }
  }

  // 성/이름이 새로 채워졌으면 표시용 전체 이름도 재합성
  update.name_ko = composeNameKo(
    update.family_name_ko ?? card.family_name_ko,
    update.given_name_ko ?? card.given_name_ko,
    card.name_ko,
  );
  update.name_en = composeNameEn(
    update.family_name_en ?? card.family_name_en,
    update.given_name_en ?? card.given_name_en,
    card.name_en,
  );

  // 회사 정규화는 항상 최신 규칙으로 재계산
  update.company_normalized = pickCompanyNormalized(
    update.company_ko ?? card.company_ko,
    update.company_en ?? card.company_en,
  );

  const { error } = await supabase.from("cards").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (edits.length > 0) {
    await supabase.from("card_edits").insert(edits);
  }

  return NextResponse.json({ ok: true, filled: edits.length });
}
