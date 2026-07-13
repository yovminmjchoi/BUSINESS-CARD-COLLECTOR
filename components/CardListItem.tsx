import Link from "next/link";

export interface CardListData {
  id: string;
  name_ko: string | null;
  name_en: string | null;
  company_ko: string | null;
  company_en: string | null;
  title_ko: string | null;
  title_en: string | null;
  status: string;
  image_front_path: string | null;
}

export default function CardListItem({
  card,
  thumbUrl,
}: {
  card: CardListData;
  thumbUrl: string | null;
}) {
  const name = card.name_ko || card.name_en || "(이름 없음)";
  const company = card.company_ko || card.company_en || "";
  const title = card.title_ko || card.title_en || "";
  const sub = [company, title].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/card/${card.id}`}
      className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 active:bg-gray-50"
    >
      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt=""
          className="h-12 w-16 flex-shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-12 w-16 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] text-gray-400">
          이미지
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-gray-900">{name}</span>
          {card.status === "review_needed" && (
            <span className="flex-shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              검토
            </span>
          )}
        </div>
        {sub && <div className="truncate text-sm text-gray-500">{sub}</div>}
      </div>
    </Link>
  );
}
