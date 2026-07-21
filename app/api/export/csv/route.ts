import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCardsForExport } from "@/lib/export/fetch";
import { buildCsv } from "@/lib/export/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const cards = await fetchCardsForExport(supabase);
    const csv = buildCsv(cards);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="business-cards-${date}.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "내보내기 실패" },
      { status: 500 },
    );
  }
}
