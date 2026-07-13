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
