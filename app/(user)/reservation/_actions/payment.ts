"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { matchingModeOf } from "@/lib/direct-assignment";

/** 신규 방식 결제 화면의 결제 기한 창. 결제 준비 라우트와 같은 10분이다. */
const DIRECT_PAYMENT_WINDOW_MS = 10 * 60 * 1000;

/**
 * 결제 단계(STEP7·8) 지원 서버 액션 (#54).
 *
 *  결제는 PG 페이지로 **전체 이동**하므로 클라이언트 스토어가 통째로 날아간다.
 *  승인 라우트가 `?pay=&rid=` 로 돌려보내면 여기서 예약을 다시 읽어 화면을 복원한다.
 */

export type ResumeState = {
    reservationId: string;
    reservationCode: string;
    status: string;
    /** 선택된 파트너 이름. 없으면 선택이 풀린 것이다 */
    partnerName: string;
    partnerId: string;
    paymentDeadline: string;
    plan: string;
    useDate: string;
    reserveTime: string;
    arriveTime: string;
    duration: string;
    hospitalName: string;
    hospitalAddress: string;
    userName: string;
    userPhone: string;
    /** 선결제 예상 금액(할인 전) */
    prepaidAmount: number;
    /** 사용 가능한 포인트 잔액 */
    pointBalance: number;
    /** 처리 방식 — admin_direct 는 선결제 후 운영자 배정(#300) */
    matchingMode: "legacy_auto" | "admin_direct";
    /** 신규 방식에서 결제 승인·저장이 끝난 시각. 없으면 결제 전 */
    paidAt: string;
};

/**
 * 결제 화면·완료 화면을 그리는 데 필요한 값을 예약에서 읽어온다.
 *
 *  RLS 로 본인 예약만 조회되므로 남의 예약을 넣어도 null 이 나온다.
 *  파트너 이름만 admin 으로 따로 읽는다 — 파트너 프로필은 이용자에게 열려 있지 않다.
 */
export async function resumeReservation(
    reservationId: string,
): Promise<ResumeState | null> {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // 만료된 파트너 선택을 먼저 정리한다 (#65 의 lazy 호출).
    // 크론 전환 전까지는 조회 시점에 풀어주지 않으면 화면에 선택된 것처럼 남는다.
    // 실패해도 화면 복원을 막지 않는다 — 만료 판정은 DB 가 승인 시점에 다시 한다.
    await supabase.rpc("release_expired_selections");

    const { data: r } = await supabase
        .from("reservations")
        .select(
            "id, code, status, confirmed_partner_id, payment_deadline, plan, use_date, reserve_time, arrive_time, duration, hospital_name, hospital_address, patient_name, patient_phone, prepaid_amount, matching_mode, paid_at",
        )
        .eq("id", reservationId)
        .maybeSingle();

    if (!r) return null;

    let partnerName = "";
    if (r.confirmed_partner_id) {
        const admin = createAdminClient();
        const { data: p } = await admin
            .from("profiles")
            .select("name")
            .eq("id", r.confirmed_partner_id)
            .maybeSingle();
        partnerName = p?.name ?? "";
    }

    const { data: balance } = await supabase.rpc("point_balance", {
        p_user_id: user.id,
    });

    return {
        reservationId: r.id,
        reservationCode: r.code,
        status: r.status,
        partnerName,
        partnerId: r.confirmed_partner_id ?? "",
        paymentDeadline: r.payment_deadline ?? "",
        plan: r.plan ?? "basic",
        useDate: r.use_date ?? "",
        reserveTime: r.reserve_time ?? "",
        arriveTime: r.arrive_time ?? "",
        duration: r.duration ?? "",
        hospitalName: r.hospital_name ?? "",
        hospitalAddress: r.hospital_address ?? "",
        userName: r.patient_name ?? "",
        userPhone: r.patient_phone ?? "",
        prepaidAmount: r.prepaid_amount ?? 0,
        pointBalance: balance ?? 0,
        matchingMode: matchingModeOf(r.matching_mode),
        paidAt: r.paid_at ?? "",
    };
}

/**
 * 신규 방식(#300) 결제 화면 준비 — 결제 기한 창을 연다.
 *
 *  신규 방식에는 "파트너 선택 +30분" 기한이 없다. 그런데 이벤트 쿠폰 제안·확보는 살아 있는 결제 기한
 *  (payment_deadline)을 요구하므로, 기한이 비어 있으면 결제 화면이 열려도 쿠폰이 보이지 않는다.
 *  결제 화면에 들어올 때(그리고 결제 준비 때) +10분 창을 건다. 결제 완료(paid_at)가 되면 DB 가 비운다.
 *
 *  고객 권한으로는 신규 방식 예약의 기한을 바꿀 수 없으므로(DB 가드) 서비스 권한으로 쓴다.
 *  소유·상태는 고객 세션(RLS)으로 먼저 확인한다. 기존 방식 예약에는 아무 일도 하지 않는다.
 */
export async function armDirectPayment(
    reservationId: string,
): Promise<{ ok: boolean }> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    const { data: r } = await supabase
        .from("reservations")
        .select("id, status, matching_mode, paid_at")
        .eq("id", reservationId)
        .maybeSingle();
    if (
        !r ||
        r.matching_mode !== "admin_direct" ||
        r.status !== "MATCHING" ||
        r.paid_at
    )
        return { ok: false };

    const admin = createAdminClient();
    const { error } = await admin
        .from("reservations")
        .update({
            payment_deadline: new Date(
                Date.now() + DIRECT_PAYMENT_WINDOW_MS,
            ).toISOString(),
        })
        .eq("id", r.id)
        .eq("customer_id", user.id)
        .eq("status", "MATCHING")
        .is("paid_at", null);
    return { ok: !error };
}

/*
 * 결제 준비(`/api/payments/prepare`)는 서버 액션으로 감싸지 않는다.
 * 클라이언트가 같은 오리진 라우트를 직접 부르면 세션 쿠키가 자동으로 실리고,
 * 서버 액션을 한 겹 두면 쿠키를 손으로 옮겨 담아야 해서 오히려 깨지기 쉽다.
 */
