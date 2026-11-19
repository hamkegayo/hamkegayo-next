"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatPhoneNumber, kstToday } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Section } from "@/app/(user)/_components/home/section";
import {
    useReservationStore,
    type ReservationData,
} from "../_store/reservation-store";
import { step1Form, type Step1Values } from "../_lib/schema";
import {
    isSelfRelation,
    PROXY_REASON_DETAIL_MAX,
    PROXY_REASON_DETAIL_MIN,
    PROXY_REASON_OPTIONS,
} from "@/lib/proxy-consent";
import {
    COGNITIVE_OPTIONS,
    MOBILITY_OPTIONS,
    RELATION_OPTIONS,
} from "../_lib/options";
import { NOTIFY_TARGET_OPTIONS } from "@/lib/handover";
import { newReservationMatchingMode } from "@/lib/direct-assignment";
import { totalStepsFor } from "../_lib/flow-branch";
import { StepBand, StepNav } from "./step-band";
import { CareRecipientPicker } from "./care-recipient-picker";
import { listMyCareRecipients } from "../_actions/care";
import type { CareRecipient } from "@/app/(user)/mypage/_lib/care.server";
import {
    FieldError,
    FieldLabel,
    NativeSelect,
    Textarea,
    focusFieldById,
    focusFirstErrorField,
} from "./fields";

const STEP1_FIELD_ORDER = [
    "userName",
    "userBirth",
    "userGender",
    "userPhone",
    "guardianName",
    "guardianPhone",
    "relation",
    "consentMode",
    "proxyReasonCode",
    "proxyReasonDetail",
    "proxyAuthorityPledge",
    "notifyTarget",
    "treatment",
    "purpose",
    "mobilityStatus",
    "cognitiveStatus",
    "agreePreMatchingHealth",
] as const;

/** 처리방침 제10조 ①-③ — 대리 예약의 동의 방식 선택지 */
const CONSENT_MODE_OPTIONS = [
    {
        value: "USER_DIRECT",
        id: "consentMode-direct",
        title: "이용자 본인이 직접 동의 (원칙)",
        desc: "예약 후 이용자 본인에게 보낼 동의 링크가 만들어집니다. 이용자가 본인 확인 후 직접 동의하면 파트너 매칭이 시작됩니다.",
    },
    {
        value: "GUARDIAN_PROXY",
        id: "consentMode-proxy",
        title: "보호자가 대리 동의 (예외)",
        desc: "의사능력 제한 등으로 이용자가 직접 동의할 수 없는 경우에만 선택할 수 있습니다. 사유와 대리 권한을 확인합니다.",
    },
] as const;

const DOCS = [
    { name: "docPrescription", label: "처방전" },
    { name: "docReceipt", label: "영수증" },
    { name: "docCertificate", label: "진료확인서" },
] as const;

export function StepUserInfo() {
    const { data, patch, next } = useReservationStore();
    const totalSteps = totalStepsFor(
        data.matchingMode === "admin_direct"
            ? "admin_direct"
            : newReservationMatchingMode(),
    );

    const {
        register,
        handleSubmit,
        setValue,
        getValues,
        watch,
        control,
        clearErrors,
        formState: { errors },
    } = useForm<Step1Values>({
        resolver: zodResolver(step1Form),
        mode: "onSubmit",
        reValidateMode: "onSubmit",
        shouldFocusError: false,
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
            mobilityStatus: data.mobilityStatus,
            cognitiveStatus: data.cognitiveStatus,
            agreePreMatchingHealth: data.agreePreMatchingHealth,
            cautions: data.cautions,
            docPrescription: data.docPrescription,
            docReceipt: data.docReceipt,
            docCertificate: data.docCertificate,
            otherRequests: data.otherRequests,
            notifyTarget: data.notifyTarget as "USER" | "GUARDIAN" | "BOTH",
            shareMedicalInfo: data.shareMedicalInfo,
            consentMode: data.consentMode,
            proxyReasonCode:
                data.proxyReasonCode as Step1Values["proxyReasonCode"],
            proxyReasonDetail: data.proxyReasonDetail,
            proxyAuthorityPledge: data.proxyAuthorityPledge,
        },
    });

    const gender = watch("userGender");
    const relation = watch("relation");
    const consentMode = watch("consentMode");
    // 처리방침 제10조 — 관계가 "본인"이 아니면 대리 예약이다.
    const isProxy = !!relation && !isSelfRelation(relation);
    // 본인 직접 동의(USER_DIRECT)는 거동·인지 상태 제공 동의와 진료 내용 전달 동의를 이용자가 링크에서 직접 한다.
    const userDirect = isProxy && consentMode === "USER_DIRECT";
    const guardianProxy = isProxy && consentMode === "GUARDIAN_PROXY";

    const onSubmit = (v: Step1Values) => {
        // 본인 예약이면 대리 동의 입력을 비운다. 대리 예약에서는 보호자가 대신 동의할 수 없는
        // 진료 내용 전달 동의(제10조 ④)를 끈다. 서버도 같은 규칙을 다시 적용한다.
        const normalized: Step1Values = isProxy
            ? {
                  ...v,
                  shareMedicalInfo: false,
                  agreePreMatchingHealth: userDirect
                      ? false
                      : v.agreePreMatchingHealth,
                  ...(userDirect
                      ? {
                            proxyReasonCode: "",
                            proxyReasonDetail: "",
                            proxyAuthorityPledge: false,
                        }
                      : {}),
              }
            : {
                  ...v,
                  consentMode: "",
                  proxyReasonCode: "",
                  proxyReasonDetail: "",
                  proxyAuthorityPledge: false,
              };
        // userGender 등은 UI에서 유효값만 설정되므로 스토어 타입으로 캐스팅
        patch(normalized as Partial<ReservationData>);
        next();
    };

    // 저장해 둔 환자 정보 불러오기
    const [pickerOpen, setPickerOpen] = useState(false);
    const [recipients, setRecipients] = useState<CareRecipient[]>([]);
    const [loadingRecipients, startLoad] = useTransition();

    const openPicker = () => {
        setPickerOpen(true);
        startLoad(async () => {
            const list = await listMyCareRecipients();
            setRecipients(list);
        });
    };

    /**
     * 고른 환자를 폼에 채운다.
     *
     *  ⚠️ 관계(relation)는 채우지 않는다. 마이페이지는 자유 입력("어머니")이고
     *     예약 폼은 RELATION_OPTIONS 선택형("부모")이라 값 체계가 다르다.
     *     정확히 일치할 때만 채우고, 아니면 사용자가 직접 고르게 둔다.
     */
    const applyRecipient = (r: CareRecipient) => {
        setValue("userName", r.name);
        clearErrors("userName");

        if (r.birth) {
            setValue("userBirth", r.birth);
            clearErrors("userBirth");
        }
        if (r.gender) {
            setValue("userGender", r.gender);
            clearErrors("userGender");
        }
        if (r.phone) {
            setValue("userPhone", formatPhoneNumber(r.phone));
            clearErrors("userPhone");
        }
        // 관계는 값 체계가 달라 일치할 때만 채운다. 못 채운 것을 사용자가 알아야
        // 빈 칸을 지나치지 않으므로 토스트로 알린다. 확인 모달을 한 겹 더 두면
        // 클릭만 늘고 흐름을 끊는다.
        const relationFilled =
            !!r.relation && RELATION_OPTIONS.includes(r.relation);
        if (relationFilled) {
            setValue("relation", r.relation);
            clearErrors("relation");
        }

        setPickerOpen(false);
        toast.success(
            relationFilled
                ? `${r.name} 님의 정보로 채워졌습니다.`
                : `${r.name} 님의 정보로 채워졌습니다. 관계는 직접 선택해 주세요.`,
        );
        setTimeout(() => {
            if (!getValues("guardianName")?.trim()) {
                focusFieldById("guardianName");
            } else if (!getValues("guardianPhone")?.trim()) {
                focusFieldById("guardianPhone");
            } else if (!relationFilled && !getValues("relation")?.trim()) {
                focusFieldById("relation");
            } else if (!getValues("treatment")?.trim()) {
                focusFieldById("treatment");
            }
        }, 0);
    };

    return (
        <>
            <StepBand
                index={1}
                totalSteps={totalSteps}
                title="이용자 정보를 입력해주세요."
                subtitles={[
                    "병원을 방문하시는 이용자의 정보를 입력해주세요.",
                    "입력한 정보는 파트너 매칭 및 안전한 서비스 제공에만 사용됩니다.",
                ]}
            />

            <CareRecipientPicker
                open={pickerOpen}
                loading={loadingRecipients}
                recipients={recipients}
                onClose={() => setPickerOpen(false)}
                onSelect={applyRecipient}
            />

            <Section>
                <p className="text-description-foreground text-center text-sm leading-relaxed">
                    * 환자 정보는 마이페이지에서 관리할 수 있습니다.
                </p>
                <div className="mt-1 text-center">
                    <button
                        type="button"
                        onClick={openPicker}
                        className="text-foreground hover:text-brand text-sm font-bold"
                    >
                        [ 이용자 정보 불러오기 ]
                    </button>
                </div>

                <form
                    onSubmit={handleSubmit(onSubmit, (errs) =>
                        focusFirstErrorField(STEP1_FIELD_ORDER, errs),
                    )}
                    noValidate
                    className="mx-auto mt-8 max-w-3xl space-y-6"
                >
                    {/* 이용자 정보 */}
                    <div className="bg-panel-muted rounded-2xl p-6 md:p-8">
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
                                    aria-describedby={
                                        errors.userName
                                            ? "userName-error"
                                            : undefined
                                    }
                                    {...register("userName", {
                                        onChange: () =>
                                            errors.userName &&
                                            clearErrors("userName"),
                                    })}
                                />
                                <FieldError id="userName-error">
                                    {errors.userName?.message}
                                </FieldError>
                            </div>

                            <div>
                                <FieldLabel htmlFor="userBirth" required>
                                    이용자 생년월일
                                </FieldLabel>
                                {/*
                                  키보드로 바로 치고, 달력이 필요하면 아이콘을 누른다.
                                  생년월일은 과거 연도라 달력으로 고르는 편이 더 느리다.
                                */}
                                <Controller
                                    control={control}
                                    name="userBirth"
                                    render={({ field }) => (
                                        <DateField
                                            id="userBirth"
                                            value={field.value ?? ""}
                                            onChange={(v) => {
                                                field.onChange(v);
                                                if (errors.userBirth)
                                                    clearErrors("userBirth");
                                            }}
                                            max={kstToday()}
                                            invalid={!!errors.userBirth}
                                            aria-describedby={
                                                errors.userBirth
                                                    ? "userBirth-error"
                                                    : undefined
                                            }
                                        />
                                    )}
                                />
                                <FieldError id="userBirth-error">
                                    {errors.userBirth?.message}
                                </FieldError>
                                <p className="text-description-foreground mt-1.5 text-sm leading-relaxed">
                                    서비스 이용일 기준 만 19세 이상만 이용할 수
                                    있습니다.
                                </p>
                            </div>

                            <div>
                                <FieldLabel required>이용자 성별</FieldLabel>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { value: "female", label: "여성" },
                                        { value: "male", label: "남성" },
                                    ].map((g, i) => (
                                        <button
                                            key={g.value}
                                            id={
                                                i === 0
                                                    ? "userGender"
                                                    : undefined
                                            }
                                            type="button"
                                            onClick={() => {
                                                setValue("userGender", g.value);
                                                clearErrors("userGender");
                                            }}
                                            aria-pressed={gender === g.value}
                                            aria-describedby={
                                                errors.userGender
                                                    ? "userGender-error"
                                                    : undefined
                                            }
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
                                <FieldError id="userGender-error">
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
                                    aria-describedby={
                                        errors.userPhone
                                            ? "userPhone-error"
                                            : undefined
                                    }
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
                                <FieldError id="userPhone-error">
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
                                    aria-describedby={
                                        errors.guardianName
                                            ? "guardianName-error"
                                            : undefined
                                    }
                                    {...register("guardianName", {
                                        onChange: () =>
                                            errors.guardianName &&
                                            clearErrors("guardianName"),
                                    })}
                                />
                                <FieldError id="guardianName-error">
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
                                    aria-describedby={
                                        errors.guardianPhone
                                            ? "guardianPhone-error"
                                            : undefined
                                    }
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
                                <FieldError id="guardianPhone-error">
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
                                    aria-describedby={
                                        errors.relation
                                            ? "relation-error"
                                            : undefined
                                    }
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
                                <FieldError id="relation-error">
                                    {errors.relation?.message}
                                </FieldError>
                            </div>

                            {/*
                              처리방침 제10조 ①-③ — 대리 예약은 이용자 본인 동의가 원칙이다.
                              보호자 대리 동의는 이용자가 직접 동의할 수 없는 예외 사유가 있을 때만 받는다.
                            */}
                            {isProxy && (
                                <fieldset
                                    id="consentMode"
                                    tabIndex={-1}
                                    className="border-border bg-background rounded-xl border p-4 md:col-span-2 md:p-5"
                                    aria-describedby={
                                        errors.consentMode
                                            ? "consentMode-error"
                                            : undefined
                                    }
                                >
                                    <legend className="text-foreground px-1 text-sm font-bold">
                                        <span className="text-brand mr-0.5">
                                            *
                                        </span>
                                        이용자 본인의 동의 방식
                                    </legend>
                                    <p className="text-description-foreground text-sm leading-relaxed">
                                        다른 분을 대신해 예약하시는 경우,
                                        거동·인지 상태와 진료 내용 전달에 대한
                                        동의는 이용자 본인이 하시는 것이
                                        원칙입니다.
                                    </p>
                                    <div className="mt-3 space-y-2.5">
                                        {CONSENT_MODE_OPTIONS.map((o) => (
                                            <label
                                                key={o.value}
                                                className="flex cursor-pointer items-start gap-2.5"
                                            >
                                                <input
                                                    type="radio"
                                                    id={o.id}
                                                    name="consentModeRadio"
                                                    className="mt-1"
                                                    checked={
                                                        consentMode === o.value
                                                    }
                                                    onChange={() => {
                                                        setValue(
                                                            "consentMode",
                                                            o.value,
                                                        );
                                                        clearErrors(
                                                            "consentMode",
                                                        );
                                                    }}
                                                />
                                                <span className="text-sm leading-relaxed">
                                                    <span className="text-foreground block font-semibold">
                                                        {o.title}
                                                    </span>
                                                    <span className="text-muted-foreground block">
                                                        {o.desc}
                                                    </span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                    <FieldError id="consentMode-error">
                                        {errors.consentMode?.message}
                                    </FieldError>

                                    {guardianProxy && (
                                        <div className="border-border mt-4 space-y-4 border-t pt-4">
                                            <div>
                                                <FieldLabel
                                                    htmlFor="proxyReasonCode"
                                                    required
                                                >
                                                    대리 동의가 필요한 사유
                                                </FieldLabel>
                                                <NativeSelect
                                                    id="proxyReasonCode"
                                                    aria-invalid={
                                                        !!errors.proxyReasonCode
                                                    }
                                                    aria-describedby={
                                                        errors.proxyReasonCode
                                                            ? "proxyReasonCode-error"
                                                            : undefined
                                                    }
                                                    {...register(
                                                        "proxyReasonCode",
                                                        {
                                                            onChange: () =>
                                                                errors.proxyReasonCode &&
                                                                clearErrors(
                                                                    "proxyReasonCode",
                                                                ),
                                                        },
                                                    )}
                                                >
                                                    <option value="">
                                                        선택하세요
                                                    </option>
                                                    {PROXY_REASON_OPTIONS.map(
                                                        (r) => (
                                                            <option
                                                                key={r.value}
                                                                value={r.value}
                                                            >
                                                                {r.label}
                                                            </option>
                                                        ),
                                                    )}
                                                </NativeSelect>
                                                <FieldError id="proxyReasonCode-error">
                                                    {
                                                        errors.proxyReasonCode
                                                            ?.message
                                                    }
                                                </FieldError>
                                            </div>
                                            <div>
                                                <FieldLabel
                                                    htmlFor="proxyReasonDetail"
                                                    required
                                                >
                                                    사유 상세
                                                </FieldLabel>
                                                <Textarea
                                                    id="proxyReasonDetail"
                                                    maxLength={
                                                        PROXY_REASON_DETAIL_MAX
                                                    }
                                                    placeholder={`이용자가 직접 동의할 수 없는 상황을 ${PROXY_REASON_DETAIL_MIN}자 이상 구체적으로 적어 주세요.`}
                                                    aria-invalid={
                                                        !!errors.proxyReasonDetail
                                                    }
                                                    aria-describedby={
                                                        errors.proxyReasonDetail
                                                            ? "proxyReasonDetail-error"
                                                            : undefined
                                                    }
                                                    {...register(
                                                        "proxyReasonDetail",
                                                        {
                                                            onChange: () =>
                                                                errors.proxyReasonDetail &&
                                                                clearErrors(
                                                                    "proxyReasonDetail",
                                                                ),
                                                        },
                                                    )}
                                                />
                                                <FieldError id="proxyReasonDetail-error">
                                                    {
                                                        errors.proxyReasonDetail
                                                            ?.message
                                                    }
                                                </FieldError>
                                            </div>
                                            <div>
                                                <Controller
                                                    control={control}
                                                    name="proxyAuthorityPledge"
                                                    render={({ field }) => (
                                                        <label className="flex cursor-pointer items-start gap-2.5">
                                                            <Checkbox
                                                                id="proxyAuthorityPledge"
                                                                nativeButton
                                                                render={
                                                                    <button type="button" />
                                                                }
                                                                className="mt-0.5"
                                                                checked={
                                                                    field.value ===
                                                                    true
                                                                }
                                                                aria-invalid={
                                                                    !!errors.proxyAuthorityPledge
                                                                }
                                                                aria-describedby={
                                                                    errors.proxyAuthorityPledge
                                                                        ? "proxyAuthorityPledge-error"
                                                                        : undefined
                                                                }
                                                                onCheckedChange={(
                                                                    checked,
                                                                ) => {
                                                                    field.onChange(
                                                                        checked ===
                                                                            true,
                                                                    );
                                                                    clearErrors(
                                                                        "proxyAuthorityPledge",
                                                                    );
                                                                }}
                                                            />
                                                            <span className="text-foreground text-sm leading-relaxed font-medium">
                                                                저는 이용자를
                                                                대신해 동의할 수
                                                                있는 정당한
                                                                권한(법정대리인
                                                                또는 이에 준하는
                                                                보호 관계)이
                                                                있으며, 위
                                                                사유가 사실임을
                                                                확인합니다.
                                                            </span>
                                                        </label>
                                                    )}
                                                />
                                                <FieldError id="proxyAuthorityPledge-error">
                                                    {
                                                        errors
                                                            .proxyAuthorityPledge
                                                            ?.message
                                                    }
                                                </FieldError>
                                            </div>
                                        </div>
                                    )}
                                </fieldset>
                            )}

                            {/*
                              통보대상 — 매뉴얼 4단계에서 파트너가 "도착했습니다"
                              를 보낼 대상이다. 용어정의상 이용자 또는 보호자다.
                            */}
                            <div>
                                <FieldLabel htmlFor="notifyTarget" required>
                                    도착·진행상황을 알려드릴 대상
                                </FieldLabel>
                                <NativeSelect
                                    id="notifyTarget"
                                    aria-invalid={!!errors.notifyTarget}
                                    aria-describedby={
                                        errors.notifyTarget
                                            ? "notifyTarget-error"
                                            : undefined
                                    }
                                    {...register("notifyTarget", {
                                        onChange: () =>
                                            errors.notifyTarget &&
                                            clearErrors("notifyTarget"),
                                    })}
                                >
                                    {NOTIFY_TARGET_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </NativeSelect>
                                <FieldError id="notifyTarget-error">
                                    {errors.notifyTarget?.message}
                                </FieldError>
                                {/* 자동 발송이 아니다 — 앱 알림은 예약자 계정으로만 간다 (#254) */}
                                <p className="text-description-foreground mt-1.5 text-sm leading-relaxed">
                                    파트너가 현장에서 이 분께 직접 연락드려요.
                                    앱 알림은 지금 예약을 진행하는 분의 앱으로
                                    가요.
                                </p>
                            </div>

                            {/*
                              약관 제8조 ① — 진료내용을 보호자에게 전달할지는
                              이용자 의사에 따른다. 동의하지 않으면 파트너는
                              전달하지 않는다(대응카드 16).
                            */}
                            {isProxy && (
                                <p className="text-description-foreground text-sm leading-relaxed md:col-span-2">
                                    진료 내용을 보호자에게 전달하는 데 대한
                                    동의는 이용자 본인만 할 수 있습니다.
                                    {userDirect
                                        ? " 이용자 본인이 동의 링크에서 직접 선택합니다."
                                        : " 대리 동의로는 선택할 수 없어 전달하지 않는 것으로 처리됩니다."}
                                </p>
                            )}
                            {!isProxy && (
                                <div className="md:col-span-2">
                                    <Controller
                                        control={control}
                                        name="shareMedicalInfo"
                                        render={({ field }) => (
                                            <label className="flex cursor-pointer items-start gap-2.5">
                                                <Checkbox
                                                    className="mt-0.5"
                                                    checked={
                                                        field.value === true
                                                    }
                                                    onCheckedChange={(
                                                        checked,
                                                    ) =>
                                                        field.onChange(
                                                            checked === true,
                                                        )
                                                    }
                                                />
                                                <span className="text-sm leading-relaxed">
                                                    <span className="text-foreground">
                                                        진료 내용을 보호자에게
                                                        전달하는 데 동의합니다.
                                                    </span>
                                                    <span className="text-muted-foreground block">
                                                        동의하지 않으시면
                                                        파트너가 보호자에게 진료
                                                        내용을 전달하지
                                                        않습니다.
                                                    </span>
                                                </span>
                                            </label>
                                        )}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 진료 정보 */}
                    <div className="bg-panel-muted rounded-2xl p-6 md:p-8">
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
                                    aria-describedby={
                                        errors.treatment
                                            ? "treatment-error"
                                            : undefined
                                    }
                                    {...register("treatment", {
                                        onChange: () =>
                                            errors.treatment &&
                                            clearErrors("treatment"),
                                    })}
                                />
                                <FieldError id="treatment-error">
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
                                    aria-describedby={
                                        errors.purpose
                                            ? "purpose-error"
                                            : undefined
                                    }
                                    {...register("purpose", {
                                        onChange: () =>
                                            errors.purpose &&
                                            clearErrors("purpose"),
                                    })}
                                />
                                <FieldError id="purpose-error">
                                    {errors.purpose?.message}
                                </FieldError>
                            </div>
                        </div>

                        {/*
                         * 거동·인지 상태는 파트너가 수락 여부를 판단하는 근거라
                         * 매칭 전 제공에는 별도 동의가 필요하다 (처리방침 제3조 ② · 제5조 ② [단계 1]·④·⑥, #285).
                         * 보호자 전달 동의(shareMedicalInfo)와 분리해 아래에서 별도 동의를 받으며,
                         * 아래 '주의해야 할 점' 은 예약 확정 후에만 전달된다.
                         */}
                        <div className="mt-5 grid gap-5 md:grid-cols-2">
                            <div>
                                <FieldLabel htmlFor="mobilityStatus" required>
                                    거동 상태
                                </FieldLabel>
                                <NativeSelect
                                    id="mobilityStatus"
                                    aria-invalid={!!errors.mobilityStatus}
                                    aria-describedby={
                                        errors.mobilityStatus
                                            ? "mobilityStatus-error"
                                            : undefined
                                    }
                                    {...register("mobilityStatus", {
                                        onChange: () =>
                                            errors.mobilityStatus &&
                                            clearErrors("mobilityStatus"),
                                    })}
                                >
                                    <option value="">선택하세요</option>
                                    {MOBILITY_OPTIONS.map((m) => (
                                        <option key={m} value={m}>
                                            {m}
                                        </option>
                                    ))}
                                </NativeSelect>
                                <FieldError id="mobilityStatus-error">
                                    {errors.mobilityStatus?.message}
                                </FieldError>
                            </div>
                            <div>
                                <FieldLabel htmlFor="cognitiveStatus" required>
                                    인지 상태
                                </FieldLabel>
                                <NativeSelect
                                    id="cognitiveStatus"
                                    aria-invalid={!!errors.cognitiveStatus}
                                    aria-describedby={
                                        errors.cognitiveStatus
                                            ? "cognitiveStatus-error"
                                            : undefined
                                    }
                                    {...register("cognitiveStatus", {
                                        onChange: () =>
                                            errors.cognitiveStatus &&
                                            clearErrors("cognitiveStatus"),
                                    })}
                                >
                                    <option value="">선택하세요</option>
                                    {COGNITIVE_OPTIONS.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </NativeSelect>
                                <FieldError id="cognitiveStatus-error">
                                    {errors.cognitiveStatus?.message}
                                </FieldError>
                            </div>
                        </div>

                        {/*
                         * 처리방침 제3조 ② · 제5조 ② [단계 1]·④·⑥ (#285)
                         * 거동·인지 상태(민감정보)의 매칭 전 파트너 제공에 대한 별도 동의.
                         */}
                        {userDirect ? (
                            <p
                                id="agreePreMatchingHealth-direct-notice"
                                className="bg-background text-description-foreground mt-5 rounded-xl border p-4 text-sm leading-relaxed md:p-5"
                            >
                                거동·인지 상태를 매칭 전 파트너에게 제공하는 데
                                대한 동의는 이용자 본인이 동의 링크에서 직접
                                합니다. 동의가 완료되기 전에는 파트너에게 예약이
                                공개되지 않습니다.
                            </p>
                        ) : (
                            <div
                                className={cn(
                                    "bg-background mt-5 rounded-xl border p-4 md:p-5",
                                    errors.agreePreMatchingHealth
                                        ? "border-destructive"
                                        : "border-border",
                                )}
                            >
                                <p className="text-foreground text-sm font-bold">
                                    [필수] 매칭 전 파트너에게 거동·인지 상태
                                    제공 동의 (민감정보)
                                </p>
                                <dl className="text-description-foreground mt-3 space-y-1.5 text-sm leading-relaxed">
                                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                                        <dt className="text-foreground shrink-0 font-semibold sm:w-28">
                                            제공받는 자
                                        </dt>
                                        <dd>
                                            해당 예약 요청을 검토하는 함께가요
                                            병원동행 파트너
                                        </dd>
                                    </div>
                                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                                        <dt className="text-foreground shrink-0 font-semibold sm:w-28">
                                            제공 목적
                                        </dt>
                                        <dd>
                                            서비스 수행 가능 여부 및 예약 수락
                                            여부 판단 (민감정보)
                                        </dd>
                                    </div>
                                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                                        <dt className="text-foreground shrink-0 font-semibold sm:w-28">
                                            제공 항목
                                        </dt>
                                        <dd>거동상태, 인지상태</dd>
                                    </div>
                                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                                        <dt className="text-foreground shrink-0 font-semibold sm:w-28">
                                            보유·이용기간
                                        </dt>
                                        <dd>
                                            수락 여부 결정 시까지. 수락하지 않은
                                            파트너는 즉시 접근 차단
                                        </dd>
                                    </div>
                                </dl>
                                <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                                    동의를 거부할 권리가 있으나, 동의하지 않으면
                                    예약할 수 없습니다.
                                </p>
                                <div className="border-border mt-3 border-t pt-3">
                                    <Controller
                                        control={control}
                                        name="agreePreMatchingHealth"
                                        render={({ field }) => (
                                            <label className="flex cursor-pointer items-start gap-2.5">
                                                <Checkbox
                                                    id="agreePreMatchingHealth"
                                                    nativeButton
                                                    render={
                                                        <button type="button" />
                                                    }
                                                    className="mt-0.5"
                                                    checked={
                                                        field.value === true
                                                    }
                                                    aria-invalid={
                                                        !!errors.agreePreMatchingHealth
                                                    }
                                                    aria-describedby={
                                                        errors.agreePreMatchingHealth
                                                            ? "agreePreMatchingHealth-error"
                                                            : undefined
                                                    }
                                                    onCheckedChange={(
                                                        checked,
                                                    ) => {
                                                        field.onChange(
                                                            checked === true,
                                                        );
                                                        if (
                                                            errors.agreePreMatchingHealth
                                                        ) {
                                                            clearErrors(
                                                                "agreePreMatchingHealth",
                                                            );
                                                        }
                                                    }}
                                                />
                                                <span className="text-foreground text-sm leading-relaxed font-medium">
                                                    거동·인지 상태(민감정보)를
                                                    매칭 전 파트너에게 제공하는
                                                    데 동의합니다.
                                                </span>
                                            </label>
                                        )}
                                    />
                                    <FieldError id="agreePreMatchingHealth-error">
                                        {errors.agreePreMatchingHealth?.message}
                                    </FieldError>
                                </div>
                            </div>
                        )}

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
                                    <p className="text-foreground text-sm leading-relaxed font-semibold">
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
                            <p className="text-description-foreground mt-3 text-sm leading-relaxed">
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
