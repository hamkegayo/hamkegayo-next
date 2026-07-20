"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatCardNumber, digitsOnly } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Section } from "@/app/(user)/_components/home/section";
import { useReservationStore, PLAN_INFO } from "../_store/reservation-store";
import { step4Schema, type Step4Values } from "../_lib/schema";
import { CARD_COMPANIES, INSTALLMENTS, PAY_METHODS } from "../_lib/options";
import { createReservation } from "../_actions/reservation";
import { StepBand, StepNav } from "./step-band";
import { FieldError, FieldLabel, NativeSelect } from "./fields";

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

export function StepPayment() {
    const { data, patch, next, prev } = useReservationStore();
    const router = useRouter();
    const plan = PLAN_INFO[data.plan || "basic"];
    const [agreed, setAgreed] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        clearErrors,
        formState: { errors },
    } = useForm<Step4Values>({
        resolver: zodResolver(step4Schema),
        mode: "onSubmit",
        reValidateMode: "onSubmit",
        defaultValues: {
            method: "card",
            cardCompany: "",
            cardNumber: "",
            expMonth: "",
            expYear: "",
            installment: "",
        },
    });

    const method = watch("method");
    const isCard = method === "card";

    const onSubmit = async () => {
        // 결제는 스텁. 검증 통과 시 예약을 MATCHING 상태로 등록한다.
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
                <form onSubmit={handleSubmit(onSubmit)} noValidate>
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
                                <Readonly
                                    label="진료 목적"
                                    value={data.purpose}
                                />
                            </div>

                            <div className="mt-4">
                                <Readonly
                                    label="동행시 주의해야 할 점"
                                    value={data.cautions}
                                />
                            </div>

                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <Readonly
                                    label="이용 날짜"
                                    value={data.useDate}
                                />
                                <Readonly label="동행 파트너" />
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
                                <Readonly
                                    label="병원 주소"
                                    value={data.hospitalAddress}
                                />
                            </div>
                        </div>

                        {/* 우측: 결제 + 안내 */}
                        <div className="space-y-6">
                            <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                                <h2 className="text-foreground text-lg font-bold">
                                    결제 내역
                                </h2>
                                <div className="border-border mt-4 flex items-center justify-between border-b pb-4">
                                    <span className="text-foreground font-semibold">
                                        예상비용
                                    </span>
                                    <span className="text-foreground text-lg font-extrabold">
                                        {plan.price.toLocaleString()}원
                                    </span>
                                </div>

                                <div className="mt-5 space-y-5">
                                    <div>
                                        <FieldLabel htmlFor="method">
                                            결제수단
                                        </FieldLabel>
                                        <NativeSelect
                                            id="method"
                                            {...register("method")}
                                        >
                                            {PAY_METHODS.map((m) => (
                                                <option
                                                    key={m.value}
                                                    value={m.value}
                                                >
                                                    {m.label}
                                                </option>
                                            ))}
                                        </NativeSelect>
                                    </div>

                                    {isCard && (
                                        <>
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <FieldLabel
                                                        htmlFor="cardCompany"
                                                        required
                                                    >
                                                        결제 카드사
                                                    </FieldLabel>
                                                    <button
                                                        type="button"
                                                        className="text-brand text-sm font-semibold hover:underline"
                                                    >
                                                        등록된 카드
                                                    </button>
                                                </div>
                                                <NativeSelect
                                                    id="cardCompany"
                                                    aria-invalid={
                                                        !!errors.cardCompany
                                                    }
                                                    {...register(
                                                        "cardCompany",
                                                        {
                                                            onChange: () =>
                                                                errors.cardCompany &&
                                                                clearErrors(
                                                                    "cardCompany",
                                                                ),
                                                        },
                                                    )}
                                                >
                                                    <option value="">
                                                        카드사를 선택하세요.
                                                    </option>
                                                    {CARD_COMPANIES.map((c) => (
                                                        <option
                                                            key={c}
                                                            value={c}
                                                        >
                                                            {c}
                                                        </option>
                                                    ))}
                                                </NativeSelect>
                                                <FieldError>
                                                    {
                                                        errors.cardCompany
                                                            ?.message
                                                    }
                                                </FieldError>
                                            </div>

                                            <div>
                                                <FieldLabel
                                                    htmlFor="cardNumber"
                                                    required
                                                >
                                                    카드 번호
                                                </FieldLabel>
                                                <Input
                                                    id="cardNumber"
                                                    inputMode="numeric"
                                                    placeholder="카드 번호를 입력하세요."
                                                    aria-invalid={
                                                        !!errors.cardNumber
                                                    }
                                                    {...register("cardNumber", {
                                                        onChange: (e) => {
                                                            setValue(
                                                                "cardNumber",
                                                                formatCardNumber(
                                                                    e.target
                                                                        .value,
                                                                ),
                                                            );
                                                            if (
                                                                errors.cardNumber
                                                            )
                                                                clearErrors(
                                                                    "cardNumber",
                                                                );
                                                        },
                                                    })}
                                                />
                                                <FieldError>
                                                    {errors.cardNumber?.message}
                                                </FieldError>
                                            </div>

                                            <div>
                                                <FieldLabel required>
                                                    유효기간
                                                </FieldLabel>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <Input
                                                            inputMode="numeric"
                                                            placeholder="월 (MM)"
                                                            aria-invalid={
                                                                !!errors.expMonth
                                                            }
                                                            {...register(
                                                                "expMonth",
                                                                {
                                                                    onChange: (
                                                                        e,
                                                                    ) => {
                                                                        setValue(
                                                                            "expMonth",
                                                                            digitsOnly(
                                                                                e
                                                                                    .target
                                                                                    .value,
                                                                                2,
                                                                            ),
                                                                        );
                                                                        if (
                                                                            errors.expMonth
                                                                        )
                                                                            clearErrors(
                                                                                "expMonth",
                                                                            );
                                                                    },
                                                                },
                                                            )}
                                                        />
                                                        <FieldError>
                                                            {
                                                                errors.expMonth
                                                                    ?.message
                                                            }
                                                        </FieldError>
                                                    </div>
                                                    <div>
                                                        <Input
                                                            inputMode="numeric"
                                                            placeholder="년 (YY)"
                                                            aria-invalid={
                                                                !!errors.expYear
                                                            }
                                                            {...register(
                                                                "expYear",
                                                                {
                                                                    onChange: (
                                                                        e,
                                                                    ) => {
                                                                        setValue(
                                                                            "expYear",
                                                                            digitsOnly(
                                                                                e
                                                                                    .target
                                                                                    .value,
                                                                                2,
                                                                            ),
                                                                        );
                                                                        if (
                                                                            errors.expYear
                                                                        )
                                                                            clearErrors(
                                                                                "expYear",
                                                                            );
                                                                    },
                                                                },
                                                            )}
                                                        />
                                                        <FieldError>
                                                            {
                                                                errors.expYear
                                                                    ?.message
                                                            }
                                                        </FieldError>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <FieldLabel
                                                    htmlFor="installment"
                                                    required
                                                >
                                                    할부 기간
                                                </FieldLabel>
                                                <NativeSelect
                                                    id="installment"
                                                    aria-invalid={
                                                        !!errors.installment
                                                    }
                                                    {...register(
                                                        "installment",
                                                        {
                                                            onChange: () =>
                                                                errors.installment &&
                                                                clearErrors(
                                                                    "installment",
                                                                ),
                                                        },
                                                    )}
                                                >
                                                    <option value="">
                                                        할부 기간을 선택하세요.
                                                    </option>
                                                    {INSTALLMENTS.map((i) => (
                                                        <option
                                                            key={i}
                                                            value={i}
                                                        >
                                                            {i}
                                                        </option>
                                                    ))}
                                                </NativeSelect>
                                                <FieldError>
                                                    {
                                                        errors.installment
                                                            ?.message
                                                    }
                                                </FieldError>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* 서비스 안내문 */}
                            <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                                <h3 className="text-foreground font-bold">
                                    서비스 안내문
                                </h3>
                                <div className="text-muted-foreground mt-4 space-y-3 text-sm leading-relaxed">
                                    <p>
                                        서비스는 후불제이며, 모든 서비스가
                                        종료된 이후 최종 요금 안내에 따라 결제를
                                        진행해주시면 됩니다.
                                    </p>
                                    <p>
                                        카드결제를 이용하실 경우
                                        [마이페이지]에서 사용하실 카드를
                                        등록하시면 편리하게 카드 정보로 결제하실
                                        수 있습니다.
                                    </p>
                                    <p>
                                        택시비와 진료비 등의 부가 비용은
                                        고객님께서 부담해주셔야 합니다.
                                    </p>
                                    <p>
                                        플랫폼 내 전문 인력 스스로 매칭 신청을
                                        검토하므로, 매칭 신청을 하시더라도 최종
                                        매칭에 실패할 가능성이 있음을
                                        알려드립니다.
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
                        nextLabel={submitting ? "예약 등록 중…" : "다음"}
                        nextDisabled={!agreed || submitting}
                    />
                </form>
            </Section>
        </>
    );
}
