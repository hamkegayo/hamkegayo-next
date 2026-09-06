"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { trackBeginCheckoutGA } from "@/lib/analytics";
import { useReservationStore } from "../_store/reservation-store";
import { resumeReservation } from "../_actions/payment";
import { IntroModal } from "./intro-modal";
import { StepUserInfo } from "./step-user-info";
import { StepHospitalInfo } from "./step-hospital-info";
import { StepServiceSelect } from "./step-service-select";
import { StepReview } from "./step-review";
import { StepMatching } from "./step-matching";
import { StepPartnerSelect } from "./step-partner-select";
import { StepPayment } from "./step-payment";
import { StepComplete } from "./step-complete";

/** 결제 결과 코드 → 사용자 안내 문구 */
const PAY_ERROR_MESSAGE: Record<string, string> = {
    INVALID_SIGNATURE: "결제 정보를 확인할 수 없습니다. 다시 시도해 주세요.",
    AMOUNT_MISMATCH:
        "결제 금액이 일치하지 않아 취소되었습니다. 다시 시도해 주세요.",
    PAYMENT_EXPIRED:
        "결제 시간이 지나 파트너 선택이 해제되었습니다. 다시 선택해 주세요.",
    UNKNOWN_ORDER: "결제 정보를 찾을 수 없습니다. 고객센터로 문의해 주세요.",
    CONFIRM_FAILED:
        "결제는 취소되었습니다. 예약이 확정되지 않았으니 다시 시도해 주세요.",
    PAYMENT_NOT_PENDING: "이미 처리된 결제입니다.",
};

/** 예약 STEP 오케스트레이터 — 현재 단계 렌더 + STEP0 모달 */
export function ReservationFlow() {
    const step = useReservationStore((s) => s.step);
    const introConfirmed = useReservationStore((s) => s.introConfirmed);
    const router = useRouter();
    const params = useSearchParams();

    /**
     * 결제창에서 돌아왔는지.
     *
     * 결제는 PG 페이지로 **전체 이동**하므로 모듈 싱글턴인 스토어가 통째로 날아간다.
     * 승인 라우트가 `?pay=&rid=` 로 돌려보내면 DB 에서 예약을 다시 읽어 복원한다.
     *   pay=done   결제 성공  → STEP8 (완료)
     *   pay=fail   결제 실패  → STEP7 (결제) 로 되돌리고 사유 안내
     *   pay=resume 마이페이지에서 파트너를 선택하고 넘어온 경우 → STEP7
     */
    const pay = params.get("pay");
    const rid = params.get("rid");
    const payCode = params.get("code");
    const [resuming, setResuming] = useState(() => Boolean(pay && rid));

    useEffect(() => {
        if (!pay || !rid) return;

        let alive = true;
        (async () => {
            const state = await resumeReservation(rid);
            if (!alive) return;

            if (!state) {
                toast.error("예약을 찾을 수 없습니다.");
                router.replace("/mypage");
                return;
            }

            const hydrate = useReservationStore.getState().hydrate;
            const common = {
                reservationId: state.reservationId,
                reservationCode: state.reservationCode,
                confirmedPartnerName: state.partnerName,
                partnerId: state.partnerId,
                paymentDeadline: state.paymentDeadline,
                plan: state.plan as "basic" | "plus",
                useDate: state.useDate,
                reserveTime: state.reserveTime,
                duration: state.duration,
                hospitalName: state.hospitalName,
                hospitalAddress: state.hospitalAddress,
                userName: state.userName,
                userPhone: state.userPhone,
                prepaidAmount: state.prepaidAmount,
                pointBalance: state.pointBalance,
            };

            // 결제가 끝났으면 예약이 CONFIRMED 다. 서버 상태를 믿는다.
            if (state.status === "CONFIRMED") {
                hydrate(8, common);
            } else if (state.partnerId) {
                if (pay === "fail" && payCode) {
                    toast.error(
                        PAY_ERROR_MESSAGE[payCode] ??
                            "결제에 실패했습니다. 다시 시도해 주세요.",
                    );
                }
                hydrate(7, common);
            } else {
                // 선택이 풀렸다(기한 만료 등) → 파트너를 다시 고른다.
                toast.error(
                    "파트너 선택이 해제되었습니다. 다시 선택해 주세요.",
                );
                hydrate(6, common);
            }

            // 쿼리를 지워 새로고침 때 같은 처리가 반복되지 않게 한다.
            router.replace("/reservation");
            setResuming(false);
        })();

        return () => {
            alive = false;
        };
    }, [pay, rid, payCode, router]);

    /**
     * 끝난 플로우(매칭 취소·예약 완료) 정리.
     *
     * 스토어가 모듈 싱글턴이라 클라이언트 이동만으로는 step·data 가 비워지지 않는다.
     * 그대로 두면 "다시 예약하기" 로 들어왔을 때 STEP5(매칭)·STEP8(완료) 화면이 다시 뜬다.
     *
     * 정리 대상은 "들어올 때 이미 끝나 있던" 플로우뿐이다. 머무는 동안 끝난 경우
     * (취소 직후·완료 화면 진입)는 그 화면을 그대로 보여줘야 하므로 마운트 시점의
     * 스냅샷과 현재 값을 함께 본다.
     *
     * 각 STEP 폼은 마운트 시점에 data 를 defaultValues 로 한 번만 읽으므로,
     * 초기화가 끝나기 전에는 아무것도 그리지 않는다. 옛 값을 물고 마운트되면
     * 이후 초기화가 폼에 반영되지 않기 때문.
     *
     * 진행 중이던 플로우(finished=false)는 종전대로 이어서 보여준다.
     * 결제창에서 복귀한 경우(resuming)는 복원이 우선이므로 초기화하지 않는다.
     */
    const [enteredFinished] = useState(
        () => useReservationStore.getState().finished,
    );
    const finished = useReservationStore((s) => s.finished);

    useEffect(() => {
        if (enteredFinished && !resuming)
            useReservationStore.getState().reset();
    }, [enteredFinished, resuming]);

    // 예약 플로우 진입 시 1회 GA begin_checkout 전송
    // (Pixel InitiateCheckout 은 인트로 "예약 시작하기" 클릭에서 발송)
    useEffect(() => {
        trackBeginCheckoutGA();
    }, []);

    // 복원 중에는 옛 단계를 잠깐 보여주지 않는다.
    if (resuming) return null;

    // 초기화가 끝나면 finished 가 내려가고 STEP1 이 새 값으로 마운트된다.
    if (enteredFinished && finished) return null;

    return (
        <div>
            {step === 1 && <StepUserInfo />}
            {step === 2 && <StepHospitalInfo />}
            {step === 3 && <StepServiceSelect />}
            {step === 4 && <StepReview />}
            {step === 5 && <StepMatching />}
            {step === 6 && <StepPartnerSelect />}
            {step === 7 && <StepPayment />}
            {step === 8 && <StepComplete />}

            {!introConfirmed && <IntroModal />}
        </div>
    );
}
