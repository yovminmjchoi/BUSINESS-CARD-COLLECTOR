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
      frontUrl={frontUrl}
      backUrl={backUrl}
    />
  );
}
