"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Input } from "@/components/ui/input";
import { formatPhoneNumber } from "@/lib/format";
import { Section } from "@/app/(user)/_components/home/section";
import { useReservationStore } from "../_store/reservation-store";
import { step2Form, type Step2Values } from "../_lib/schema";
import { DURATION_OPTIONS, TIME_OPTIONS } from "../_lib/options";
import {
    END_METHOD_OPTIONS,
    HANDOVER_FAIL_WAIT_MIN,
    NO_SHOW_WAIT_MIN,
    TRANSPORT_OPTIONS,
} from "@/lib/handover";
import { RELATION_OPTIONS } from "../_lib/options";
import { StepBand, StepNav } from "./step-band";
import { FieldError, FieldLabel, NativeSelect } from "./fields";

export function StepHospitalInfo() {
    const { data, patch, next, prev } = useReservationStore();

    const {
        register,
        handleSubmit,
        clearErrors,
        control,
        setValue,
        formState: { errors },
    } = useForm<Step2Values>({
        resolver: zodResolver(step2Form),
        mode: "onSubmit",
        reValidateMode: "onSubmit",
        defaultValues: {
            useDate: data.useDate,
            arriveTime: data.arriveTime,
            reserveTime: data.reserveTime,
            duration: data.duration,
            departAddress: data.departAddress,
            hospitalName: data.hospitalName,
            hospitalAddress: data.hospitalAddress,
            transportTo: data.transportTo as never,
            transportHome: data.transportHome as never,
            endMethod: data.endMethod as never,
            handoverName: data.handoverName,
            handoverRelation: data.handoverRelation,
            handoverPhone: data.handoverPhone,
            backupHandoverName: data.backupHandoverName,
            backupHandoverRelation: data.backupHandoverRelation,
            backupHandoverPhone: data.backupHandoverPhone,
        },
    });

    // 종료방식이 성인 인계일 때만 인계자 입력을 띄운다. 독립 귀가를 고르면
    // 입력 6개가 통째로 사라져 폼이 짧아진다.
    const endMethod = useWatch({ control, name: "endMethod" });
    const needsHandover = endMethod === "ADULT_HANDOVER";

    const onSubmit = (v: Step2Values) => {
        patch(v);
        next();
    };

    return (
        <>
            <StepBand
                index={2}
                title="병원 정보를 입력해주세요."
                subtitles={[
                    "방문하실 병원 정보를 입력해주세요.",
                    "입력한 정보를 바탕으로 적합한 파트너를 추천해드립니다.",
                ]}
            />

            <Section>
                <form
                    onSubmit={handleSubmit(onSubmit)}
                    noValidate
                    className="mx-auto max-w-3xl space-y-6"
                >
                    <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                        <h2 className="text-foreground text-lg font-bold">
                            병원 및 일정 정보
                        </h2>

                        <div className="mt-5 space-y-5">
                            <div>
                                <FieldLabel htmlFor="useDate" required>
                                    이용 날짜
                                </FieldLabel>
                                <Input
                                    id="useDate"
                                    type="date"
                                    className="cursor-pointer"
                                    onClick={(e) =>
                                        e.currentTarget.showPicker?.()
                                    }
                                    aria-invalid={!!errors.useDate}
                                    {...register("useDate", {
                                        onChange: () =>
                                            errors.useDate &&
                                            clearErrors("useDate"),
                                    })}
                                />
                                <FieldError>
                                    {errors.useDate?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="arriveTime" required>
                                    파트너의 출발지 도착 희망 시간
                                </FieldLabel>
                                <NativeSelect
                                    id="arriveTime"
                                    aria-invalid={!!errors.arriveTime}
                                    {...register("arriveTime", {
                                        onChange: () =>
                                            errors.arriveTime &&
                                            clearErrors("arriveTime"),
                                    })}
                                >
                                    <option value="">시간을 선택하세요</option>
                                    {TIME_OPTIONS.map((t) => (
                                        <option key={t} value={t}>
                                            {t}
                                        </option>
                                    ))}
                                </NativeSelect>
                                <FieldError>
                                    {errors.arriveTime?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="reserveTime" required>
                                    병원 진료 예약 시간
                                </FieldLabel>
                                <NativeSelect
                                    id="reserveTime"
                                    aria-invalid={!!errors.reserveTime}
                                    {...register("reserveTime", {
                                        onChange: () =>
                                            errors.reserveTime &&
                                            clearErrors("reserveTime"),
                                    })}
                                >
                                    <option value="">시간을 선택하세요</option>
                                    {TIME_OPTIONS.map((t) => (
                                        <option key={t} value={t}>
                                            {t}
                                        </option>
                                    ))}
                                </NativeSelect>
                                <FieldError>
                                    {errors.reserveTime?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="duration" required>
                                    예상 소요 시간
                                </FieldLabel>
                                <NativeSelect
                                    id="duration"
                                    aria-invalid={!!errors.duration}
                                    {...register("duration", {
                                        onChange: () =>
                                            errors.duration &&
                                            clearErrors("duration"),
                                    })}
                                >
                                    <option value="">시간을 선택하세요</option>
                                    {DURATION_OPTIONS.map((d) => (
                                        <option key={d} value={d}>
                                            {d}
                                        </option>
                                    ))}
                                </NativeSelect>
                                <FieldError>
                                    {errors.duration?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="departAddress" required>
                                    출발지 주소 (자택, 터미널, 지하철 역 등)
                                </FieldLabel>
                                <Input
                                    id="departAddress"
                                    placeholder="서울특별시 청운동 108-14"
                                    aria-invalid={!!errors.departAddress}
                                    {...register("departAddress", {
                                        onChange: () =>
                                            errors.departAddress &&
                                            clearErrors("departAddress"),
                                    })}
                                />
                                <FieldError>
                                    {errors.departAddress?.message}
                                </FieldError>
                            </div>

                            <div>
                                {/* 병원명은 매칭 전 파트너에게 제공된다 (처리방침 제5조 ②) */}
                                <FieldLabel htmlFor="hospitalName" required>
                                    병원 이름
                                </FieldLabel>
                                <Input
                                    id="hospitalName"
                                    placeholder="세브란스병원"
                                    aria-invalid={!!errors.hospitalName}
                                    {...register("hospitalName", {
                                        onChange: () =>
                                            errors.hospitalName &&
                                            clearErrors("hospitalName"),
                                    })}
                                />
                                <FieldError>
                                    {errors.hospitalName?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="hospitalAddress" required>
                                    병원 주소
                                </FieldLabel>
                                <Input
                                    id="hospitalAddress"
                                    placeholder="서울특별시 연세로 1로"
                                    aria-invalid={!!errors.hospitalAddress}
                                    {...register("hospitalAddress", {
                                        onChange: () =>
                                            errors.hospitalAddress &&
                                            clearErrors("hospitalAddress"),
                                    })}
                                />
                                <FieldError>
                                    {errors.hospitalAddress?.message}
                                </FieldError>
                            </div>
                        </div>
                    </div>

                    {/*
                      이동·귀가·종료방식 — 매뉴얼 1장이 업무 시작 조건으로
                      정한 항목이다. 이 셋이 비어 있으면 파트너는 업무를
                      시작하지 않는다.
                    */}
                    <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                        <h2 className="text-foreground text-lg font-bold">
                            이동 및 귀가
                        </h2>
                        <p className="text-muted-foreground mt-1.5 text-sm">
                            파트너는 개인 차량으로 이용자를 모시거나
                            이용자·보호자 차량을 대신 운전하지 않습니다.
                        </p>

                        <div className="mt-5 space-y-5">
                            <div>
                                <FieldLabel htmlFor="transportTo" required>
                                    병원까지 이동수단
                                </FieldLabel>
                                <NativeSelect
                                    id="transportTo"
                                    aria-invalid={!!errors.transportTo}
                                    {...register("transportTo", {
                                        onChange: () =>
                                            errors.transportTo &&
                                            clearErrors("transportTo"),
                                    })}
                                >
                                    <option value="">선택하세요</option>
                                    {TRANSPORT_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </NativeSelect>
                                <FieldError>
                                    {errors.transportTo?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="transportHome" required>
                                    귀가수단
                                </FieldLabel>
                                <NativeSelect
                                    id="transportHome"
                                    aria-invalid={!!errors.transportHome}
                                    {...register("transportHome", {
                                        onChange: () =>
                                            errors.transportHome &&
                                            clearErrors("transportHome"),
                                    })}
                                >
                                    <option value="">선택하세요</option>
                                    {TRANSPORT_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </NativeSelect>
                                <FieldError>
                                    {errors.transportHome?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="endMethod" required>
                                    종료 방식
                                </FieldLabel>
                                <NativeSelect
                                    id="endMethod"
                                    aria-invalid={!!errors.endMethod}
                                    {...register("endMethod", {
                                        onChange: () =>
                                            errors.endMethod &&
                                            clearErrors("endMethod"),
                                    })}
                                >
                                    <option value="">선택하세요</option>
                                    {END_METHOD_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </NativeSelect>
                                <FieldError>
                                    {errors.endMethod?.message}
                                </FieldError>
                            </div>
                        </div>
                    </div>

                    {needsHandover && (
                        <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                            <h2 className="text-foreground text-lg font-bold">
                                인계자 정보
                            </h2>
                            <p className="text-muted-foreground mt-1.5 text-sm">
                                파트너가 이용자를 직접 인계할 분입니다. 현장에서
                                성함·관계·연락처를 대조한 뒤 인계합니다.
                            </p>

                            <div className="mt-5 grid gap-5 md:grid-cols-2">
                                <div>
                                    <FieldLabel htmlFor="handoverName" required>
                                        인계자 성함
                                    </FieldLabel>
                                    <Input
                                        id="handoverName"
                                        placeholder="홍길동"
                                        aria-invalid={!!errors.handoverName}
                                        {...register("handoverName", {
                                            onChange: () =>
                                                errors.handoverName &&
                                                clearErrors("handoverName"),
                                        })}
                                    />
                                    <FieldError>
                                        {errors.handoverName?.message}
                                    </FieldError>
                                </div>

                                <div>
                                    <FieldLabel
                                        htmlFor="handoverRelation"
                                        required
                                    >
                                        이용자와의 관계
                                    </FieldLabel>
                                    <NativeSelect
                                        id="handoverRelation"
                                        aria-invalid={!!errors.handoverRelation}
                                        {...register("handoverRelation", {
                                            onChange: () =>
                                                errors.handoverRelation &&
                                                clearErrors("handoverRelation"),
                                        })}
                                    >
                                        <option value="">선택하세요</option>
                                        {RELATION_OPTIONS.map((r) => (
                                            <option key={r} value={r}>
                                                {r}
                                            </option>
                                        ))}
                                    </NativeSelect>
                                    <FieldError>
                                        {errors.handoverRelation?.message}
                                    </FieldError>
                                </div>

                                <div className="md:col-span-2">
                                    <FieldLabel
                                        htmlFor="handoverPhone"
                                        required
                                    >
                                        인계자 연락처
                                    </FieldLabel>
                                    <Input
                                        id="handoverPhone"
                                        inputMode="numeric"
                                        placeholder="010-1234-5678"
                                        aria-invalid={!!errors.handoverPhone}
                                        {...register("handoverPhone", {
                                            onChange: (e) => {
                                                setValue(
                                                    "handoverPhone",
                                                    formatPhoneNumber(
                                                        e.target.value,
                                                    ),
                                                );
                                                if (errors.handoverPhone)
                                                    clearErrors(
                                                        "handoverPhone",
                                                    );
                                            },
                                        })}
                                    />
                                    <FieldError>
                                        {errors.handoverPhone?.message}
                                    </FieldError>
                                </div>
                            </div>

                            {/*
                              대응카드 18 — 인계자가 오지 않으면 등록된 대체
                              인계자에게 순서대로 연락한다. "등록되어 있으면"
                              이라 조건부로 쓰고 있어 선택 입력이다.
                            */}
                            <div className="border-border mt-6 border-t pt-6">
                                <p className="text-foreground text-sm font-semibold">
                                    대체 인계자{" "}
                                    <span className="text-muted-foreground font-normal">
                                        (선택)
                                    </span>
                                </p>
                                <p className="text-muted-foreground mt-1 text-sm">
                                    인계자와 연락이 닿지 않을 때 다음으로
                                    연락드립니다.
                                </p>

                                <div className="mt-4 grid gap-5 md:grid-cols-2">
                                    <div>
                                        <FieldLabel htmlFor="backupHandoverName">
                                            성함
                                        </FieldLabel>
                                        <Input
                                            id="backupHandoverName"
                                            placeholder="홍길순"
                                            {...register("backupHandoverName")}
                                        />
                                    </div>

                                    <div>
                                        <FieldLabel htmlFor="backupHandoverRelation">
                                            이용자와의 관계
                                        </FieldLabel>
                                        <NativeSelect
                                            id="backupHandoverRelation"
                                            {...register(
                                                "backupHandoverRelation",
                                            )}
                                        >
                                            <option value="">선택하세요</option>
                                            {RELATION_OPTIONS.map((r) => (
                                                <option key={r} value={r}>
                                                    {r}
                                                </option>
                                            ))}
                                        </NativeSelect>
                                    </div>

                                    <div className="md:col-span-2">
                                        <FieldLabel htmlFor="backupHandoverPhone">
                                            연락처
                                        </FieldLabel>
                                        <Input
                                            id="backupHandoverPhone"
                                            inputMode="numeric"
                                            placeholder="010-1234-5678"
                                            {...register(
                                                "backupHandoverPhone",
                                                {
                                                    onChange: (e) =>
                                                        setValue(
                                                            "backupHandoverPhone",
                                                            formatPhoneNumber(
                                                                e.target.value,
                                                            ),
                                                        ),
                                                },
                                            )}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/*
                              대기 기준은 예약별로 받지 않는다 —
                              미도착은 약관 제15조 ③④ 가, 인계 실패는 회사 정책이
                              정한다. 고객이 알아야 하므로 표시만 한다.
                            */}
                            <p className="text-muted-foreground mt-6 text-xs leading-relaxed">
                                인계자가 오지 않으면 파트너는{" "}
                                {HANDOVER_FAIL_WAIT_MIN}분간 이용자 곁에서
                                기다린 뒤 종료합니다. 이용자가 약속 장소에
                                나오지 않는 경우에는 예약시각부터{" "}
                                {NO_SHOW_WAIT_MIN}분간 기다립니다.
                            </p>
                        </div>
                    )}

                    <StepNav onPrev={prev} />
                </form>
            </Section>
        </>
    );
}
