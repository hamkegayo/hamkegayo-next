import type { SupabaseClient } from "@supabase/supabase-js";

import { TERMS } from "./terms";
import { PRIVACY } from "./privacy";

/**
 * 동의 이력 적재 (#58).
 *
 *  회원가입에서 4종 동의를 필수로 받으면서 아무 데도 저장하지 않고 있었다.
 *  **동의 사실의 입증 책임은 회사에 있다.** 분쟁이 생기면 "동의를 받았다" 를
 *  증명할 수단이 필요하다.
 */

/** DB 의 check 제약과 같은 값 */
export type AgreementType = "SERVICE" | "PRIVACY" | "PERSONAL" | "SENSITIVE";

/**
 * 동의 항목이 가리키는 문서의 버전.
 *
 *  개인정보 수집·이용(PERSONAL)과 민감정보(SENSITIVE)는 별도 문서가 아니라
 *  개인정보처리방침의 제2조·제3조다. 그래서 방침 버전을 함께 따른다.
 *  방침이 개정되면 세 항목이 동시에 재동의 대상이 되는데, 실제로 그렇다.
 */
export const AGREEMENT_VERSION: Record<AgreementType, string> = {
    SERVICE: TERMS.version,
    PRIVACY: PRIVACY.version,
    PERSONAL: PRIVACY.version,
    SENSITIVE: PRIVACY.version,
};

/** 회원가입 화면의 4종 동의 체크값 */
export type AgreementInput = {
    agreeService: boolean;
    agreePrivacy: boolean;
    agreePersonal: boolean;
    agreeSensitive: boolean;
};

const FIELD_TO_TYPE: [keyof AgreementInput, AgreementType][] = [
    ["agreeService", "SERVICE"],
    ["agreePrivacy", "PRIVACY"],
    ["agreePersonal", "PERSONAL"],
    ["agreeSensitive", "SENSITIVE"],
];

/**
 * 동의 이력을 적재한다.
 *
 *  ⚠️ **실패를 삼키지 않는다.** 알림 적재와 달리 여기서 실패하면 동의를
 *     증명할 수 없는 계정이 생긴다. 호출부는 실패 시 가입 자체를 되돌린다.
 *
 *  체크되지 않은 항목은 넣지 않는다. 지금은 4종 모두 필수라 실질적으로
 *  항상 4행이지만, 선택 동의가 생겨도 이 함수는 그대로 쓸 수 있다.
 *
 *  같은 버전에 다시 동의하는 것은 의미가 없어 유니크 제약에 걸린다.
 *  파트너 활성화 재시도 같은 경우가 실제로 있으므로 무시하고 넘어간다.
 *
 *  @param admin service_role 클라이언트 (RLS 에 쓰기 정책이 없다)
 *  @returns 적재 성공 여부
 */
export async function recordAgreements(
    admin: SupabaseClient,
    userId: string,
    input: AgreementInput,
): Promise<boolean> {
    const rows = FIELD_TO_TYPE.filter(([field]) => input[field] === true).map(
        ([, type]) => ({
            user_id: userId,
            agreement_type: type,
            version: AGREEMENT_VERSION[type],
        }),
    );

    if (rows.length === 0) return true;

    const { error } = await admin.from("user_agreements").upsert(rows, {
        onConflict: "user_id,agreement_type,version",
        ignoreDuplicates: true,
    });

    if (error) {
        console.error("[recordAgreements] 동의 이력 적재 실패:", error);
        return false;
    }
    return true;
}
