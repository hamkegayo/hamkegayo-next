/**
 * 재동의 대상 판별과 안내 (#91).
 *
 *  약관 제4조 ③ 은 개정 시 시행일과 변경내용을 고지하도록 정하고,
 *  처리방침 제16조 ② 는 회원에게 불리한 변경을 개별 통지하도록 정한다.
 *  지금까지는 개정해도 **아무 일도 일어나지 않았다.**
 *
 *  ## 판별
 *
 *  `user_agreements` 의 최신 동의 버전이 현행 문서 버전과 다르면 대상이다.
 *  "낮으면" 이 아니라 "다르면" 인 이유 — version 은 개정일 ISO 라 사전순
 *  비교가 되지만(#105), 되돌린 개정처럼 값이 거꾸로 갈 여지를 남기지 않는다.
 *
 *  ## 지금은 유불리를 가리지 않는다
 *
 *  처리방침 제16조 ② 는 **회원에게 불리한 변경**에 개별 통지를 요구한다.
 *  지금은 그 구분 없이 모든 개정에 안내를 보낸다 — 유불리 판정은 사람이
 *  해야 하고, 판정 없이 "불리하지 않다" 고 단정하면 통지 의무를 놓친다.
 *  넓게 보내는 쪽이 리스크가 작다.
 *
 *  🔸 **확장 지점** — 개정마다 `isMaterialChange` 를 표시할 수 있게 되면
 *     (관리자 화면에서 개정 등록 시 지정) 경미한 수정은 통지에서 뺄 수 있다.
 *     그때 `reconsentTargets()` 가 그 플래그를 함께 보면 된다. 지금 구조는
 *     항목 단위 판정이라 플래그 한 개를 끼우는 것으로 끝난다.
 *
 *  ## 왜 상태형인가
 *
 *  재동의 대상이라는 사실은 사건이 아니라 **상태**다. 재동의할 때까지 계속
 *  참이므로 배치가 돌 때마다 같은 안내가 쌓인다. `dedupeKey` 로 막는다.
 *  키에 버전이 들어가므로 **다음 개정 때는 다시 한 번 나간다.**
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { AGREEMENT_VERSION, type AgreementType } from "./agreements";
import { PRIVACY } from "./privacy";
import { TERMS } from "./terms";

/** 재동의가 필요한 항목 */
export type ReconsentItem = {
    type: AgreementType;
    /** 현행 문서 버전 */
    current: string;
    /** 마지막으로 동의한 버전 (동의 이력이 없으면 null) */
    agreed: string | null;
};

type Row = {
    user_id: string;
    agreement_type: string;
    version: string;
    agreed_at: string;
};

/** 항목이 속한 문서 — 안내 문구에 쓴다 */
export function documentTitleOf(type: AgreementType): string {
    return type === "SERVICE" ? TERMS.title : PRIVACY.title;
}

/**
 * 한 사람의 재동의 대상.
 *
 *  ⚠️ **이력이 아예 없는 항목은 대상에서 뺀다.** 동의 이력 원장은 2026-09 에
 *     신설됐고(#58) 그 이전 가입자는 받은 동의가 남아 있지 않다. 그들에게
 *     "개정되었으니 재동의해 달라" 고 하면 사실과 다르다 — 개정 때문이 아니라
 *     기록이 없어서다. 그 안내는 별도로 다뤄야 한다.
 */
export function reconsentTargets(
    latestByType: Map<string, string>,
): ReconsentItem[] {
    const out: ReconsentItem[] = [];
    for (const [type, current] of Object.entries(AGREEMENT_VERSION) as [
        AgreementType,
        string,
    ][]) {
        const agreed = latestByType.get(type) ?? null;
        if (agreed === null) continue; // 이력 없음 — 위 주석 참고
        if (agreed !== current) out.push({ type, current, agreed });
    }
    return out;
}

/** 알림 중복 방지 키 — 버전이 바뀌면 키도 바뀐다 */
export function reconsentDedupeKey(item: ReconsentItem): string {
    return `AGREEMENT_REVISED:${item.type}:${item.current}`;
}

/**
 * 재동의 대상자와 항목을 한 번에 모은다 (배치용).
 *
 *  전 회원의 최신 동의를 훑는다. 지금 규모에서는 한 번에 읽어도 되지만,
 *  커지면 커서 방식으로 바꿔야 한다.
 */
export async function collectReconsentTargets(
    admin: SupabaseClient,
): Promise<Map<string, ReconsentItem[]>> {
    const { data, error } = await admin
        .from("user_agreements")
        .select("user_id, agreement_type, version, agreed_at")
        .order("agreed_at", { ascending: false })
        .returns<Row[]>();

    if (error || !data) return new Map();

    // user_id → (type → 최신 version)
    const latest = new Map<string, Map<string, string>>();
    for (const row of data) {
        let perUser = latest.get(row.user_id);
        if (!perUser) {
            perUser = new Map();
            latest.set(row.user_id, perUser);
        }
        // 최신순으로 읽으므로 먼저 들어온 것이 최신이다
        if (!perUser.has(row.agreement_type)) {
            perUser.set(row.agreement_type, row.version);
        }
    }

    const out = new Map<string, ReconsentItem[]>();
    for (const [userId, perUser] of latest) {
        const items = reconsentTargets(perUser);
        if (items.length > 0) out.set(userId, items);
    }
    return out;
}
