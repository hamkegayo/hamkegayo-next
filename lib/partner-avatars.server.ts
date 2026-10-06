import { createAdminClient } from "@/utils/supabase/admin";
import {
    PROFILE_PHOTO_BUCKET,
    PROFILE_PHOTO_URL_TTL,
} from "@/lib/profile-photo";

/**
 * 고객 화면에 보일 파트너 프로필 사진 (매칭 중 지원 목록·선택 카드·상세).
 *
 * 공개 고지: "공개 항목: 사진, 이름…", "조회 가능 기간: 해당 예약의 매칭 중".
 * 그래서 파트너 상세 공개가 열려 있고(partner_public_details_enabled) 파트너가 공개에
 * 동의한(v1 '2026-10-04' 또는 v2 '2026-10-06') 경우에만 서명 URL 을 발급한다.
 * 확정 후 화면(결제 완료·예약 상세)에서는 쓰지 않는다 — 사용자 결정 2026-10-06.
 *
 * profiles·partner_public_profiles 는 본인만 읽을 수 있어 서비스 권한으로 조회한다.
 * 서버 전용 모듈이다("use server" 파일에 두면 외부에서 호출 가능한 액션이 된다).
 */
const PUBLIC_CONSENT_VERSIONS = ["2026-10-04", "2026-10-06"];

export async function getConsentedPartnerAvatars(
    partnerIds: string[],
): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const ids = [...new Set(partnerIds)];
    if (ids.length === 0) return map;
    try {
        const admin = createAdminClient();
        const { data: released } = await admin.rpc(
            "partner_public_details_enabled",
        );
        if (released !== true) return map;

        const { data: consents } = await admin
            .from("partner_public_profiles")
            .select("partner_id")
            .in("partner_id", ids)
            .not("consented_at", "is", null)
            .in("consent_version", PUBLIC_CONSENT_VERSIONS)
            .returns<{ partner_id: string }[]>();
        const consented = (consents ?? []).map((c) => c.partner_id);
        if (consented.length === 0) return map;

        const { data: rows } = await admin
            .from("profiles")
            .select("id, avatar_path")
            .in("id", consented)
            .not("avatar_path", "is", null)
            .returns<{ id: string; avatar_path: string }[]>();
        if (!rows || rows.length === 0) return map;

        const { data: signed } = await admin.storage
            .from(PROFILE_PHOTO_BUCKET)
            .createSignedUrls(
                rows.map((r) => r.avatar_path),
                PROFILE_PHOTO_URL_TTL,
            );
        const urlByPath = new Map<string, string>();
        (signed ?? []).forEach((s) => {
            if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
        });
        rows.forEach((r) => {
            const url = urlByPath.get(r.avatar_path);
            if (url) map.set(r.id, url);
        });
    } catch {
        // 사진은 보조 정보다. 실패하면 기본 아이콘으로 보인다.
    }
    return map;
}
