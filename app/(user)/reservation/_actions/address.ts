"use server";

import { createClient } from "@/utils/supabase/server";
import {
    isAddressSearchEnabled,
    searchRoadAddress,
    type AddressSearchResult,
} from "@/lib/juso.server";

/** 주소 검색 버튼을 보일지. 키가 없는 환경에서는 직접 입력만 쓴다. */
export async function addressSearchEnabled(): Promise<boolean> {
    return isAddressSearchEnabled();
}

/**
 * 예약 출발지·병원 주소 검색 (#226). 예약 화면과 같이 로그인한 사용자만 쓴다 —
 * 공개로 열어 두면 승인키 호출 한도를 외부에서 소진할 수 있다.
 */
export async function searchReservationAddress(
    keyword: string,
    page = 1,
): Promise<AddressSearchResult> {
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
    return searchRoadAddress(keyword, page);
}
