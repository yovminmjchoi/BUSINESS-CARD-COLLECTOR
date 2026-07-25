import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSalesforceNote } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 30;

// 거친 메모 → Salesforce 활동기록(영문) 생성. 저장은 안 함(클라이언트가 확인 후 저장).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: {
    myName?: string;
    rawNotes?: string;
    activity?: string;
    contactName?: string;
    contactCompany?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (!body.rawNotes || !body.rawNotes.trim()) {
    return NextResponse.json({ error: "미팅 메모를 입력하세요." }, { status: 400 });
  }

  try {
    const note = await generateSalesforceNote({
      myName: body.myName ?? "I",
      rawNotes: body.rawNotes,
      activity: body.activity ?? "meeting",
      contactName: body.contactName,
      contactCompany: body.contactCompany,
    });
    return NextResponse.json({ note });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "생성 실패" },
      { status: 502 },
    );
  }
}
