"use client";

import { useEffect } from "react";

import { trackBeginCheckoutGA } from "@/lib/analytics";
import { useReservationStore } from "../_store/reservation-store";
import { IntroModal } from "./intro-modal";
import { StepUserInfo } from "./step-user-info";
import { StepHospitalInfo } from "./step-hospital-info";
import { StepServiceSelect } from "./step-service-select";
import { StepPayment } from "./step-payment";
import { StepMatching } from "./step-matching";
import { StepPartnerSelect } from "./step-partner-select";
import { StepComplete } from "./step-complete";

/** 예약 STEP 오케스트레이터 — 현재 단계 렌더 + STEP0 모달 */
export function ReservationFlow() {
    const step = useReservationStore((s) => s.step);
    const introConfirmed = useReservationStore((s) => s.introConfirmed);

    // 예약 플로우 진입 시 1회 GA begin_checkout 전송
    // (Pixel InitiateCheckout 은 인트로 "예약 시작하기" 클릭에서 발송)
    useEffect(() => {
        trackBeginCheckoutGA();
    }, []);

    return (
        <div>
            {step === 1 && <StepUserInfo />}
            {step === 2 && <StepHospitalInfo />}
            {step === 3 && <StepServiceSelect />}
            {step === 4 && <StepPayment />}
            {step === 5 && <StepMatching />}
            {step === 6 && <StepPartnerSelect />}
            {step === 7 && <StepComplete />}

            {!introConfirmed && <IntroModal />}
        </div>
    );
}
