# BUSINESS-CARD-COLLECTOR

폰 브라우저에서 링크만 열면 카메라로 명함을 촬영해 자동 추출·정리·저장하는 **개인용 모바일 웹앱**입니다.

- 1인 사용 (소유자 1명만 로그인, 회원가입 개방 없음)
- 설치 불필요 — 링크만 열면 촬영·저장·검색 모두 가능
- 완전 관리형 서비스만 사용 (Supabase + Vercel + Google Gemini API)

> ⚠️ 이 앱은 개인용입니다. `.env`와 명함 데이터·이미지는 커밋되지 않습니다. Supabase RLS로 소유자 외 접근이 차단되지만, 배포 URL은 신뢰하는 사람에게만 공유하세요.

---

## 기술 스택

| 레이어 | 선택 |
|---|---|
| 프레임워크 | Next.js 15 (App Router) + TypeScript |
| 스타일 | Tailwind CSS |
| 데이터베이스 | Supabase (Postgres) |
| 이미지 저장 | Supabase Storage (`card-images` 버킷) |
| 인증 | Supabase Auth (이메일 매직 링크) |
| AI 추출 | Google Gemini API (`gemini-3.1-flash-lite`, `GEMINI_MODEL`로 교체 가능) |
| 배포 | Vercel |

패키지 관리는 **npm**만 사용합니다 (`package-lock.json` 커밋).

---

## 실행 방법 (5단계)

### 1. 클론 + 설치

```bash
git clone https://github.com/yovminmjchoi/BUSINESS-CARD-COLLECTOR.git
cd BUSINESS-CARD-COLLECTOR
npm install
```

### 2. Supabase 준비

1. [Supabase 대시보드](https://supabase.com/dashboard)에서 프로젝트 생성 (또는 기존 프로젝트 사용)
2. **Settings → API** 에서 `Project URL`, `anon key`, `service_role key` 복사
3. **SQL Editor** 에서 `supabase/migrations/` 안의 SQL을 **번호 순서대로** 실행
   - `0001_init.sql` → 테이블 + RLS + 트리거
   - `0002_indexes.sql` → 확장·인덱스 (pg_trgm, tsvector)
   - `0003_grants.sql` → 역할 권한 부여 (SQL Editor 생성 시 "permission denied" 방지)
4. **Storage** 에서 `card-images` 버킷 생성 (Private). RLS 정책은 `0001_init.sql`에 포함되어 있습니다.
5. **Authentication → URL Configuration**
   - `Site URL`: 로컬 테스트 시 `http://localhost:3000` (배포 후 배포 URL로 변경)
   - `Redirect URLs`: `http://localhost:3000/auth/callback` 와 배포 URL의 `/auth/callback` 둘 다 추가
6. **Authentication → Providers → Email**
   - `Confirm email` **끄기** — 매직 링크 로그인만 쓰므로 별도 계정 확인 단계가 불필요하며,
     켜져 있으면 로그인 링크 대신 "Confirm signup" 메일이 반복 발송됩니다.
7. **Authentication → Email Templates → Magic Link** — 링크를 `token_hash` 방식으로 교체
   (기본 `{{ .ConfirmationURL }}`는 SSR PKCE 흐름과 어긋나 로그인이 실패합니다):
   ```html
   <h2>로그인</h2>
   <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink">로그인하기</a></p>
   ```
   (혹시 `Confirm email`을 켜둔다면 **Confirm signup** 템플릿도 동일하게, 단 `type=signup` 으로 교체)

### 3. 환경변수

```bash
cp .env.example .env.local
```

`.env.local`에 값 입력:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase에서 복사
- `GOOGLE_AI_API_KEY` — [Google AI Studio](https://aistudio.google.com/apikey)
- `ALLOWED_LOGIN_EMAIL` — 로그인 허용할 본인 이메일 하나

### 4. 로컬 테스트

```bash
npm run dev
# http://localhost:3000
```

### 5. Vercel 배포

1. [Vercel](https://vercel.com/)에 레포 임포트
2. 위 환경변수를 동일하게 등록
3. 배포 후 폰 브라우저에서 배포 URL 접속 (카메라·HTTPS 자동)

---

## 디렉터리 구조

```
app/            App Router 페이지 + API 라우트
components/     UI 컴포넌트
lib/            Supabase 클라이언트, Gemini 헬퍼, 정규화, 프롬프트
supabase/       마이그레이션 SQL
```

---

## 개발 진행 상태

- [x] 1. `.gitignore` / `.env.example` / README
- [x] 2. Next.js + TypeScript + Tailwind 초기화
- [x] 3. Supabase 마이그레이션 SQL
- [x] 4. Supabase Auth 매직 링크 + 화이트리스트 ★
- [x] 5. 카메라 촬영 + 이미지 업로드
- [x] 6. `/api/extract` + Gemini 추출 ★ (실제 명함 검증)
- [x] 7. 저장 로직 + 회사명 정규화
- [x] 8. 목록 + 검색 + 필터 + 정렬
- [ ] 9. 상세/편집 + 편집 이력
- [ ] 10. 태그 관리
- [ ] 11. 회사별 그룹 뷰
- [ ] 12. 중복 감지 + 병합
- [ ] 13. CSV / vCard 내보내기
- [ ] 14. Vercel 배포 ★
- [ ] 15. (선택) 구글시트 동기화
