import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const execute = process.argv.includes("--execute");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "card-images";
const PAGE_SIZE = 200;

function thumbnailPath(frontPath) {
  return frontPath.endsWith("/front.jpg")
    ? frontPath.slice(0, -"front.jpg".length) + "thumb.jpg"
    : `${frontPath}.thumb.jpg`;
}

async function loadCards() {
  const cards = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("cards")
      .select("id,image_front_path")
      .not("image_front_path", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    cards.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return cards;
}

async function makeThumb(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 240, height: 240, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70, progressive: true })
    .toBuffer();
}

const cards = await loadCards();
console.log(`Cards with front images: ${cards.length}`);
console.log(execute ? "MODE: EXECUTE" : "MODE: DRY RUN (no files will be written)");

if (!execute) {
  console.log("Run again with --execute only after confirming the card count above.");
  process.exit(0);
}

let created = 0;
let skippedExisting = 0;
let failed = 0;

for (const [index, card] of cards.entries()) {
  const frontPath = card.image_front_path;
  const thumbPath = thumbnailPath(frontPath);

  try {
    // Check for an existing thumbnail first. Downloading a tiny existing thumb is cheap,
    // and makes this script safe to resume after interruption.
    const { data: existing, error: existingError } = await supabase.storage
      .from(BUCKET)
      .download(thumbPath);
    if (!existingError && existing) {
      skippedExisting += 1;
      console.log(`[${index + 1}/${cards.length}] skip existing ${thumbPath}`);
      continue;
    }

    const { data: original, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(frontPath);
    if (downloadError || !original) throw downloadError ?? new Error("front image missing");

    const originalBuffer = Buffer.from(await original.arrayBuffer());
    const thumbBuffer = await makeThumb(originalBuffer);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(thumbPath, thumbBuffer, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      if (/already exists|duplicate/i.test(uploadError.message)) {
        skippedExisting += 1;
        continue;
      }
      throw uploadError;
    }

    created += 1;
    console.log(`[${index + 1}/${cards.length}] created ${thumbPath} (${thumbBuffer.length} bytes)`);
  } catch (error) {
    failed += 1;
    console.error(
      `[${index + 1}/${cards.length}] FAILED card=${card.id} path=${frontPath}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

console.log("\nBackfill complete");
console.log({ total: cards.length, created, skippedExisting, failed });

if (failed > 0) {
  console.error("Some thumbnails failed. Do not deploy the thumbnail-only list until these are reviewed.");
  process.exit(2);
}

console.log("All front images now have thumbnails. Originals were never updated or deleted.");
