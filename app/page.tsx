import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">명함 정리</h1>
      <p className="text-gray-600">로그인 완료 ✓</p>
      <p className="text-sm text-gray-500">{user?.email}</p>
      <p className="text-sm text-gray-400">
        다음 단계에서 촬영·목록 화면을 추가합니다. (개발 순서 5단계)
      </p>

      <form action="/api/auth/logout" method="post" className="mt-4">
        <button
          type="submit"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
        >
          로그아웃
        </button>
      </form>
    </main>
  );
}
