"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatPhoneNumber } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Section } from "@/app/(user)/_components/home/section";
import {
    useReservationStore,
    type ReservationData,
} from "../_store/reservation-store";
import { step1Schema, type Step1Values } from "../_lib/schema";
import { RELATION_OPTIONS } from "../_lib/options";
import { StepBand, StepNav } from "./step-band";
import { FieldError, FieldLabel, NativeSelect, Textarea } from "./fields";

const DOCS = [
    { name: "docPrescription", label: "처방전" },
    { name: "docReceipt", label: "영수증" },
    { name: "docCertificate", label: "진료확인서" },
] as const;

export function StepUserInfo() {
    const { data, patch, next } = useReservationStore();

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        clearErrors,
        formState: { errors },
    } = useForm<Step1Values>({
        resolver: zodResolver(step1Schema),
        mode: "onSubmit",
        reValidateMode: "onSubmit",
        defaultValues: {
            userName: data.userName,
            userBirth: data.userBirth,
            userGender: data.userGender,
            userPhone: data.userPhone,
            guardianName: data.guardianName,
            guardianPhone: data.guardianPhone,
            relation: data.relation,
            treatment: data.treatment,
            purpose: data.purpose,
            cautions: data.cautions,
            docPrescription: data.docPrescription,
            docReceipt: data.docReceipt,
            docCertificate: data.docCertificate,
            otherRequests: data.otherRequests,
        },
    });

    const gender = watch("userGender");

    const onSubmit = (v: Step1Values) => {
        // userGender 등은 UI에서 유효값만 설정되므로 스토어 타입으로 캐스팅
        patch(v as Partial<ReservationData>);
        next();
    };

    const notReady = () => toast.info("준비 중인 기능입니다.");

    return (
        <>
            <StepBand
                index={1}
                title="이용자 정보를 입력해주세요."
                subtitles={[
                    "병원을 방문하시는 이용자의 정보를 입력해주세요.",
                    "입력한 정보는 파트너 매칭 및 안전한 서비스 제공에만 사용됩니다.",
                ]}
            />

            <Section>
                <p className="text-muted-foreground text-center text-sm">
                    * 환자 정보는 마이페이지에서 관리할 수 있습니다.
                </p>
                <div className="mt-1 text-center">
                    <button
                        type="button"
                        onClick={notReady}
                        className="text-foreground hover:text-brand text-sm font-bold"
                    >
                        [ 이용자 정보 불러오기 ]
                    </button>
                </div>

                <form
                    onSubmit={handleSubmit(onSubmit)}
                    noValidate
                    className="mx-auto mt-8 max-w-3xl space-y-6"
                >
                    {/* 이용자 정보 */}
                    <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                        <h2 className="text-foreground text-lg font-bold">
                            이용자 정보
                        </h2>
                        <div className="mt-5 grid gap-5 md:grid-cols-2">
                            <div>
                                <FieldLabel htmlFor="userName" required>
                                    이용자 성함
                                </FieldLabel>
                                <Input
                                    id="userName"
                                    placeholder="홍길동"
                                    aria-invalid={!!errors.userName}
                                    {...register("userName", {
                                        onChange: () =>
                                            errors.userName &&
                                            clearErrors("userName"),
                                    })}
                                />
                                <FieldError>
                                    {errors.userName?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="userBirth" required>
                                    이용자 생년월일
                                </FieldLabel>
                                <Input
                                    id="userBirth"
                                    type="date"
                                    className="cursor-pointer"
                                    onClick={(e) =>
                                        e.currentTarget.showPicker?.()
                                    }
                                    aria-invalid={!!errors.userBirth}
                                    {...register("userBirth", {
                                        onChange: () =>
                                            errors.userBirth &&
                                            clearErrors("userBirth"),
                                    })}
                                />
                                <FieldError>
                                    {errors.userBirth?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel required>이용자 성별</FieldLabel>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { value: "female", label: "여성" },
                                        { value: "male", label: "남성" },
                                    ].map((g) => (
                                        <button
                                            key={g.value}
                                            type="button"
                                            onClick={() => {
                                                setValue("userGender", g.value);
                                                clearErrors("userGender");
                                            }}
                                            aria-pressed={gender === g.value}
                                            className={cn(
                                                "h-11 rounded-lg border text-sm font-semibold transition-colors",
                                                gender === g.value
                                                    ? "border-brand bg-brand/5 text-brand"
                                                    : "border-input bg-background text-foreground hover:bg-muted",
                                            )}
                                        >
                                            {g.label}
                                        </button>
                                    ))}
                                </div>
                                <FieldError>
                                    {errors.userGender?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="userPhone" required>
                                    이용자 연락처
                                </FieldLabel>
                                <Input
                                    id="userPhone"
                                    inputMode="numeric"
                                    placeholder="010-1234-5678"
                                    aria-invalid={!!errors.userPhone}
                                    {...register("userPhone", {
                                        onChange: (e) => {
                                            setValue(
                                                "userPhone",
                                                formatPhoneNumber(
                                                    e.target.value,
                                                ),
                                            );
                                            if (errors.userPhone)
                                                clearErrors("userPhone");
                                        },
                                    })}
                                />
                                <FieldError>
                                    {errors.userPhone?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="guardianName" required>
                                    예약자(보호자) 성함
                                </FieldLabel>
                                <Input
                                    id="guardianName"
                                    placeholder="홍길동"
                                    aria-invalid={!!errors.guardianName}
                                    {...register("guardianName", {
                                        onChange: () =>
                                            errors.guardianName &&
                                            clearErrors("guardianName"),
                                    })}
                                />
                                <FieldError>
                                    {errors.guardianName?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="guardianPhone" required>
                                    예약자(보호자) 연락처
                                </FieldLabel>
                                <Input
                                    id="guardianPhone"
                                    inputMode="numeric"
                                    placeholder="010-1234-5678"
                                    aria-invalid={!!errors.guardianPhone}
                                    {...register("guardianPhone", {
                                        onChange: (e) => {
                                            setValue(
                                                "guardianPhone",
                                                formatPhoneNumber(
                                                    e.target.value,
                                                ),
                                            );
                                            if (errors.guardianPhone)
                                                clearErrors("guardianPhone");
                                        },
                                    })}
                                />
                                <FieldError>
                                    {errors.guardianPhone?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="relation" required>
                                    이용자와의 관계
                                </FieldLabel>
                                <NativeSelect
                                    id="relation"
                                    aria-invalid={!!errors.relation}
                                    {...register("relation", {
                                        onChange: () =>
                                            errors.relation &&
                                            clearErrors("relation"),
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
                                    {errors.relation?.message}
                                </FieldError>
                            </div>
                        </div>
                    </div>

                    {/* 진료 정보 */}
                    <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                        <h2 className="text-foreground text-lg font-bold">
                            진료 정보
                        </h2>
                        <div className="mt-5 grid gap-5 md:grid-cols-2">
                            <div>
                                <FieldLabel htmlFor="treatment" required>
                                    예약된 진료/검사 기재
                                </FieldLabel>
                                <Input
                                    id="treatment"
                                    placeholder="수면 내시경"
                                    aria-invalid={!!errors.treatment}
                                    {...register("treatment", {
                                        onChange: () =>
                                            errors.treatment &&
                                            clearErrors("treatment"),
                                    })}
                                />
                                <FieldError>
                                    {errors.treatment?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="purpose" required>
                                    진료 목적
                                </FieldLabel>
                                <Input
                                    id="purpose"
                                    placeholder="정기 검진"
                                    aria-invalid={!!errors.purpose}
                                    {...register("purpose", {
                                        onChange: () =>
                                            errors.purpose &&
                                            clearErrors("purpose"),
                                    })}
                                />
                                <FieldError>
                                    {errors.purpose?.message}
                                </FieldError>
                            </div>
                        </div>

                        <div className="mt-5">
                            <FieldLabel htmlFor="cautions">
                                동행시 주의해야 할 점
                            </FieldLabel>
                            <Textarea
                                id="cautions"
                                placeholder="'몸이 불편하셔서 휠체어 및 부축이 필요합니다.' 와 같은 이용자의 상태에 관련된 주의점을 말씀해주세요."
                                {...register("cautions")}
                            />
                        </div>

                        {/* 요청사항 */}
                        <div className="mt-6">
                            <h3 className="text-foreground text-sm font-bold">
                                요청사항
                            </h3>
                            <div className="mt-3 grid gap-5 md:grid-cols-2">
                                <div>
                                    <p className="text-foreground text-sm font-semibold">
                                        서류 촬영 요청{" "}
                                        <span className="text-muted-foreground font-normal">
                                            (보호자에게 전달)
                                        </span>
                                    </p>
                                    <div className="mt-3 flex flex-col gap-3">
                                        {DOCS.map((doc) => (
                                            <label
                                                key={doc.name}
                                                className="text-foreground flex items-center gap-2 text-sm"
                                            >
                                                <Checkbox
                                                    checked={
                                                        watch(doc.name) ?? false
                                                    }
                                                    onCheckedChange={(
                                                        checked,
                                                    ) =>
                                                        setValue(
                                                            doc.name,
                                                            checked === true,
                                                        )
                                                    }
                                                />
                                                {doc.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <FieldLabel htmlFor="otherRequests">
                                        기타 요청사항
                                    </FieldLabel>
                                    <Textarea
                                        id="otherRequests"
                                        placeholder="'다음 예약을 잡아주세요.'와 같은 요청사항을 말씀해주세요."
                                        {...register("otherRequests")}
                                    />
                                </div>
                            </div>
                            <p className="text-muted-foreground mt-3 text-xs">
                                ※ 진단서, 검사결과지 등 민감정보가 포함된 서류는
                                기본 제공되지 않으며, 요청 시에만 제공됩니다.
                            </p>
                        </div>
                    </div>

                    <StepNav />
                </form>
            </Section>
        </>
    );
}
