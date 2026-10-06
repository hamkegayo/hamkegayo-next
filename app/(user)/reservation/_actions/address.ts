"use server";

import { createClient } from "@/utils/supabase/server";
import {
    isAddressSearchEnabled,
    searchRoadAddress,
    type AddressResult,
    type AddressSearchResult,
} from "@/lib/juso.server";
import { signAddressRegion } from "@/lib/address-token.server";

/** 주소 검색 버튼을 보일지. 키가 없는 환경에서는 직접 입력만 쓴다. */
export async function addressSearchEnabled(): Promise<boolean> {
    return isAddressSearchEnabled();
}

/** 검색 결과 + 서버 서명. 예약 저장 때 이 서명으로 주소·코드 결합을 검증한다 (#232 리뷰). */
export type SignedAddressResult = AddressResult & { token: string | null };

export type SignedAddressSearchResult =
    | (Extract<AddressSearchResult, { ok: true }> & {
          results: SignedAddressResult[];
      })
    | Extract<AddressSearchResult, { ok: false }>;

/**
 * 예약 출발지·병원 주소 검색 (#226). 예약 화면과 같이 로그인한 사용자만 쓴다.
 * 승인키 일일 한도를 지키려고 사용자별 분당 20회·하루 300회로 제한한다 (#232 리뷰).
 */
export async function searchReservationAddress(
    keyword: string,
    page = 1,
): Promise<SignedAddressSearchResult> {
    if (typeof keyword !== "string" || !Number.isInteger(page))
        return {
            ok: false,
            reason: "invalid",
            message: "검색어를 확인해 주세요.",
        };
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user)
        return { ok: false, reason: "error", message: "로그인이 필요합니다." };
    const { data: allowed, error } = await supabase.rpc(
        "consume_address_search_quota",
        { p_kind: "ADDRESS" },
    );
    if (error || allowed !== true)
        return {
            ok: false,
            reason: "limited",
            message:
                "주소 검색을 너무 자주 했습니다. 잠시 후 다시 시도하거나 직접 입력해 주세요.",
        };
    const res = await searchRoadAddress(keyword, page);
    if (!res.ok) return res;
    return {
        ...res,
        results: res.results.map((r) => ({
            ...r,
            token: signAddressRegion(r.roadAddr, r.regionCode),
        })),
    };
}
