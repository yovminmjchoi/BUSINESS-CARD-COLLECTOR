import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CardDetail, { type CardEdit } from "@/components/CardDetail";

export const dynamic = "force-dynamic";

const FLASH: Record<string, string> = {
  saved: "저장되었습니다.",
  merged: "기존 명함에 병합되었습니다.",
  updated: "기존 명함을 덮어썼습니다.",
};

export default async function CardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { id } = await params;
  const { done } = await searchParams;
  const flash = done ? FLASH[done] ?? null : null;
  const supabase = await createClient();

  const { data: card } = await supabase
    .from("cards")
    .select("*")
    .eq("id", id)
    .single();

  if (!card) notFound();

  const { data: edits } = await supabase
    .from("card_edits")
    .select("id,field,old_value,new_value,source,edited_at")
    .eq("card_id", id)
    .order("edited_at", { ascending: false });

  const { data: cardTags } = await supabase
    .from("card_tags")
    .select("tag_id")
    .eq("card_id", id);
  const tagIds = (cardTags ?? []).map((r) => r.tag_id as string);

  async function signed(path: string | null): Promise<string | null> {
    if (!path) return null;
    const { data } = await supabase.storage
      .from("card-images")
      .createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  }

  const [frontUrl, backUrl] = await Promise.all([
    signed(card.image_front_path),
    signed(card.image_back_path),
  ]);

  return (
    <CardDetail
      card={card}
      edits={(edits ?? []) as CardEdit[]}
      initialTagIds={tagIds}
      frontUrl={frontUrl}
      backUrl={backUrl}
      flash={flash}
    />
  );
}
