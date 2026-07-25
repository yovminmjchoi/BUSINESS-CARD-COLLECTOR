import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function clean(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// GET /api/meetings            → 전체(캘린더용, 명함 이름 포함)
// GET /api/meetings?cardId=..  → 그 명함의 미팅만
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const cardId = new URL(request.url).searchParams.get("cardId");
  let query = supabase
    .from("meetings")
    .select("id,card_id,meeting_date,activity,raw_notes,sf_note,created_at,cards(name_ko,name_en,company_ko,company_en)")
    .order("meeting_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (cardId) query = query.eq("card_id", cardId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meetings: data ?? [] });
}

// POST /api/meetings  → 미팅 생성
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: {
    cardId?: string | null;
    meetingDate?: string;
    activity?: string;
    rawNotes?: string;
    sfNote?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const row = {
    owner_id: user.id,
    card_id: clean(body.cardId),
    meeting_date: clean(body.meetingDate) ?? new Date().toISOString().slice(0, 10),
    activity: clean(body.activity) ?? "meeting",
    raw_notes: clean(body.rawNotes),
    sf_note: clean(body.sfNote),
  };

  const { data, error } = await supabase
    .from("meetings")
    .insert(row)
    .select("id,card_id,meeting_date,activity,raw_notes,sf_note,created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meeting: data });
}
