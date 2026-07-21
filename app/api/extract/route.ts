import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { extractBusinessCard, type CardImage } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "card-images";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 콜드스타트 워밍업용 (촬영 화면 진입 시 미리 호출)
export async function GET() {
  return NextResponse.json({ ok: true });
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

  const front = form.get("front");
  const back = form.get("back");
  if (!(front instanceof File)) {
    return NextResponse.json({ error: "앞면 이미지가 필요합니다." }, { status: 400 });
  }

  // 클라이언트에서 축소·크롭을 이미 거친 경우(front_cropped=1):
  // 서버 재인코딩 없이 그대로 사용 (sharp/HEIC 로드 자체를 생략 → 빠름)
  const clientCropped = form.get("front_cropped") === "1";

  let frontJpeg: Buffer;
  let backJpeg: Buffer | null = null;
  try {
    if (clientCropped) {
      frontJpeg = Buffer.from(await front.arrayBuffer());
      if (back instanceof File && back.size > 0) {
        backJpeg = Buffer.from(await back.arrayBuffer());
      }
    } else {
      const { toResizedJpeg } = await import("@/lib/image");
      frontJpeg = await toResizedJpeg(front);
      if (back instanceof File && back.size > 0) {
        backJpeg = await toResizedJpeg(back);
      }
    }
  } catch {
    return NextResponse.json({ error: "이미지 처리에 실패했습니다." }, { status: 400 });
  }

  // 재추출(뒷면 추가 등) 시 같은 draftId 재사용 → 파일 덮어쓰기, 고아 파일 방지
  const draftIdRaw = String(form.get("draftId") ?? "");
  const draftId = UUID_RE.test(draftIdRaw) ? draftIdRaw : randomUUID();
  const basePath = `${user.id}/${draftId}`;
  const imageFrontPath = `${basePath}/front.jpg`;
  const imageBackPath = backJpeg ? `${basePath}/back.jpg` : null;

  const images: CardImage[] = [
    { data: frontJpeg.toString("base64"), mimeType: "image/jpeg" },
  ];
  if (backJpeg) {
    images.push({ data: backJpeg.toString("base64"), mimeType: "image/jpeg" });
  }

  // Gemini 추출 시작 (업로드와 병렬)
  const extractPromise = extractBusinessCard(images)
    .then((e) => ({ extraction: e, extractErr: null as string | null }))
    .catch((err) => ({
      extraction: null,
      extractErr: err instanceof Error ? err.message : "추출에 실패했습니다.",
    }));

  const uploadFront = (buf: Buffer) =>
    supabase.storage
      .from(BUCKET)
      .upload(imageFrontPath, buf, { contentType: "image/jpeg", upsert: true });
  const uploadBack = () =>
    backJpeg && imageBackPath
      ? supabase.storage
          .from(BUCKET)
          .upload(imageBackPath, backJpeg, { contentType: "image/jpeg", upsert: true })
      : Promise.resolve({ error: null });

  let extraction: Awaited<typeof extractPromise>["extraction"] = null;
  let extractErr: string | null = null;
  let frontUploadError: unknown = null;

  if (clientCropped) {
    // 완전 병렬: 사용자가 이미 크롭했으므로 저장본이 추출 결과와 무관
    const [ex, fu] = await Promise.all([extractPromise, uploadFront(frontJpeg), uploadBack()]);
    extraction = ex.extraction;
    extractErr = ex.extractErr;
    frontUploadError = fu.error;
  } else {
    // 자동 크롭 경로: 추출 → bbox 크롭 → 업로드
    const ex = await extractPromise;
    extraction = ex.extraction;
    extractErr = ex.extractErr;
    let frontOut = frontJpeg;
    if (extraction?.card_bbox) {
      try {
        const { cropByBbox } = await import("@/lib/image");
        frontOut = await cropByBbox(frontJpeg, extraction.card_bbox);
      } catch {
        // 크롭 실패는 무시하고 원본 저장
      }
    }
    const [fu] = await Promise.all([uploadFront(frontOut), uploadBack()]);
    frontUploadError = fu.error;
  }

  if (frontUploadError) {
    return NextResponse.json({ error: "이미지 업로드에 실패했습니다." }, { status: 500 });
  }

  if (extractErr) {
    return NextResponse.json(
      { draftId, imageFrontPath, imageBackPath, extraction: null, error: extractErr },
      { status: 502 },
    );
  }

  return NextResponse.json({ draftId, imageFrontPath, imageBackPath, extraction });
}
