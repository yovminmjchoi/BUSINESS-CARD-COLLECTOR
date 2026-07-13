export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">명함 정리</h1>
      <p className="text-gray-600">
        초기 세팅 완료. 다음 단계에서 로그인·촬영·목록 화면을 추가합니다.
      </p>
      <p className="text-sm text-gray-400">
        (개발 순서 4단계: Supabase Auth 매직 링크부터)
      </p>
    </main>
  );
}
