# Codex Handoff — Supabase Egress / Thumbnail Rollout

## What I looked at

The production app stores business-card images in the private Supabase Storage bucket `card-images`. The list page currently creates signed URLs for every `image_front_path` and renders those full front images at only 56x56 CSS pixels. With hundreds of cards this can create unnecessary Supabase egress.

The existing upload path already reduces phone images to roughly a 2000px JPEG before storage, but that is still much larger than a list thumbnail.

## What I changed on this branch

Branch: `codex/supabase-egress-thumbnails`

1. New uploads now create an additional `thumb.jpg` in the same card folder as `front.jpg`.
2. `thumb.jpg` is max 240x240, JPEG quality 70, long-cache metadata.
3. The card list derives `thumb.jpg` from the existing front path and never intentionally requests `front.jpg` for list thumbnails.
4. List images use `loading="lazy"` and `decoding="async"`.
5. Added `scripts/backfill-thumbnails.mjs` for existing cards.
6. The backfill is dry-run by default and only writes when `--execute` is supplied.
7. The backfill never updates or deletes `front.jpg`, `back.jpg`, or rows in `cards`.
8. No database schema migration is required. Thumbnail paths are deterministic: a card stored at `<user>/<draft>/front.jpg` gets `<user>/<draft>/thumb.jpg`.

## Critical rollout order

Do not deploy the list-page change before the existing-card backfill succeeds.

Safe sequence:

1. Confirm current production card count in Supabase.
2. Confirm a database backup/snapshot is available if practical.
3. Check out this branch in an environment that already has the Supabase project credentials.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` locally/server-side only. Never commit the service-role key.
5. Run `npm install` if needed.
6. Run `npm run thumbs:check`.
   - This is dry-run only.
   - Confirm the reported count is consistent with the current cards that have front images.
7. Run `npm run thumbs:backfill`.
   - This downloads each existing `front.jpg`, creates a new small `thumb.jpg`, and uploads only that new file.
   - It is resumable. Existing thumbnails are skipped.
8. Require `failed: 0` before deployment.
9. Spot-check at least 10 old cards in Storage: confirm each folder still contains the original `front.jpg` (and `back.jpg` where applicable) plus the new `thumb.jpg`.
10. Compare the card-row count before and after. It must be unchanged.
11. Run `npm run build` on this branch.
12. Only after the above passes, deploy/merge the branch.
13. Test the Vercel app on mobile: list, search, sort, tag filter, open details, add a new card, and confirm the new card folder gets `front.jpg` + `thumb.jpg`.
14. Watch Supabase Usage/Egress after normal use. The list should now transfer tiny thumbnail files rather than full card images.

## Safety constraints

Do not resize-in-place, overwrite, move, rename, or delete any existing `front.jpg` or `back.jpg`.

Do not delete any `cards`, `card_edits`, `card_tags`, people/history records, or Storage folders as part of this work.

Do not use a fallback from missing `thumb.jpg` to `front.jpg` in the list page. A fallback would silently recreate the egress problem. If any thumbnail backfill fails, fix those failures before production deployment.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser or commit it to GitHub.

## Validation numbers to record

Before backfill:

- Total `cards` rows
- Cards with non-null `image_front_path`
- Storage object count if easily available

After backfill:

- Total `cards` rows: must match before
- Cards with non-null `image_front_path`: must match before
- Backfill `created`
- Backfill `skippedExisting`
- Backfill `failed`: must be 0
- Spot-check originals intact

## Why this matters

At roughly 600 cards, repeatedly loading full stored front images in the list can consume gigabytes of Supabase egress even though the UI only shows tiny icons. Dedicated thumbnails plus browser lazy loading should reduce normal list-view image transfer by an order of magnitude without changing the underlying card database or original images.
