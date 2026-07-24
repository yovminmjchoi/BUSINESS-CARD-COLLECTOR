// 내 메일 서명 — 메일 보낼 때 본문 아래에 "그대로" 들어가는 자유 텍스트.
// 단일 사용자·개인용이라 localStorage 에 보관(마이그레이션 불필요, 기기별 저장).
// 개인정보(이름·주소 등)는 레포에 저장하지 않는다 — 사용자가 직접 입력해 이 기기에만 보관.

export interface MyProfile {
  signature: string; // 서명 전체(양쪽 인사 + 이름/직함/회사/주소 등) 자유 형식
}

const KEY = "myProfile";
const EMPTY: MyProfile = { signature: "" };

export function loadProfile(): MyProfile {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as { signature?: unknown };
    return { signature: typeof parsed.signature === "string" ? parsed.signature : "" };
  } catch {
    return { ...EMPTY };
  }
}

export function saveProfile(p: MyProfile): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* 저장 실패는 무시 */
  }
}

export function hasSignature(p: MyProfile): boolean {
  return p.signature.trim().length > 0;
}

// 폰 메일 앱을 여는 mailto 링크. 받는사람 = 상대 이메일, 본문 = 빈 줄 + 내 서명(그대로).
export function buildMailto(
  toEmail: string,
  profile: MyProfile,
  subject = "",
): string {
  const to = toEmail.trim();
  const sig = profile.signature.trim();
  const body = sig ? `\n\n${sig}` : "";
  const params: string[] = [];
  if (subject) params.push("subject=" + encodeURIComponent(subject));
  if (body) params.push("body=" + encodeURIComponent(body));
  const qs = params.length ? "?" + params.join("&") : "";
  return `mailto:${to}${qs}`;
}

// 빈자리표시자만 있는 기본 양식(개인정보 없음). 사용자가 실제 정보로 채워 넣는다.
export const SIGNATURE_TEMPLATE = `Best Regards,
[영문 약칭]

감사합니다.
[한글 이름] 드림

[영문 이름]
[직함]
[회사] | [한 줄 소개]
[주소]`;
