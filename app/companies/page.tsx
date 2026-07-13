import TabBar from "@/components/TabBar";

export const dynamic = "force-dynamic";

export default function CompaniesPage() {
  return (
    <main className="mx-auto min-h-screen max-w-md pb-24">
      <div className="border-b border-gray-100 p-4">
        <h1 className="text-lg font-bold">회사별</h1>
      </div>
      <p className="p-12 text-center text-sm text-gray-400">
        회사별 그룹 보기는 11단계에서 추가됩니다.
      </p>
      <TabBar />
    </main>
  );
}
