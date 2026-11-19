"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { trackBeginCheckoutGA } from "@/lib/analytics";
import { useReservationStore } from "../_store/reservation-store";
import { resumeReservation } from "../_actions/payment";
import { paymentErrorMessage, resumeStepFor } from "../_lib/flow-branch";
import { IntroModal } from "./intro-modal";
import { preferredScrollBehavior } from "./fields";
import { StepUserInfo } from "./step-user-info";
import { StepHospitalInfo } from "./step-hospital-info";
import { StepServiceSelect } from "./step-service-select";
import { StepReview } from "./step-review";
import { StepMatching } from "./step-matching";
import { StepConsentPending } from "./step-consent-pending";
import { StepPartnerSelect } from "./step-partner-select";
import { StepPayment } from "./step-payment";
import { StepComplete } from "./step-complete";

/** 예약 STEP 오케스트레이터 — 현재 단계 렌더 + STEP0 모달 */
export function ReservationFlow() {
    const step = useReservationStore((s) => s.step);
    const introConfirmed = useReservationStore((s) => s.introConfirmed);
    // 처리방침 제10조 — 이용자 본인 동의 대기 중이면 5단계 자리에 동의 안내 화면을 둔다 (#306)
    const consentStatus = useReservationStore((s) => s.data.consentStatus);
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
                arriveTime: state.arriveTime,
                duration: state.duration,
                hospitalName: state.hospitalName,
                hospitalAddress: state.hospitalAddress,
                userName: state.userName,
                userPhone: state.userPhone,
                prepaidAmount: state.prepaidAmount,
                pointBalance: state.pointBalance,
                matchingMode: state.matchingMode,
            };

            // 신규 방식(#300) — 파트너 선택 단계가 없다. 서버 상태만 믿고 결제/완료로 보낸다.
            if (state.matchingMode === "admin_direct") {
                const target = resumeStepFor(state);
                if (target === "mypage") {
                    toast.error(
                        "취소된 예약입니다. 예약 현황을 확인해 주세요.",
                    );
                    router.replace("/mypage");
                    return;
                }
                if (target === 8) {
                    // 결제가 끝났다 — 확정이 아니라 매칭 대기 안내(STEP8)를 보여준다.
                    hydrate(8, common);
                } else {
                    if (pay === "fail" && payCode) {
                        toast.error(
                            paymentErrorMessage(payCode, state.matchingMode),
                        );
                    }
                    hydrate(7, common);
                }
                router.replace("/reservation");
                setResuming(false);
                return;
            }

            // 결제가 끝났으면 예약이 CONFIRMED 다. 서버 상태를 믿는다.
            if (state.status === "CONFIRMED") {
                hydrate(8, common);
            } else if (state.partnerId) {
                if (pay === "fail" && payCode) {
                    toast.error(
                        paymentErrorMessage(payCode, state.matchingMode),
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

    // 단계 이동 또는 인트로 모달 닫힘 직후 상단 스크롤 + 단계 제목 포커스
    useEffect(() => {
        if (!introConfirmed || resuming || (enteredFinished && finished)) {
            return;
        }
        window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
        document
            .getElementById("reservation-step-title")
            ?.focus({ preventScroll: true });
    }, [step, introConfirmed, resuming, enteredFinished, finished]);

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
            {step === 5 &&
                (consentStatus === "PENDING_USER" ? (
                    <StepConsentPending />
                ) : (
                    <StepMatching />
                ))}
            {step === 6 && <StepPartnerSelect />}
            {step === 7 && <StepPayment />}
            {step === 8 && <StepComplete />}

            {!introConfirmed && <IntroModal />}
        </div>
    );
}
