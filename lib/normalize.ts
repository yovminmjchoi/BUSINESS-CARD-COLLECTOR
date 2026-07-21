// 회사명 정규화 (지시서 5.5) — 같은 회사가 표기 차이로 흩어지지 않게 그룹 키 생성.
//   1) 소문자화·trim  2) 괄호 안 제거  3) 법인 접미사 제거
//   4) 공백·하이픈·점·쉼표 제거  5) 한글/영문 각각 정규화 후 더 긴 쪽 채택

export function normalizeCompanyToken(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.toLowerCase().trim();

  // 2) 괄호 안 내용 제거 ( () 및 전각 （） )
  s = s.replace(/\([^)]*\)/g, "").replace(/（[^）]*）/g, "");

  // 3) 법인 접미사 제거
  s = s.replace(/주식회사|유한회사/g, "");
  s = s.replace(
    /\b(co\.,?\s*ltd\.?|company|corporation|corp\.?|incorporated|inc\.?|limited|ltd\.?|gmbh|llc|s\.?a\.?r\.?l|sarl|s\.?a\.?|sa)\b/g,
    "",
  );
  s = s.replace(/\bco\.?\b/g, "");

  // 4) 공백·하이픈·점·쉼표·가운뎃점 제거
  s = s.replace(/[\s\-.,·]/g, "");

  return s;
}

// 전화번호에서 숫자만 추출 (중복 비교용)
export function digitsOnly(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

// 성/이름으로 표시용 전체 이름 합성.
//   한글: 성+이름 (예: 최+민정 = "최민정")
//   영문: 이름 성 (예: Minjeong Choi) — 자연스러운 영어 표기
// 분리값이 없으면 fallback(명함 원문 전체이름)을 사용.
function tidy(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
export function composeNameKo(
  familyKo: string | null | undefined,
  givenKo: string | null | undefined,
  fallback?: string | null,
): string | null {
  const joined = [tidy(familyKo), tidy(givenKo)].filter(Boolean).join("");
  return joined || tidy(fallback);
}
export function composeNameEn(
  familyEn: string | null | undefined,
  givenEn: string | null | undefined,
  fallback?: string | null,
): string | null {
  const joined = [tidy(givenEn), tidy(familyEn)].filter(Boolean).join(" ");
  return joined || tidy(fallback);
}

// 트라이그램 Dice 유사도 (pg_trgm 근사). 0~1.
export function trigramSimilarity(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const trigrams = (s: string): Set<string> => {
    const t = ` ${s.toLowerCase().trim()} `;
    const set = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
    return set;
  };
  if (!a || !b) return 0;
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  return (2 * inter) / (A.size + B.size);
}

// 한글/영문 회사명을 각각 정규화 후 더 긴 쪽(더 완전한 표기)을 그룹 키로 채택
export function pickCompanyNormalized(
  companyKo: string | null | undefined,
  companyEn: string | null | undefined,
): string | null {
  const nk = normalizeCompanyToken(companyKo);
  const ne = normalizeCompanyToken(companyEn);
  if (!nk && !ne) return null;
  if (!nk) return ne;
  if (!ne) return nk;
  return ne.length >= nk.length ? ne : nk;
}
