"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
    ACTIVITY_CONSENT_VERSION,
    type PartnerPublicProfile,
} from "@/lib/partner-details";
import { PartnerEvidenceFiles } from "@/components/partner-evidence-files";
import {
    deletePartnerWorkHistory,
    getPartnerPublicProfile,
    setPartnerPublicConsent,
    submitPartnerWorkHistory,
} from "../partner/_actions/public-profile";

const EMPTY = { hospital: "", period: "", department: "", duties: "" };
const FIELDS = [
    { key: "hospital", label: "근무 병원", max: 100, placeholder: "병원명" },
    {
        key: "period",
        label: "근무 기간",
        max: 100,
        placeholder: "예: 2022.03~2025.02",
    },
    {
        key: "department",
        label: "근무 부서",
        max: 100,
        placeholder: "예: 외래",
    },
    {
        key: "duties",
        label: "담당 업무",
        max: 300,
        placeholder: "실제 담당 업무",
    },
] as const;

export function PublicProfileEditor({
    initial,
    evidenceEnabled = false,
}: {
    initial: PartnerPublicProfile | null;
    evidenceEnabled?: boolean;
}) {
    const [profile, setProfile] = useState(initial);
    const [input, setInput] = useState(EMPTY);
    const [pending, startTransition] = useTransition();
    const refresh = async () => {
        setProfile(await getPartnerPublicProfile());
    };
    const run = (
        action: () => Promise<{ ok: boolean; message?: string }>,
        message: string,
        reset = false,
    ) => {
        startTransition(async () => {
            try {
                const result = await action();
                if (!result.ok) {
                    toast.error(result.message);
                    return;
                }
                if (reset) setInput(EMPTY);
                await refresh();
                toast.success(message);
            } catch {
                toast.error("정보를 갱신하지 못했습니다. 다시 시도해 주세요.");
            }
        });
    };
    return (
        <section className="border-border bg-background rounded-2xl border p-6">
            <h2 className="text-lg font-bold">경력 등록 내역</h2>
            {profile === null ? (
                <div role="alert" className="mt-4">
                    <p>공개 프로필을 불러오지 못했습니다.</p>
                    <button
                        type="button"
                        onClick={() => startTransition(refresh)}
                        disabled={pending}
                        className="text-brand mt-2 underline"
                    >
                        다시 시도
                    </button>
                </div>
            ) : (
                <>
                    <p className="text-description-foreground mt-2 text-sm leading-relaxed">
                        증빙은 위 자격·경력 증빙 등록 화면에서 첨부해 주세요.
                        담당자가 검증한 경력만 공개합니다. 환자 정보 등 불필요한
                        개인정보는 제외해 주세요. 심사 전 등록만 직접 취소할 수
                        있습니다. 심사·결과 통지된 자료의 수정·삭제는
                        보유기간·이의신청 메뉴 또는 고객센터로 요청해 주세요.
                    </p>
                    {profile.histories.length === 0 && (
                        <p className="text-description-foreground mt-4 text-sm leading-relaxed">
                            등록된 정보 없음
                        </p>
                    )}
                    <ul className="mt-4 space-y-3">
                        {profile.histories.map((history) => (
                            <li
                                key={history.id}
                                className="rounded-xl border p-4"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <p className="min-w-0 leading-relaxed font-bold break-words">
                                        {history.hospital}{" "}
                                        <span className="text-foreground text-sm leading-relaxed">
                                            {history.kind === "COMPANION"
                                                ? "병원동행 경력"
                                                : "의료기관 근무 경력"}
                                        </span>{" "}
                                        <span
                                            className={
                                                history.status === "VERIFIED"
                                                    ? "text-sm font-semibold text-emerald-700 dark:text-emerald-400"
                                                    : "text-sm font-semibold text-amber-800 dark:text-amber-300"
                                            }
                                        >
                                            {history.status === "VERIFIED"
                                                ? "관리자 검증 완료"
                                                : "심사 대기"}
                                        </span>
                                    </p>
                                    {history.status === "PENDING" ? (
                                        <button
                                            type="button"
                                            disabled={pending}
                                            onClick={() => {
                                                if (
                                                    !window.confirm(
                                                        "미심사 경력 등록을 취소하고 첨부 증빙을 삭제하시겠습니까?",
                                                    )
                                                )
                                                    return;
                                                run(
                                                    () =>
                                                        deletePartnerWorkHistory(
                                                            history.id,
                                                        ),
                                                    "등록을 취소했습니다. 증빙은 삭제 처리됩니다.",
                                                );
                                            }}
                                            className="text-destructive shrink-0 text-sm underline"
                                        >
                                            등록 취소·증빙 삭제
                                        </button>
                                    ) : (
                                        <a
                                            href="/partner-evidence-notice"
                                            className="text-brand shrink-0 text-sm underline"
                                        >
                                            수정·삭제 절차
                                        </a>
                                    )}
                                </div>
                                <p className="mt-1 text-sm leading-relaxed">
                                    {history.period} · {history.department}
                                </p>
                                <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
                                    {history.duties}
                                </p>
                                <PartnerEvidenceFiles
                                    id={history.id}
                                    kind="HISTORY"
                                />
                            </li>
                        ))}
                    </ul>
                    {!evidenceEnabled && (
                        <form
                            className="mt-5 space-y-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                run(
                                    () => submitPartnerWorkHistory(input),
                                    "경력을 등록했습니다. 관리자 검증 후 공개됩니다.",
                                    true,
                                );
                            }}
                        >
                            {FIELDS.map((field) => (
                                <label
                                    key={field.key}
                                    className="block text-sm font-semibold"
                                >
                                    {field.label}
                                    <input
                                        required
                                        disabled={pending}
                                        maxLength={field.max}
                                        placeholder={field.placeholder}
                                        value={input[field.key]}
                                        onChange={(event) =>
                                            setInput((previous) => ({
                                                ...previous,
                                                [field.key]: event.target.value,
                                            }))
                                        }
                                        className="border-input bg-background mt-1 w-full rounded-lg border p-3 font-normal"
                                    />
                                </label>
                            ))}
                            <button
                                type="submit"
                                disabled={
                                    pending || profile.histories.length >= 20
                                }
                                className="bg-brand text-brand-foreground rounded-lg px-5 py-2.5 font-bold disabled:opacity-50"
                            >
                                {pending ? "저장 중…" : "경력 등록"}
                            </button>
                            <p className="text-foreground text-sm leading-relaxed">
                                최대 20개까지 등록할 수 있습니다. 개인정보나
                                환자 정보를 입력하지 마세요.
                            </p>
                        </form>
                    )}
                    <h3 className="mt-8 text-lg font-bold">
                        고객에게 공개할 프로필
                    </h3>
                    <div className="bg-muted mt-4 space-y-2.5 rounded-xl p-5 text-sm leading-relaxed break-keep">
                        <p>
                            공개 대상: 내가 수락한 예약의 예약자. 목적: 파트너
                            선택 전 서비스 제공자 정보 확인.
                        </p>
                        <p>
                            공개 항목: 사진, 이름, 자기소개, 관리자 검증 근무
                            병원·기간·부서·담당 업무, 인증된 자격 명칭·발급기관
                            {profile.activityPublicEnabled &&
                                ", 활동 지역·활동 가능 요일과 시간·이동 가능 수단·지원 가능한 보행 상태·선호 병원"}
                            . 평점과 마스킹된 공개 후기도 함께 표시합니다.
                        </p>
                        <p>
                            조회 가능 기간: 해당 예약의 매칭 중.
                            연락처·이메일·주소·생년월일·정산 계좌·증빙 원본은
                            상세 프로필에 공개하지 않습니다.
                        </p>
                        <p>
                            동의는 선택 사항이며 철회할 수 있습니다. 거부·철회
                            시 추가 프로필을 숨기며 예약 수락 기능은 유지됩니다.
                            이미 본 정보는 회수할 수 없습니다.
                        </p>
                        <label className="flex items-start gap-2 font-semibold">
                            <input
                                type="checkbox"
                                checked={profile.consent}
                                disabled={
                                    pending ||
                                    (!profile.publicEnabled && !profile.consent)
                                }
                                onChange={(event) => {
                                    const consent = event.target.checked;
                                    run(
                                        () => setPartnerPublicConsent(consent),
                                        consent
                                            ? "공개 동의를 저장했습니다."
                                            : "공개 동의를 철회했습니다.",
                                    );
                                }}
                                className="mt-1 size-4"
                            />
                            위 항목을 해당 예약자에게 공개하는 데 동의합니다.
                        </label>
                        {/* 공개 고지 v2: 이미 동의한 파트너도 늘어난 항목에는 다시 동의해야 한다 (처리방침 제16조 ③) */}
                        {profile.activityPublicEnabled &&
                            profile.consent &&
                            profile.consentVersion !==
                                ACTIVITY_CONSENT_VERSION && (
                                <div className="border-brand/40 bg-background mt-3 rounded-lg border p-3">
                                    <p className="text-sm leading-relaxed break-keep">
                                        공개 항목에 활동 정보가 추가됐어요. 다시
                                        동의하면 활동 지역·시간 등도 예약자에게
                                        보입니다. 동의하지 않아도 기존 항목은
                                        그대로 공개됩니다.
                                    </p>
                                    <button
                                        type="button"
                                        disabled={pending}
                                        onClick={() =>
                                            run(
                                                () =>
                                                    setPartnerPublicConsent(
                                                        true,
                                                    ),
                                                "추가 항목 공개에 동의했습니다.",
                                            )
                                        }
                                        className="bg-brand text-brand-foreground hover:bg-brand/90 mt-2 rounded-lg px-3.5 py-2 text-sm font-bold disabled:opacity-50"
                                    >
                                        추가 항목까지 동의하기
                                    </button>
                                </div>
                            )}
                        {!profile.publicEnabled && (
                            <p className="text-description-foreground mt-2 text-sm leading-relaxed">
                                상세 정보 공개는 준비 중입니다. 현재 고객에게
                                공개되지 않으며 기존 동의는 철회할 수 있습니다.
                            </p>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}
