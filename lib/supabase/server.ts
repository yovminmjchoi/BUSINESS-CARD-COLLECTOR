import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 서버(RSC / Route Handler)용 Supabase 클라이언트
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // 서버 컴포넌트에서 호출되면 쓰기가 막힐 수 있음 → 미들웨어가 세션을 갱신하므로 무시 가능
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component에서의 set() 호출 무시
          }
        },
      },
    },
  );
}
