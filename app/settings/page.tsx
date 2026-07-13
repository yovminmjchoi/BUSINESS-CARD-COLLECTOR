import TabBar from "@/components/TabBar";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto min-h-screen max-w-md pb-24">
      <div className="border-b border-gray-100 p-4">
        <h1 className="text-lg font-bold">설정</h1>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="text-sm text-gray-600">
          로그인 계정: <span className="font-medium">{user?.email}</span>
        </div>

        <p className="text-sm text-gray-400">
          CSV/vCard 내보내기·구글시트 연동은 다음 단계에서 추가됩니다.
        </p>

        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-700"
          >
            로그아웃
          </button>
        </form>
      </div>

      <TabBar />
    </main>
  );
}
