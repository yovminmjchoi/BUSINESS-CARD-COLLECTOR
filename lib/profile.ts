// 내 정보(내 명함) — 메일 보낼 때 서명으로 쓰임.
// 단일 사용자·개인용이라 localStorage 에 보관(마이그레이션 불필요). 기기별 저장.
// 필요하면 나중에 Supabase 테이블로 옮겨 기기 간 동기화 가능.

export interface MyProfile {
  name: string;
  company: string;
  title: string;
  mobile: string;
  officePhone: string;
  email: string;
  extra: string; // 자유 서명 문구(회사 주소·웹사이트 등)
}

const KEY = "myProfile";
const EMPTY: MyProfile = {
  name: "",
  company: "",
  title: "",
  mobile: "",
  officePhone: "",
  email: "",
  extra: "",
};

export function loadProfile(): MyProfile {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<MyProfile>) };
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

export function hasProfile(p: MyProfile): boolean {
  return Boolean(p.name || p.company || p.email || p.mobile);
}

// 메일 본문 하단 서명 텍스트
export function buildSignature(p: MyProfile): string {
  const lines: string[] = [];
  if (p.name) lines.push(p.name);
  const tc = [p.title, p.company].filter(Boolean).join(" · ");
  if (tc) lines.push(tc);
  if (p.mobile) lines.push(`M ${p.mobile}`);
  if (p.officePhone) lines.push(`T ${p.officePhone}`);
  if (p.email) lines.push(p.email);
  if (p.extra.trim()) {
    lines.push("");
    lines.push(p.extra.trim());
  }
  return lines.join("\n");
}

// 폰 메일 앱을 여는 mailto 링크. 받는사람 = 상대 이메일, 본문 = 빈 줄 + 내 서명.
// subject 는 비워두고 사용자가 직접 씀(원하면 넘길 수 있음).
export function buildMailto(
  toEmail: string,
  profile: MyProfile,
  subject = "",
): string {
  const to = toEmail.trim();
  const sig = buildSignature(profile);
  const body = sig ? `\n\n--\n${sig}` : "";
  const params: string[] = [];
  if (subject) params.push("subject=" + encodeURIComponent(subject));
  if (body) params.push("body=" + encodeURIComponent(body));
  const qs = params.length ? "?" + params.join("&") : "";
  return `mailto:${to}${qs}`;
}
