import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 화이트리스트: ALLOWED_LOGIN_EMAIL 과 일치할 때만 실제로 매직 링크 발송.
// 불일치여도 동일한 성공 메시지를 반환해 소유자 이메일이 노출되지 않게 함.
export async function POST(request: Request) {
  const genericSuccess = {
    message: "로그인 링크를 이메일로 보냈습니다. 메일함을 확인하세요.",
  };

  let email: unknown;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "이메일을 입력하세요." }, { status: 400 });
  }

  const normalized = email.toLowerCase().trim();
  const allowed = process.env.ALLOWED_LOGIN_EMAIL?.toLowerCase().trim();

  // 화이트리스트 불일치 → 성공한 척, 실제 발송 안 함
  if (!allowed || normalized !== allowed) {
    return NextResponse.json(genericSuccess);
  }

  const supabase = await createClient();
  const origin =
    request.headers.get("origin") ?? new URL(request.url).origin;

  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    return NextResponse.json(
      { error: "메일 발송에 실패했습니다. 잠시 후 다시 시도하세요." },
      { status: 500 },
    );
  }

  return NextResponse.json(genericSuccess);
}
