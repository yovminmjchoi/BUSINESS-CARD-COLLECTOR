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

## 호칭 규칙 (사용자 ↔ AI)

사용자는 접두어 한 글자로 대상을 지정한다. 긴 설명 대신 결정만 전달한다.

- `클:` → Claude 에게 지시
- `코:` → Codex 에게 지시
- `둘:` → 둘 다 봐야 하는 내용 (상황판에 반영)
- `나:` → 사용자의 결정/요청 (머지/보류/우선순위)

예) `클: NOTES 보고 이어가` · `코: 클 변경 리뷰해` · `둘: 다음은 인식 품질` · `나: PR #3 머지`

## 상황판 (NOTES.md 상단 인수인계 로그)

채팅은 사라진다 → **이 문서(규칙) + NOTES 상황판 + 각 PR 설명**만 믿는다.
NOTES.md 맨 위 `인수인계 로그`에 항상 아래 5줄만 최신으로 유지한다:

```
현재 상태:
진행 중:
열린 PR:
다음 우선순위:
결정 필요:
```

흐름: 작업한 AI 가 5줄을 갱신 → 다른 AI 에게 "NOTES 인수인계 로그부터 읽고 이어가".
이 한 문장이 두 AI 사이의 대화를 대신한다.
