import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { extractBusinessCard, type CardImage } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "card-images";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 콜드스타트 워밍업 (촬영 화면 진입 시 미리 호출)
export async function GET() {
  return NextResponse.json({ ok: true });
}

// 클라이언트가 이미 JPEG(축소/크롭)로 만든 경우 서버 재인코딩 생략. 아니면 sharp/HEIC 처리.
async function toBuffer(file: File, clientReady: boolean): Promise<Buffer> {
  if (clientReady) return Buffer.from(await file.arrayBuffer());
  const { toResizedJpeg } = await import("@/lib/image");
  return toResizedJpeg(file);
}

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

  const mode = String(form.get("mode") ?? ""); // "detect" | "store" | ""(둘 다)
  const clientReady = form.get("front_cropped") === "1";
  const front = form.get("front");
  const back = form.get("back");
  if (!(front instanceof File)) {
    return NextResponse.json({ error: "앞면 이미지가 필요합니다." }, { status: 400 });
  }

  let frontBuf: Buffer;
  let backBuf: Buffer | null = null;
  try {
    frontBuf = await toBuffer(front, clientReady);
    if (back instanceof File && back.size > 0) {
      backBuf = await toBuffer(back, clientReady);
    }
  } catch {
    return NextResponse.json({ error: "이미지 처리에 실패했습니다." }, { status: 400 });
  }

  // ── 감지 전용: 추출만(이미지 저장 X). 크롭 박스 미리 맞춤용 bbox 포함 ──
  if (mode === "detect") {
    const images: CardImage[] = [
      { data: frontBuf.toString("base64"), mimeType: "image/jpeg" },
    ];
    if (backBuf) images.push({ data: backBuf.toString("base64"), mimeType: "image/jpeg" });
    try {
      const extraction = await extractBusinessCard(images);
      return NextResponse.json({ extraction });
    } catch (err) {
      return NextResponse.json(
        { extraction: null, error: err instanceof Error ? err.message : "인식 실패" },
        { status: 502 },
      );
    }
  }

  // ── 저장 전용: 크롭된 이미지 업로드만(추출 X) ──
  if (mode === "store") {
    const draftIdRaw = String(form.get("draftId") ?? "");
    const draftId = UUID_RE.test(draftIdRaw) ? draftIdRaw : randomUUID();
    const base = `${user.id}/${draftId}`;
    const imageFrontPath = `${base}/front.jpg`;
    const imageBackPath = backBuf ? `${base}/back.jpg` : null;

    const ups = [
      supabase.storage
        .from(BUCKET)
        .upload(imageFrontPath, frontBuf, { contentType: "image/jpeg", upsert: true }),
    ];
    if (backBuf && imageBackPath) {
      ups.push(
        supabase.storage
          .from(BUCKET)
          .upload(imageBackPath, backBuf, { contentType: "image/jpeg", upsert: true }),
      );
    }
    const [fu] = await Promise.all(ups);
    if (fu.error) {
      return NextResponse.json({ error: "이미지 업로드에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ draftId, imageFrontPath, imageBackPath });
  }

  // ── 기본(호환): 추출 + 저장 동시 ──
  const draftIdRaw = String(form.get("draftId") ?? "");
  const draftId = UUID_RE.test(draftIdRaw) ? draftIdRaw : randomUUID();
  const base = `${user.id}/${draftId}`;
  const imageFrontPath = `${base}/front.jpg`;
  const imageBackPath = backBuf ? `${base}/back.jpg` : null;

  const images: CardImage[] = [
    { data: frontBuf.toString("base64"), mimeType: "image/jpeg" },
  ];
  if (backBuf) images.push({ data: backBuf.toString("base64"), mimeType: "image/jpeg" });

  const [ex, fu] = await Promise.all([
    extractBusinessCard(images)
      .then((e) => ({ extraction: e, err: null as string | null }))
      .catch((e) => ({ extraction: null, err: e instanceof Error ? e.message : "추출 실패" })),
    supabase.storage
      .from(BUCKET)
      .upload(imageFrontPath, frontBuf, { contentType: "image/jpeg", upsert: true }),
    backBuf && imageBackPath
      ? supabase.storage
          .from(BUCKET)
          .upload(imageBackPath, backBuf, { contentType: "image/jpeg", upsert: true })
      : Promise.resolve({ error: null }),
  ]);

  if (fu.error) {
    return NextResponse.json({ error: "이미지 업로드에 실패했습니다." }, { status: 500 });
  }
  if (ex.err) {
    return NextResponse.json(
      { draftId, imageFrontPath, imageBackPath, extraction: null, error: ex.err },
      { status: 502 },
    );
  }
  return NextResponse.json({ draftId, imageFrontPath, imageBackPath, extraction: ex.extraction });
}
