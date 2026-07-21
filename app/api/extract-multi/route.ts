import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractMultipleCards } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

// 한 이미지 속 여러 명함을 추출(배열)만 반환. 크롭·저장은 클라이언트에서 처리.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const front = form.get("front");
  const clientReady = form.get("front_cropped") === "1";
  if (!(front instanceof File)) {
    return NextResponse.json({ error: "이미지가 필요합니다." }, { status: 400 });
  }

  let buf: Buffer;
  try {
    if (clientReady) buf = Buffer.from(await front.arrayBuffer());
    else {
      const { toResizedJpeg } = await import("@/lib/image");
      buf = await toResizedJpeg(front);
    }
  } catch {
    return NextResponse.json({ error: "이미지 처리에 실패했습니다." }, { status: 400 });
  }

  try {
    const cards = await extractMultipleCards({
      data: buf.toString("base64"),
      mimeType: "image/jpeg",
    });
    if (cards.length === 0) {
      return NextResponse.json({ error: "명함을 찾지 못했습니다." }, { status: 422 });
    }
    return NextResponse.json({ cards });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "인식 실패" },
      { status: 502 },
    );
  }
}
