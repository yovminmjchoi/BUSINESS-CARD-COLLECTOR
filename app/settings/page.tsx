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

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-gray-500">내보내기</span>
          <a
            href="/api/export/csv?scope=primary"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-sm text-gray-700"
          >
            CSV — 대표 명함만 (사람당 1줄)
          </a>
          <a
            href="/api/export/csv"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-sm text-gray-700"
          >
            CSV — 전체 (승진·이직 이력 포함)
          </a>
          <a
            href="/api/export/vcard"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-sm text-gray-700"
          >
            vCard — 폰 연락처용 (사람당 1개)
          </a>
          <p className="text-xs text-gray-400">
            CSV는 엑셀·구글시트·노션(Import → CSV)에서 열 수 있습니다.
            vCard(.vcf)는 아이폰/구글 연락처 가져오기용이며, 옛 명함은 연락처
            메모의 [이력]으로 들어갑니다.
          </p>
        </div>

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
