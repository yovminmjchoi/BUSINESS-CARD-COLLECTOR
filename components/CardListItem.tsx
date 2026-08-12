import Link from "next/link";

export interface CardListTag {
  id: string;
  name: string;
  color: string | null;
}

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
  tags: CardListTag[];
}

export default function CardListItem({
  card,
  thumbUrl,
  groupCount = 1,
  selectMode = false,
  selected = false,
  onToggle,
}: {
  card: CardListData;
  thumbUrl: string | null;
  groupCount?: number;
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const name = card.name_ko || card.name_en || "(이름 없음)";
  const company = card.company_ko || card.company_en || "";
  const title = card.title_ko || card.title_en || "";
  const sub = [company, title].filter(Boolean).join(" · ");

  const inner = (
    <>
      {selectMode && (
        <span
          className={
            "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[11px] " +
            (selected ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-transparent")
          }
        >
          ✓
        </span>
      )}
      {thumbUrl ? (
        // List view intentionally uses a dedicated tiny thumbnail, never the full card image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-14 w-14 flex-shrink-0 rounded bg-gray-50 object-contain"
        />
      ) : (
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] text-gray-400">
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
          {groupCount > 1 && (
            <span className="flex-shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
              외 {groupCount - 1}장
            </span>
          )}
        </div>
        {sub && <div className="truncate text-sm text-gray-500">{sub}</div>}
        {card.tags.length > 0 && (
          <div className="mt-1 flex gap-1">
            {card.tags.slice(0, 2).map((t) => (
              <span
                key={t.id}
                className="rounded-full px-1.5 py-0.5 text-[10px] text-white"
                style={{ backgroundColor: t.color ?? "#6b7280" }}
              >
                {t.name}
              </span>
            ))}
            {card.tags.length > 2 && (
              <span className="text-[10px] text-gray-400">
                +{card.tags.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );

  const cls =
    "flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left active:bg-gray-50 " +
    (selected ? "bg-blue-50" : "");

  if (selectMode) {
    return (
      <button type="button" onClick={onToggle} className={cls}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={`/card/${card.id}`} className={cls}>
      {inner}
    </Link>
  );
}
