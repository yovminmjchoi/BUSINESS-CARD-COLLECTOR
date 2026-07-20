import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  digitsOnly,
  pickCompanyNormalized,
  trigramSimilarity,
} from "@/lib/normalize";

export const runtime = "nodejs";

// 이름 유사 임계값: 같은 회사와 함께면 관대(0.5), 회사가 다르면 엄격(0.8, 동명이인 오탐 방지)
const NAME_SIM_SAME_COMPANY = 0.5;
const NAME_SIM_DIFF_COMPANY = 0.8;

interface DupInput {
  email?: string | null;
  mobile?: string | null;
  name?: string | null;
  companyKo?: string | null;
  companyEn?: string | null;
  excludeId?: string | null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: DupInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ candidates: [] });
  }

  const normEmail = body.email ? body.email.toLowerCase().trim() : "";
  const digits = digitsOnly(body.mobile);
  const companyNorm = pickCompanyNormalized(body.companyKo, body.companyEn);
  const name = (body.name ?? "").trim();

  // 비교 기준이 하나도 없으면 스킵
  if (!normEmail && !digits && !(name && companyNorm)) {
    return NextResponse.json({ candidates: [] });
  }

  const { data } = await supabase
    .from("cards")
    .select(
      "id,person_id,name_ko,name_en,company_ko,company_en,company_normalized,title_ko,title_en,email,mobile",
    );

  const candidates = [];
  for (const c of data ?? []) {
    if (body.excludeId && c.id === body.excludeId) continue;

    const reasons: string[] = [];
    if (normEmail && c.email && c.email.toLowerCase() === normEmail) {
      reasons.push("이메일 일치");
    }
    if (digits && c.mobile && digitsOnly(c.mobile) === digits) {
      reasons.push("전화번호 일치");
    }
    if (name) {
      const cName = c.name_ko || c.name_en || "";
      const nameSim = trigramSimilarity(name, cName);
      const sameCompany =
        companyNorm &&
        c.company_normalized &&
        c.company_normalized === companyNorm;

      if (sameCompany && nameSim >= NAME_SIM_SAME_COMPANY) {
        reasons.push("이름·회사 유사");
      } else if (
        !sameCompany &&
        companyNorm &&
        c.company_normalized &&
        nameSim >= NAME_SIM_DIFF_COMPANY
      ) {
        // 이름은 같은데 회사가 다름 → 이직/부서이동 가능성
        reasons.push("이름 같음 (다른 회사 — 이직?)");
      }
    }

    if (reasons.length > 0) {
      candidates.push({
        id: c.id,
        personId: c.person_id,
        name: c.name_ko || c.name_en || "(이름 없음)",
        company: c.company_ko || c.company_en || "",
        title: c.title_ko || c.title_en || "",
        reasons,
      });
    }
  }

  return NextResponse.json({ candidates });
}
