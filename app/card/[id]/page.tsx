import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CardDetail, { type CardEdit } from "@/components/CardDetail";

export const dynamic = "force-dynamic";

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

  // 같은 사람(person_id)의 다른 명함 = 경력 이력
  const { data: others } = await supabase
    .from("cards")
    .select("id,company_ko,company_en,title_ko,title_en,created_at")
    .eq("person_id", card.person_id)
    .neq("id", id)
    .order("created_at", { ascending: false });
  const otherCards = (others ?? []).map((o) => ({
    id: o.id as string,
    company: (o.company_ko as string) || (o.company_en as string) || "회사 미상",
    title: (o.title_ko as string) || (o.title_en as string) || "",
    createdAt: o.created_at as string,
  }));

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
      otherCards={otherCards}
      frontUrl={frontUrl}
      backUrl={backUrl}
    />
  );
}
