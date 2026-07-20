"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Input } from "@/components/ui/input";
import { Section } from "@/app/(user)/_components/home/section";
import { useReservationStore } from "../_store/reservation-store";
import { step2Schema, type Step2Values } from "../_lib/schema";
import { DURATION_OPTIONS, TIME_OPTIONS } from "../_lib/options";
import { StepBand, StepNav } from "./step-band";
import { FieldError, FieldLabel, NativeSelect } from "./fields";

export function StepHospitalInfo() {
    const { data, patch, next, prev } = useReservationStore();

    const {
        register,
        handleSubmit,
        clearErrors,
        formState: { errors },
    } = useForm<Step2Values>({
        resolver: zodResolver(step2Schema),
        mode: "onSubmit",
        reValidateMode: "onSubmit",
        defaultValues: {
            useDate: data.useDate,
            arriveTime: data.arriveTime,
            reserveTime: data.reserveTime,
            duration: data.duration,
            departAddress: data.departAddress,
            hospitalAddress: data.hospitalAddress,
        },
    });

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

                    <StepNav onPrev={prev} />
                </form>
            </Section>
        </>
    );
}
