import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const FIELDS: { key: string; label: string }[] = [
  { key: "name_ko", label: "이름 (한글)" },
  { key: "name_en", label: "이름 (영문)" },
  { key: "company_ko", label: "회사 (한글)" },
  { key: "company_en", label: "회사 (영문)" },
  { key: "department", label: "부서" },
  { key: "title_ko", label: "직함 (한글)" },
  { key: "title_en", label: "직함 (영문)" },
  { key: "mobile", label: "휴대폰" },
  { key: "office_phone", label: "유선전화" },
  { key: "fax", label: "팩스" },
  { key: "email", label: "이메일" },
  { key: "website", label: "웹사이트" },
  { key: "address_ko", label: "주소 (한글)" },
  { key: "address_en", label: "주소 (영문)" },
];

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: card } = await supabase
    .from("cards")
    .select("*")
    .eq("id", id)
    .single();

  if (!card) notFound();

  let imageUrl: string | null = null;
  if (card.image_front_path) {
    const { data } = await supabase.storage
      .from("card-images")
      .createSignedUrl(card.image_front_path, 300);
    imageUrl = data?.signedUrl ?? null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-gray-500">
          ← 목록
        </Link>
        {card.status === "review_needed" && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            검토 필요
          </span>
        )}
      </header>

      <h1 className="text-xl font-bold">
        {card.name_ko || card.name_en || "(이름 없음)"}
      </h1>

      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt="명함"
          className="w-full rounded-lg border border-gray-200 object-contain"
        />
      )}

      <dl className="flex flex-col divide-y divide-gray-100 rounded-lg border border-gray-200">
        {FIELDS.filter((f) => card[f.key]).map((f) => (
          <div key={f.key} className="flex justify-between gap-4 px-3 py-2">
            <dt className="text-xs text-gray-500">{f.label}</dt>
            <dd className="text-right text-sm text-gray-900">{card[f.key]}</dd>
          </div>
        ))}
      </dl>

      {(card.person_note || card.company_note) && (
        <div className="flex flex-col gap-2 rounded-lg bg-gray-50 p-3 text-sm">
          {card.person_note && (
            <div>
              <span className="text-xs text-gray-500">인물 메모</span>
              <p>{card.person_note}</p>
            </div>
          )}
          {card.company_note && (
            <div>
              <span className="text-xs text-gray-500">회사 메모</span>
              <p>{card.company_note}</p>
            </div>
          )}
        </div>
      )}

      <p className="text-center text-xs text-gray-400">
        편집·삭제·편집 이력은 다음 단계(9)에서 추가됩니다.
      </p>
    </main>
  );
}
