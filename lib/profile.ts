// 내 메일 서명 — 메일 보낼 때 본문 아래에 "그대로" 들어가는 자유 텍스트.
// 단일 사용자·개인용이라 localStorage 에 보관(마이그레이션 불필요, 기기별 저장).
// 개인정보(이름·주소 등)는 레포에 저장하지 않는다 — 사용자가 직접 입력해 이 기기에만 보관.

export interface SigFields {
  nameEn: string;
  nameKo: string;
  title: string;
  company: string;
  tagline: string; // 회사 한 줄 소개
  mobile: string;
  officePhone: string;
  email: string;
  website: string;
  address: string;
}

export type MailApp = "default" | "outlook" | "gmail";

export interface MyProfile {
  signature: string; // 최종 서명(그대로 메일에 삽입) — 진짜 소스
  fields: SigFields; // 아웃룩 형식 생성용 구조화 입력(편의)
  mailApp: MailApp; // 예전 설정값 보존용. 지금은 상세 화면에서 보낼 때마다 앱을 고른다.
}

const KEY = "myProfile";
const EMPTY_FIELDS: SigFields = {
  nameEn: "", nameKo: "", title: "", company: "", tagline: "",
  mobile: "", officePhone: "", email: "", website: "", address: "",
};
const EMPTY: MyProfile = { signature: "", fields: { ...EMPTY_FIELDS }, mailApp: "default" };

export function loadProfile(): MyProfile {
  if (typeof window === "undefined") return { ...EMPTY, fields: { ...EMPTY_FIELDS } };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY, fields: { ...EMPTY_FIELDS } };
    const parsed = JSON.parse(raw) as Partial<MyProfile>;
    return {
      signature: typeof parsed.signature === "string" ? parsed.signature : "",
      fields: { ...EMPTY_FIELDS, ...(parsed.fields ?? {}) },
      mailApp: parsed.mailApp === "outlook" || parsed.mailApp === "gmail"
        ? parsed.mailApp
        : "default",
    };
  } catch {
    return { ...EMPTY, fields: { ...EMPTY_FIELDS } };
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

// 구조화 입력 → 아웃룩식 서명(영문 인사 + 한글 인사 + 이름/직함/회사/연락처/주소 블록).
export function buildOutlookSignature(f: SigFields): string {
  const out: string[] = [];
  // 인사
  out.push("Best regards,");
  if (f.nameEn) out.push(f.nameEn);
  out.push("");
  out.push("감사합니다.");
  if (f.nameKo) out.push(`${f.nameKo} 드림`);
  out.push("");
  // 블록
  if (f.nameEn) out.push(f.nameEn);
  if (f.title) out.push(f.title);
  const companyLine = [f.company, f.tagline].filter(Boolean).join(" | ");
  if (companyLine) out.push(companyLine);
  const phoneLine = [
    f.mobile ? `M ${f.mobile}` : "",
    f.officePhone ? `T ${f.officePhone}` : "",
  ].filter(Boolean).join("  ·  ");
  if (phoneLine) out.push(phoneLine);
  const contactLine = [f.email, f.website].filter(Boolean).join(" | ");
  if (contactLine) out.push(contactLine);
  if (f.address) out.push(f.address);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function composeBody(profile: MyProfile | null): string {
  const sig = profile?.signature.trim() ?? "";
  return sig ? `\n\n${sig}` : "";
}

function buildMailtoUrl(
  toEmail: string,
  profile: MyProfile | null,
  subject = "",
): { href: string } {
  const to = toEmail.trim();
  const body = composeBody(profile);
  const q: string[] = [];
  if (subject) q.push("subject=" + encodeURIComponent(subject));
  if (body) q.push("body=" + encodeURIComponent(body));
  const qs = q.length ? "?" + q.join("&") : "";
  return { href: `mailto:${to}${qs}` };
}

function composeUrlForApp(
  toEmail: string,
  profile: MyProfile | null,
  app: MailApp,
  subject = "",
): { href: string; fallbackHref?: string } {
  const mailto = buildMailtoUrl(toEmail, profile, subject);
  if (app === "default") return mailto;

  const to = toEmail.trim();
  const body = composeBody(profile);
  const q: string[] = ["to=" + encodeURIComponent(to)];
  if (subject) q.push("subject=" + encodeURIComponent(subject));
  if (body) q.push("body=" + encodeURIComponent(body));

  return {
    href: app === "gmail"
      ? `googlegmail:///co?${q.join("&")}`
      : `ms-outlook://compose?${q.join("&")}`,
    fallbackHref: mailto.href,
  };
}

export function buildComposeUrl(
  toEmail: string,
  profile: MyProfile | null,
  subject = "",
): { href: string } {
  return buildMailtoUrl(toEmail, profile, subject);
}

export function buildComposeLinks(
  toEmail: string,
  profile: MyProfile | null,
  subject = "",
): { key: MailApp; label: string; href: string; fallbackHref?: string }[] {
  const apps: { key: MailApp; label: string }[] = [
    { key: "gmail", label: "Gmail" },
    { key: "default", label: "기본 메일" },
    { key: "outlook", label: "Outlook" },
  ];
  return apps.map((app) => ({
    ...app,
    ...composeUrlForApp(toEmail, profile, app.key, subject),
  }));
}
