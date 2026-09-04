"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

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
    duration: string;
    hospitalName: string;
    hospitalAddress: string;
    userName: string;
    userPhone: string;
    /** 선결제 예상 금액(할인 전) */
    prepaidAmount: number;
    /** 사용 가능한 포인트 잔액 */
    pointBalance: number;
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
            "id, code, status, confirmed_partner_id, payment_deadline, plan, use_date, reserve_time, duration, hospital_name, hospital_address, patient_name, patient_phone, prepaid_amount",
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
        duration: r.duration ?? "",
        hospitalName: r.hospital_name ?? "",
        hospitalAddress: r.hospital_address ?? "",
        userName: r.patient_name ?? "",
        userPhone: r.patient_phone ?? "",
        prepaidAmount: r.prepaid_amount ?? 0,
        pointBalance: balance ?? 0,
    };
}

/*
 * 결제 준비(`/api/payments/prepare`)는 서버 액션으로 감싸지 않는다.
 * 클라이언트가 같은 오리진 라우트를 직접 부르면 세션 쿠키가 자동으로 실리고,
 * 서버 액션을 한 겹 두면 쿠키를 손으로 옮겨 담아야 해서 오히려 깨지기 쉽다.
 */
