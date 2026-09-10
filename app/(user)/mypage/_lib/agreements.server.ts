/**
 * 내 동의 이력 조회 — 서버 전용.
 *
 *  마이페이지 '약관 동의 관리' 카드가 **하드코딩된 목록**을 모두 "동의 완료" 로
 *  보여주고 있었다. 가입 시 실제로 받는 4종(#58)과 항목도 달랐고, DB 를 전혀
 *  보지 않았다. 동의 사실은 분쟁에서 회사가 입증해야 하는 것이라(#58) 화면이
 *  임의로 "완료" 라고 말하면 안 된다.
 *
 *  쓰기는 다루지 않는다 — user_agreements 는 조회 정책만 열려 있다.
 *  사용자가 고칠 수 없어야 증거로서 의미가 있기 때문이다.
 */

import { createClient } from "@/utils/supabase/server";
import { kstDateDot } from "@/lib/format";
import { AGREEMENT_VERSION, type AgreementType } from "@/lib/legal/agreements";

export type AgreementView = {
    type: AgreementType;
    label: string;
    /** 해당 조항을 보여줄 경로 */
    href: string;
    /** 동의한 문서 버전 (미동의면 null) */
    version: string | null;
    /** "YYYY.MM.DD" (미동의면 null) */
    agreedLabel: string | null;
    /** 동의한 버전이 현행본과 같은가 — 다르면 재동의 대상이다 (#91) */
    isCurrent: boolean;
};

/**
 * 화면에 보여줄 4종. 라벨과 경로는 **회원가입 화면과 같은 것**을 쓴다.
 * 가입에서 A 라고 받아 놓고 마이페이지에서 B 라고 부르면 같은 동의로 읽히지 않는다.
 */
const ITEMS: { type: AgreementType; label: string; href: string }[] = [
    { type: "SERVICE", label: "서비스 약관에 동의", href: "/terms" },
    { type: "PRIVACY", label: "개인정보 처리방침에 동의", href: "/privacy" },
    {
        type: "PERSONAL",
        label: "일반 개인정보 수집/이용에 동의",
        href: "/privacy#article-2",
    },
    {
        type: "SENSITIVE",
        label: "민감 개인정보 수집/이용에 동의",
        href: "/privacy#article-3",
    },
];

type Row = { agreement_type: string; version: string; agreed_at: string };

/** 미동의 상태의 기본값 */
const emptyView = (i: (typeof ITEMS)[number]): AgreementView => ({
    ...i,
    version: null,
    agreedLabel: null,
    isCurrent: false,
});

/**
 * 로그인 사용자의 동의 이력. 조회 실패·비로그인 시 전부 미동의로 돌려준다.
 * (없는 것을 "완료" 로 보여주는 것보다 안전한 방향이다)
 */
export async function getMyAgreements(): Promise<AgreementView[]> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return ITEMS.map(emptyView);

        const { data, error } = await supabase
            .from("user_agreements")
            .select("agreement_type, version, agreed_at")
            .eq("user_id", user.id)
            .order("agreed_at", { ascending: false })
            .returns<Row[]>();

        if (error || !data) return ITEMS.map(emptyView);

        // 같은 항목에 이력이 여러 건이면 가장 최근 것이 현재 상태다.
        const latest = new Map<string, Row>();
        for (const row of data) {
            if (!latest.has(row.agreement_type))
                latest.set(row.agreement_type, row);
        }

        return ITEMS.map((item) => {
            const row = latest.get(item.type);
            if (!row) return emptyView(item);
            const d = new Date(row.agreed_at);
            return {
                ...item,
                version: row.version,
                agreedLabel: Number.isNaN(d.getTime())
                    ? null
                    : (kstDateDot(d) ?? null),
                isCurrent: row.version === AGREEMENT_VERSION[item.type],
            };
        });
    } catch {
        return ITEMS.map(emptyView);
    }
}
