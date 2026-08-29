"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
    PROFILE_PHOTO_BUCKET,
    PROFILE_PHOTO_URL_TTL,
} from "@/lib/profile-photo";

export type ApplicantQualification = { type: string; issuer: string | null };

/** 예약 플로우(매칭 대기·파트너 선택)에서 쓰는 실제 지원자 상세 */
export type DetailedApplicant = {
    partnerId: string;
    name: string;
    appliedAtLabel: string;
    /** 리뷰 평균 평점 (없으면 null) */
    rating: number | null;
    reviewCount: number;
    /** 검증된(VERIFIED) 자격/면허 */
    qualifications: ApplicantQualification[];
    /** 프로필 사진 signed URL (미등록·발급 실패 시 null) */
    avatarUrl: string | null;
};

/** 지원 시각 라벨 (MM.DD HH:mm) */
function formatAppliedAt(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mm}.${dd} ${hh}:${mi}`;
}

/**
 * 파트너 id → 프로필 사진 signed URL 맵.
 * 사진 미등록 파트너는 맵에 담기지 않아 화면에서 기본 아이콘으로 폴백된다.
 */
async function signPartnerAvatars(
    admin: ReturnType<typeof createAdminClient>,
    partnerIds: string[],
): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    const { data: rows } = await admin
        .from("profiles")
        .select("id, avatar_path")
        .in("id", partnerIds)
        .not("avatar_path", "is", null)
        .returns<{ id: string; avatar_path: string }[]>();

    if (!rows || rows.length === 0) return map;

    const { data: signed } = await admin.storage
        .from(PROFILE_PHOTO_BUCKET)
        .createSignedUrls(
            rows.map((r) => r.avatar_path),
            PROFILE_PHOTO_URL_TTL,
        );
    if (!signed) return map;

    const urlByPath = new Map<string, string>();
    signed.forEach((s) => {
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    });

    rows.forEach((r) => {
        const url = urlByPath.get(r.avatar_path);
        if (url) map.set(r.id, url);
    });

    return map;
}

/**
 * 예약의 ACCEPTED 지원 파트너 상세 목록.
 *  - get_reservation_applicants RPC(소유권 내부 검증)로 지원자 조회
 *  - reviews(공개 읽기)로 평점 집계
 *  - partner_qualifications(본인만 RLS)는 admin 으로 조회(RPC가 검증한 partner_id 한정, VERIFIED만)
 *  - 프로필 사진도 같은 이유(profiles 는 select_own)로 admin 으로 경로를 읽고
 *    비공개 버킷의 signed URL 을 발급해 내려준다.
 * 실패/비소유/비로그인 시 빈 배열.
 */
export async function getReservationApplicantsDetailed(
    reservationId: string,
): Promise<DetailedApplicant[]> {
    try {
        const supabase = await createClient();

        const { data: apps, error } = await supabase.rpc(
            "get_reservation_applicants",
            { p_reservation_id: reservationId },
        );
        if (error || !apps) return [];

        const list = apps as {
            partner_id: string;
            partner_name: string;
            applied_at: string;
        }[];
        if (list.length === 0) return [];

        const partnerIds = list.map((a) => a.partner_id);

        // 평점 집계 (reviews 공개 읽기)
        const { data: reviews } = await supabase
            .from("reviews")
            .select("partner_id, rating")
            .in("partner_id", partnerIds)
            .returns<{ partner_id: string; rating: number }[]>();

        const ratingMap = new Map<string, { sum: number; count: number }>();
        (reviews ?? []).forEach((r) => {
            const cur = ratingMap.get(r.partner_id) ?? { sum: 0, count: 0 };
            cur.sum += r.rating;
            cur.count += 1;
            ratingMap.set(r.partner_id, cur);
        });

        // 자격/면허 (본인만 RLS → admin 으로 조회, VERIFIED만)
        const admin = createAdminClient();
        const { data: quals } = await admin
            .from("partner_qualifications")
            .select("partner_id, type, issuer")
            .in("partner_id", partnerIds)
            .eq("status", "VERIFIED")
            .returns<
                { partner_id: string; type: string; issuer: string | null }[]
            >();

        const qualMap = new Map<string, ApplicantQualification[]>();
        (quals ?? []).forEach((q) => {
            const arr = qualMap.get(q.partner_id) ?? [];
            arr.push({ type: q.type, issuer: q.issuer });
            qualMap.set(q.partner_id, arr);
        });

        // 프로필 사진 (profiles 는 본인만 RLS → admin 으로 경로 조회 후 signed URL 발급)
        const avatarMap = await signPartnerAvatars(admin, partnerIds);

        return list.map((a) => {
            const r = ratingMap.get(a.partner_id);
            return {
                partnerId: a.partner_id,
                name: a.partner_name,
                appliedAtLabel: formatAppliedAt(a.applied_at),
                rating: r && r.count > 0 ? r.sum / r.count : null,
                reviewCount: r?.count ?? 0,
                qualifications: qualMap.get(a.partner_id) ?? [],
                avatarUrl: avatarMap.get(a.partner_id) ?? null,
            };
        });
    } catch {
        return [];
    }
}

export type CancelReservationResult =
    { ok: true } | { ok: false; message: string };

/**
 * 예약 취소 (고객 본인, 매칭 중인 건만) — 예약 플로우 '취소 요청'용.
 *  - RLS(reservations_update_own)로 본인 예약만 UPDATE 가능.
 *  - status = MATCHING 인 건만 CANCELLED 로 전환.
 *  - 취소되면 파트너 수락 대기 목록(status=MATCHING 조회)에서 자동 제외된다.
 */
export async function cancelReservation(
    reservationId: string,
): Promise<CancelReservationResult> {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return { ok: false, message: "로그인이 필요합니다." };
    }

    const { data, error } = await supabase
        .from("reservations")
        .update({ status: "CANCELLED" })
        .eq("id", reservationId)
        .eq("status", "MATCHING")
        .select("id")
        .maybeSingle();

    if (error) {
        return {
            ok: false,
            message: "취소에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }
    if (!data) {
        return {
            ok: false,
            message: "취소할 수 없는 예약입니다.",
        };
    }

    revalidatePath("/mypage");
    return { ok: true };
}
