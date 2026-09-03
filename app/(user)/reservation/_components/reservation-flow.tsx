"use client";

import { useEffect, useState } from "react";

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

    /**
     * 끝난 플로우(매칭 취소·예약 완료) 정리.
     *
     * 스토어가 모듈 싱글턴이라 클라이언트 이동만으로는 step·data 가 비워지지 않는다.
     * 그대로 두면 "다시 예약하기" 로 들어왔을 때 STEP5(매칭)·STEP7(완료) 화면이 다시 뜬다.
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
     */
    const [enteredFinished] = useState(
        () => useReservationStore.getState().finished,
    );
    const finished = useReservationStore((s) => s.finished);

    useEffect(() => {
        if (enteredFinished) useReservationStore.getState().reset();
    }, [enteredFinished]);

    // 예약 플로우 진입 시 1회 GA begin_checkout 전송
    // (Pixel InitiateCheckout 은 인트로 "예약 시작하기" 클릭에서 발송)
    useEffect(() => {
        trackBeginCheckoutGA();
    }, []);

    // 초기화가 끝나면 finished 가 내려가고 STEP1 이 새 값으로 마운트된다.
    if (enteredFinished && finished) return null;

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
