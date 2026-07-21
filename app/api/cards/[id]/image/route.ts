import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toResizedJpeg } from "@/lib/image";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "card-images";
const COLUMN: Record<string, "image_front_path" | "image_back_path"> = {
  front: "image_front_path",
  back: "image_back_path",
};

// 저장된 명함의 사진 교체/추가 (크롭 결과 업로드 포함).
// 새 파일명으로 올리고 카드 행 갱신 후 옛 파일 삭제 → CDN 캐시 문제 회피.
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const side = String(form.get("side") ?? "");
  const file = form.get("file");
  const column = COLUMN[side];
  if (!column || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "side/file 이 필요합니다." }, { status: 400 });
  }

  const { data: card } = await supabase
    .from("cards")
    .select(`id,${column}`)
    .eq("id", id)
    .single<Record<string, string | null>>();
  if (!card) {
    return NextResponse.json({ error: "명함을 찾을 수 없습니다." }, { status: 404 });
  }
  const oldPath = card[column];

  let jpeg: Buffer;
  try {
    jpeg = await toResizedJpeg(file);
  } catch {
    return NextResponse.json({ error: "이미지 처리에 실패했습니다." }, { status: 400 });
  }

  const newPath = `${user.id}/${id}/${side}-${Date.now()}.jpg`;
  const up = await supabase.storage
    .from(BUCKET)
    .upload(newPath, jpeg, { contentType: "image/jpeg", upsert: true });
  if (up.error) {
    return NextResponse.json({ error: "업로드에 실패했습니다." }, { status: 500 });
  }

  const { error: updErr } = await supabase
    .from("cards")
    .update({ [column]: newPath })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  if (oldPath && oldPath !== newPath) {
    await supabase.storage.from(BUCKET).remove([oldPath]); // best-effort
  }

  return NextResponse.json({ ok: true, path: newPath });
}

// 사진만 삭제 (카드는 유지)
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

  const side = new URL(request.url).searchParams.get("side") ?? "";
  const column = COLUMN[side];
  if (!column) {
    return NextResponse.json({ error: "side 가 필요합니다." }, { status: 400 });
  }

  const { data: card } = await supabase
    .from("cards")
    .select(`id,${column}`)
    .eq("id", id)
    .single<Record<string, string | null>>();
  if (!card) {
    return NextResponse.json({ error: "명함을 찾을 수 없습니다." }, { status: 404 });
  }

  const oldPath = card[column];
  const { error } = await supabase
    .from("cards")
    .update({ [column]: null })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (oldPath) {
    await supabase.storage.from(BUCKET).remove([oldPath]);
  }
  return NextResponse.json({ ok: true });
}
