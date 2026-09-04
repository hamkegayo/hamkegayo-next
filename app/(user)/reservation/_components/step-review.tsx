"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Section } from "@/app/(user)/_components/home/section";
import { useReservationStore, PLAN_INFO } from "../_store/reservation-store";
import { createReservation } from "../_actions/reservation";
import { getReservationQuote } from "../_actions/quote";
import type { ReservationQuote } from "../_lib/quote.server";
import { formatMinutes, PAYMENT_DEADLINE_MIN } from "@/lib/pricing";
import { trackReservationComplete } from "@/lib/analytics";
import { StepBand, StepNav } from "./step-band";

/**
 * STEP4 · 신청 내역 확인.
 *
 *  #54 이전에는 이 자리에서 카드 정보를 받았다. 결제는 파트너 선택 뒤(STEP7)로
 *  옮겼으므로 여기서는 **입력 없이 확인만** 한다.
 *  약관 제9조 ④ — 파트너를 고르고 선결제를 마친 시점에 예약이 확정된다.
 *
 *  "다음" 을 누르면 예약이 MATCHING 으로 등록되고 파트너 모집이 시작된다.
 *  이 시점에는 아직 결제가 없다 → 매칭에 실패해도 환불이 발생하지 않는다.
 */

const GENDER_LABEL: Record<string, string> = {
    female: "여성",
    male: "남성",
};

/** 읽기 전용 요약 필드 */
function Readonly({ label, value }: { label: string; value?: string }) {
    return (
        <div>
            <p className="text-foreground mb-2 text-sm font-semibold">
                {label}
            </p>
            <div className="border-border bg-background text-foreground min-h-11 rounded-lg border border-dashed px-3.5 py-2.5 text-sm">
                {value ? (
                    value
                ) : (
                    <span className="text-muted-foreground">-</span>
                )}
            </div>
        </div>
    );
}

export function StepReview() {
    const { data, patch, next, prev } = useReservationStore();
    const router = useRouter();
    const plan = PLAN_INFO[data.plan || "basic"];
    const [agreed, setAgreed] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // 예상비용 — 공휴일 판정이 서버에서만 가능해 서버 액션으로 받아온다(#46).
    const [quote, setQuote] = useState<ReservationQuote | null>(null);
    const { plan: planCode, useDate, duration } = data;

    useEffect(() => {
        if (!useDate || !duration) return;

        let alive = true;
        getReservationQuote({
            plan: planCode || "basic",
            useDate,
            duration,
        }).then((q) => {
            if (alive) setQuote(q);
        });
        return () => {
            alive = false;
        };
    }, [planCode, useDate, duration]);

    const onSubmit = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const res = await createReservation(data);
            if (!res.ok) {
                if (res.reason === "auth") {
                    toast.error(res.message);
                    router.push("/login");
                } else {
                    toast.error(res.message);
                }
                return;
            }
            patch({ reservationCode: res.code, reservationId: res.id });
            // 서버가 성공을 반환한 직후에만 예약 신청 완료 이벤트 전송
            if (data.plan) trackReservationComplete(data.plan, quote?.amount);
            next();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <StepBand
                index={4}
                title="매칭 신청을 확인해주세요."
                subtitles={[
                    "신청 내역을 확인해주세요.",
                    "입력하신 정보를 바탕으로 추천된 파트너에게 매칭 요청이 전달됩니다.",
                ]}
            />

            <Section>
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* 좌측: 신청 내역 요약 */}
                    <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                        <h2 className="text-foreground text-lg font-bold">
                            신청 내역을 확인해주세요!
                        </h2>
                        <p className="text-brand mt-3 font-bold">
                            {plan.badge}
                        </p>

                        <p className="text-foreground mt-5 text-sm font-bold">
                            신청 내역
                        </p>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            <Readonly
                                label="이용자 성함"
                                value={data.userName}
                            />
                            <Readonly
                                label="이용자 생년월일"
                                value={data.userBirth}
                            />
                            <Readonly
                                label="이용자 연락처"
                                value={data.userPhone}
                            />
                            <Readonly
                                label="이용자 성별"
                                value={GENDER_LABEL[data.userGender]}
                            />
                            <Readonly
                                label="예약된 진료/검사"
                                value={data.treatment}
                            />
                            <Readonly label="진료 목적" value={data.purpose} />
                            <Readonly
                                label="거동 상태"
                                value={data.mobilityStatus}
                            />
                            <Readonly
                                label="인지 상태"
                                value={data.cognitiveStatus}
                            />
                        </div>

                        <div className="mt-4">
                            <Readonly
                                label="동행시 주의해야 할 점"
                                value={data.cautions}
                            />
                        </div>

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <Readonly label="이용 날짜" value={data.useDate} />
                            <Readonly
                                label="예상 소요시간"
                                value={data.duration}
                            />
                        </div>

                        <div className="mt-4 space-y-4">
                            <Readonly
                                label="파트너 출발지 도착 희망 시간"
                                value={data.arriveTime}
                            />
                            <Readonly
                                label="병원 진료 예약 시간"
                                value={data.reserveTime}
                            />
                            <Readonly
                                label="출발지 주소"
                                value={data.departAddress}
                            />
                            <Readonly label="병원" value={data.hospitalName} />
                            <Readonly
                                label="병원 주소"
                                value={data.hospitalAddress}
                            />
                        </div>
                    </div>

                    {/* 우측: 예상 비용 + 안내 */}
                    <div className="space-y-6">
                        <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                            <h2 className="text-foreground text-lg font-bold">
                                예상 결제 금액
                            </h2>
                            <p className="bg-brand/5 text-muted-foreground mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed">
                                지금은 결제하지 않습니다. 파트너를 선택한 뒤{" "}
                                <span className="text-brand font-semibold">
                                    {PAYMENT_DEADLINE_MIN}분 안에 결제
                                </span>
                                하시면 예약이 확정됩니다.
                            </p>
                            <div className="border-border mt-4 space-y-2.5 border-b pb-4 text-sm">
                                <div className="text-muted-foreground flex items-center justify-between">
                                    <span>
                                        기본 이용요금
                                        {quote
                                            ? ` (${formatMinutes(quote.prepayMinutes)})`
                                            : ""}
                                    </span>
                                    <span className="text-foreground font-semibold">
                                        {quote
                                            ? `${quote.baseAmount.toLocaleString()}원`
                                            : "계산 중…"}
                                    </span>
                                </div>

                                {quote && quote.surchargeAmount > 0 && (
                                    <div className="text-muted-foreground flex items-center justify-between">
                                        <span>주말·공휴일 할증 30%</span>
                                        <span className="text-foreground font-semibold">
                                            +
                                            {quote.surchargeAmount.toLocaleString()}
                                            원
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-center justify-between pt-1">
                                    <span className="text-foreground font-semibold">
                                        선결제 예상 금액
                                    </span>
                                    <span className="text-foreground text-lg font-extrabold">
                                        {quote
                                            ? `${quote.amount.toLocaleString()}원`
                                            : "-"}
                                    </span>
                                </div>

                                <p className="text-muted-foreground text-xs leading-relaxed">
                                    시간당 {plan.price.toLocaleString()}원 ·
                                    최소 2시간분을 먼저 결제합니다. 서비스 종료
                                    후 실제 이용시간으로 정산하여 남으면 환불,
                                    모자라면 추가결제를 안내드립니다.
                                </p>
                            </div>

                            <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
                                결제는 카드·간편결제로 진행되며 카드 정보는
                                결제사가 직접 처리합니다. 저희는 카드 정보를
                                저장하지 않습니다.
                            </p>
                        </div>

                        {/* 서비스 안내문 */}
                        <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                            <h3 className="text-foreground font-bold">
                                서비스 안내문
                            </h3>
                            <div className="text-muted-foreground mt-4 space-y-3 text-sm leading-relaxed">
                                <p>
                                    예약 확정을 위해 최소 2시간분의 이용요금을
                                    먼저 결제합니다. 서비스 종료 후 실제
                                    이용시간과 주말·공휴일 할증을 반영해 최종
                                    요금을 산정하며, 남는 금액은 환불하고 모자란
                                    금액은 추가결제를 안내드립니다.
                                </p>
                                <p>
                                    택시비와 진료비 등의 부가 비용은 고객님께서
                                    부담해주셔야 합니다.
                                </p>
                                <p>
                                    플랫폼 내 전문 인력 스스로 매칭 신청을
                                    검토하므로, 매칭 신청을 하시더라도 최종
                                    매칭에 실패할 가능성이 있음을 알려드립니다.
                                    매칭 전에는 결제가 발생하지 않습니다.
                                </p>
                            </div>
                            <div className="bg-border my-5 h-px" />
                            <label className="flex items-center gap-2">
                                <Checkbox
                                    checked={agreed}
                                    onCheckedChange={(c) =>
                                        setAgreed(c === true)
                                    }
                                />
                                <span className="text-foreground text-sm font-medium">
                                    후불 결제 및 서비스 이용 안내를
                                    확인했습니다.
                                </span>
                            </label>
                        </div>
                    </div>
                </div>

                <StepNav
                    onPrev={prev}
                    nextType="button"
                    onNext={onSubmit}
                    nextLabel={submitting ? "매칭 신청 중…" : "매칭 신청하기"}
                    nextDisabled={!agreed || submitting}
                />
            </Section>
        </>
    );
}
