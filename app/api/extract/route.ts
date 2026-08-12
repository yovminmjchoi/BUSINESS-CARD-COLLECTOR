import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { extractBusinessCard, type CardImage } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "card-images";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UploadFailure = { message: string };

export async function GET() {
  return NextResponse.json({ ok: true });
}

async function toBuffer(file: File, clientReady: boolean): Promise<Buffer> {
  if (clientReady) return Buffer.from(await file.arrayBuffer());
  const { toResizedJpeg } = await import("@/lib/image");
  return toResizedJpeg(file);
}

async function makeThumbnail(frontBuf: Buffer): Promise<Buffer> {
  return sharp(frontBuf)
    .rotate()
    .resize({ width: 240, height: 240, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70, progressive: true })
    .toBuffer();
}

function uploadFailure(error: unknown): UploadFailure {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return { message: error.message };
  }
  return { message: "알 수 없는 업로드 오류" };
}

function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const statusCode =
    "statusCode" in error && typeof error.statusCode === "string" ? error.statusCode : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return statusCode === "404" || /not found/i.test(message);
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

  const mode = String(form.get("mode") ?? "");
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

  const draftIdRaw = String(form.get("draftId") ?? "");
  const draftId = UUID_RE.test(draftIdRaw) ? draftIdRaw : randomUUID();
  const base = `${user.id}/${draftId}`;
  const imageFrontPath = `${base}/front.jpg`;
  const imageBackPath = backBuf ? `${base}/back.jpg` : null;
  const thumbnailPath = `${base}/thumb.jpg`;

  let thumbBuf: Buffer;
  try {
    thumbBuf = await makeThumbnail(frontBuf);
  } catch {
    return NextResponse.json(
      { error: "목록용 썸네일 생성에 실패했습니다. 원본 이미지는 저장하지 않았습니다." },
      { status: 500 },
    );
  }

  const uploadFiles = async (): Promise<UploadFailure | null> => {
    const requestPaths = new Set(
      [imageFrontPath, thumbnailPath, imageBackPath].filter((path): path is string => Boolean(path)),
    );
    const createdPaths: string[] = [];

    const cleanupRequestUploads = async () => {
      const cleanupPaths = [...new Set(createdPaths)].filter(
        (path) => requestPaths.has(path) && path.startsWith(`${base}/`),
      );
      if (cleanupPaths.length === 0) return;

      const { error } = await supabase.storage.from(BUCKET).remove(cleanupPaths);
      if (error) {
        console.error("Partial image upload cleanup failed", {
          draftId,
          message: error.message,
        });
      }
    };

    for (const path of requestPaths) {
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (data && !error) {
        return { message: "이미 같은 임시 이미지 경로가 있습니다. 다시 촬영해 주세요." };
      }
      if (error && !isMissingObjectError(error)) {
        return uploadFailure(error);
      }
    }

    const uploadOne = async (
      path: string,
      body: Buffer,
      options: { contentType: string; cacheControl?: string },
    ): Promise<UploadFailure | null> => {
      try {
        const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
          ...options,
          upsert: false,
        });
        if (error) return uploadFailure(error);
        createdPaths.push(path);
        return null;
      } catch (error) {
        return uploadFailure(error);
      }
    };

    const filesToUpload: {
      path: string;
      body: Buffer;
      options: { contentType: string; cacheControl?: string };
    }[] = [
      { path: imageFrontPath, body: frontBuf, options: { contentType: "image/jpeg" } },
      {
        path: thumbnailPath,
        body: thumbBuf,
        options: { contentType: "image/jpeg", cacheControl: "31536000" },
      },
    ];
    if (backBuf && imageBackPath) {
      filesToUpload.push({
        path: imageBackPath,
        body: backBuf,
        options: { contentType: "image/jpeg" },
      });
    }

    for (const file of filesToUpload) {
      const error = await uploadOne(file.path, file.body, file.options);
      if (error) {
        await cleanupRequestUploads();
        return error;
      }
    }

    return null;
  };

  if (mode === "store") {
    const uploadError = await uploadFiles();
    if (uploadError) {
      return NextResponse.json(
        { error: "이미지 업로드에 실패했습니다.", detail: uploadError.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ draftId, imageFrontPath, imageBackPath, thumbnailPath });
  }

  const images: CardImage[] = [
    { data: frontBuf.toString("base64"), mimeType: "image/jpeg" },
  ];
  if (backBuf) images.push({ data: backBuf.toString("base64"), mimeType: "image/jpeg" });

  const [ex, uploadError] = await Promise.all([
    extractBusinessCard(images)
      .then((e) => ({ extraction: e, err: null as string | null }))
      .catch((e) => ({ extraction: null, err: e instanceof Error ? e.message : "추출 실패" })),
    uploadFiles(),
  ]);

  if (uploadError) {
    return NextResponse.json(
      { error: "이미지 업로드에 실패했습니다.", detail: uploadError.message },
      { status: 500 },
    );
  }
  if (ex.err) {
    return NextResponse.json(
      { draftId, imageFrontPath, imageBackPath, thumbnailPath, extraction: null, error: ex.err },
      { status: 502 },
    );
  }
  return NextResponse.json({
    draftId,
    imageFrontPath,
    imageBackPath,
    thumbnailPath,
    extraction: ex.extraction,
  });
}
