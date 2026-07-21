// vCard 3.0 생성 (아이폰/구글 연락처 임포트용, UTF-8 한글 그대로)
// 사람(person_id)당 연락처 1개: 대표(is_primary 우선, 없으면 최신) 명함 기준.
// 과거 명함(이직·승진 전)은 NOTE 에 "[이력]"으로 병기.

import type { ExportCard } from "./csv";

export interface VcardCard extends ExportCard {
  person_id: string;
}

// vCard 텍스트 값 이스케이프 (콤마·세미콜론·줄바꿈·백슬래시)
function esc(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// 75바이트 접기(folding)는 관용적으로 생략해도 임포트에 문제없어 단순화.
function vcardForPerson(cards: VcardCard[]): string {
  // 대표: is_primary 우선, 없으면 created_at 최신
  const sorted = [...cards].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
  const rep = sorted.find((c) => c.is_primary) ?? sorted[0];
  const history = sorted.filter((c) => c !== rep);

  const nameKo = rep.name_ko ?? "";
  const nameEn = rep.name_en ?? "";
  const displayName = nameKo || nameEn || "(이름 없음)";
  const company = rep.company_ko || rep.company_en || "";
  const title = rep.title_ko || rep.title_en || "";

  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    // 성/이름이 분리돼 있으면 N:Family;Given 으로 (연락처 정렬·표시 정확)
    rep.family_name || rep.given_name
      ? `N:${esc(rep.family_name)};${esc(rep.given_name)};;;`
      : `N:${esc(displayName)};;;;`,
    `FN:${esc(displayName)}`,
  ];

  if (nameEn && nameKo) lines.push(`X-PHONETIC-FIRST-NAME:${esc(nameEn)}`);
  if (company || rep.department) {
    lines.push(`ORG:${esc(company)}${rep.department ? ";" + esc(rep.department) : ""}`);
  }
  if (title) lines.push(`TITLE:${esc(title)}`);
  if (rep.mobile) lines.push(`TEL;TYPE=CELL:${esc(rep.mobile)}`);
  if (rep.office_phone) lines.push(`TEL;TYPE=WORK:${esc(rep.office_phone)}`);
  if (rep.fax) lines.push(`TEL;TYPE=FAX:${esc(rep.fax)}`);
  if (rep.email) lines.push(`EMAIL;TYPE=WORK:${esc(rep.email)}`);
  if (rep.website) lines.push(`URL:${esc(rep.website)}`);
  const addr = rep.address_ko || rep.address_en;
  if (addr) lines.push(`ADR;TYPE=WORK:;;${esc(addr)};;;;`);

  // 메모: 인물/회사 메모 + 태그 + 과거 이력
  const noteParts: string[] = [];
  if (rep.person_note) noteParts.push(rep.person_note);
  if (rep.company_note) noteParts.push(`[회사] ${rep.company_note}`);
  if (rep.tags.length > 0) noteParts.push(`[태그] ${rep.tags.join(", ")}`);
  for (const h of history) {
    const hc = h.company_ko || h.company_en || "회사 미상";
    const ht = h.title_ko || h.title_en || "";
    noteParts.push(`[이력] ${hc}${ht ? " · " + ht : ""}`);
  }
  if (noteParts.length > 0) lines.push(`NOTE:${esc(noteParts.join("\n"))}`);

  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function buildVcf(cards: VcardCard[]): string {
  // person_id 로 그룹핑
  const groups = new Map<string, VcardCard[]>();
  for (const c of cards) {
    const g = groups.get(c.person_id);
    if (g) g.push(c);
    else groups.set(c.person_id, [c]);
  }
  return [...groups.values()].map(vcardForPerson).join("\r\n") + "\r\n";
}
