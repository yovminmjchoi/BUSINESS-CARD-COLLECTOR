# AI Collaboration Workflow

This project is built with the user, Claude, and Codex working together.

## Goal

The user is not a developer. Keep explanations simple and focus on what changed, what to test, and what remains.

The first product goal is practical: help the user process more than 1,000 business cards safely and quickly.

## Roles

- Claude: main feature builder unless the user says otherwise.
- Codex: reviewer, safety checker, bug fixer, and plain-language summarizer.
- User: decides priorities and tests the app on real cards.

## Branch Rules

- Claude can keep working on `claude/business-card-collector-webapp-edaynx`.
- Codex should work on separate branches named `codex/<short-task>`.
- Do not edit the same feature on the same branch at the same time.
- Codex work should normally be opened as a draft pull request first.

## Handoff Format

Every Codex PR or handoff should include:

1. What I looked at
2. What I changed
3. Why it matters
4. What Claude can reuse
5. What the user should test
6. Any risk or unfinished part

## User Summary Format

When reporting to the user, avoid heavy technical terms. Prefer this format:

- Current state: what works now
- Changed by Claude: short summary
- Changed by Codex: short summary
- Needs testing: simple phone/browser steps
- Next best step: one recommendation

## Safety Notes

- Do not paste secret API keys into chat, commit messages, PR bodies, or docs.
- Keep Supabase service-role credentials server-only.
- Before product launch, review Supabase RLS, Storage access, export safety, and data cleanup.
- For large card batches, protect against partial saves and leftover uploaded images.

## Current Known Codex Watchlist

- Check both front and back image upload failures in `/api/extract`.
- Prevent leftover draft images when a user leaves review or merges into an existing card.
- Consider narrower Supabase grants before wider release.
- Add CSV export protection for spreadsheet formulas.
- Consider batch duplicate checks if the app feels slow with many cards.
