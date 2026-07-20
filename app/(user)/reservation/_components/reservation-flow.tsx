"use client";

import { useReservationStore } from "../_store/reservation-store";
import { IntroModal } from "./intro-modal";
import { StepUserInfo } from "./step-user-info";
import { StepHospitalInfo } from "./step-hospital-info";
import { StepServiceSelect } from "./step-service-select";

/** 예약 STEP 오케스트레이터 — 현재 단계 렌더 + STEP0 모달 */
export function ReservationFlow() {
    const step = useReservationStore((s) => s.step);
    const introConfirmed = useReservationStore((s) => s.introConfirmed);

    return (
        <div>
            {step === 1 && <StepUserInfo />}
            {step === 2 && <StepHospitalInfo />}
            {step === 3 && <StepServiceSelect />}

            {!introConfirmed && <IntroModal />}
        </div>
    );
}
