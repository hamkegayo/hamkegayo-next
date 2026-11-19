"use client";

import { useState, useTransition } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { formatUseDate, kstToday, toHhmm } from "@/lib/format";
import { planDisplay } from "@/lib/reservation";
import {
    submitUserConsent,
    verifyConsentIdentity,
    type ConsentContext,
} from "../_actions";

type Failure = {
    reason: string;
    attemptsLeft?: number;
};

function failureMessage(f: Failure): string {
    switch (f.reason) {
        case "MISMATCH":
            return `입력하신 정보가 예약 정보와 일치하지 않습니다. (남은 시도 ${f.attemptsLeft ?? 0}회)`;
        case "INVALID_INPUT":
            return "생년월일과 연락처 끝 4자리를 정확히 입력해 주세요.";
        case "LOCKED":
            return "시도 횟수를 초과해 링크가 잠겼습니다. 예약하신 분께 새 링크를 요청해 주세요.";
        case "EXPIRED":
            return "링크 유효 시간이 지났습니다. 예약하신 분께 새 링크를 요청해 주세요.";
        case "REVOKED":
            return "새 링크로 교체된 링크입니다. 가장 최근에 받은 링크를 사용해 주세요.";
        case "USED":
            return "이미 동의가 완료된 예약입니다.";
        case "HEALTH_CONSENT_REQUIRED":
            return "거동·인지 상태 제공에 동의하지 않으면 예약을 진행할 수 없습니다.";
        default:
            return "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
}

/**
 * 이용자 본인 동의 화면 (개인정보처리방침 제10조 ①②④, #306).
 * 1) 본인 확인(생년월일 + 연락처 끝 4자리) → 2) 최소 예약 정보 확인 후 동의를 직접 선택·제출.
 * 거동·인지 상태 제공 동의와 진료 내용 보호자 전달 동의는 별개의 항목이며 모두 기본 해제다.
 */
export function ConsentForm({ token }: { token: string }) {
    const [birth, setBirth] = useState("");
    const [last4, setLast4] = useState("");
    const [context, setContext] = useState<ConsentContext | null>(null);
    const [agreeHealth, setAgreeHealth] = useState(false);
    const [shareMedical, setShareMedical] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);
    const [pending, startTransition] = useTransition();

    const verify = () => {
        setError(null);
        startTransition(async () => {
            const res = await verifyConsentIdentity(token, birth, last4);
            if (!res.ok) {
                setError(failureMessage(res));
                return;
            }
            setContext(res.context);
        });
    };

    const submit = () => {
        setError(null);
        startTransition(async () => {
            const res = await submitUserConsent({
                token,
                birth,
                phoneLast4: last4,
                agreeHealth,
                shareMedical,
            });
            if (!res.ok) {
                setError(failureMessage(res));
                return;
            }
            setDone(true);
        });
    };

    if (done) {
        return (
            <div
                id="consent-done"
                role="status"
                className="bg-panel-muted mt-6 rounded-2xl p-6"
            >
                <p className="text-foreground text-lg font-bold">
                    동의가 완료되었습니다
                </p>
                <p className="text-description-foreground mt-2 text-sm leading-relaxed">
                    선택하신 내용은 예약하신 분께 알려지고, 이제 파트너 매칭이
                    진행됩니다. 이 창은 닫으셔도 됩니다.
                </p>
            </div>
        );
    }

    if (!context) {
        return (
            <section className="mt-6" aria-labelledby="consent-verify-title">
                <p className="text-description-foreground text-sm leading-relaxed">
                    가족·보호자가 이용자님의 병원동행을 대신 예약했습니다.
                    이용자 본인이 맞는지 확인한 뒤, 이용자님이 직접 동의 여부를
                    결정해 주세요.
                </p>
                <div className="bg-panel-muted mt-6 space-y-5 rounded-2xl p-6">
                    <h2
                        id="consent-verify-title"
                        className="text-foreground text-base font-bold"
                    >
                        본인 확인
                    </h2>
                    <div>
                        <label
                            htmlFor="consent-birth"
                            className="text-foreground mb-2 block text-sm font-semibold"
                        >
                            이용자 생년월일
                        </label>
                        <DateField
                            id="consent-birth"
                            value={birth}
                            onChange={setBirth}
                            max={kstToday()}
                        />
                    </div>
                    <div>
                        <label
                            htmlFor="consent-phone4"
                            className="text-foreground mb-2 block text-sm font-semibold"
                        >
                            이용자 연락처 끝 4자리
                        </label>
                        <Input
                            id="consent-phone4"
                            inputMode="numeric"
                            maxLength={4}
                            autoComplete="off"
                            placeholder="1234"
                            value={last4}
                            onChange={(e) =>
                                setLast4(e.target.value.replace(/\D/g, ""))
                            }
                        />
                    </div>
                    {error && (
                        <p
                            id="consent-error"
                            role="alert"
                            className="text-destructive text-sm"
                        >
                            {error}
                        </p>
                    )}
                    <Button
                        id="consent-verify"
                        type="button"
                        className="h-11 w-full"
                        disabled={pending || !birth || last4.length !== 4}
                        onClick={verify}
                    >
                        본인 확인
                    </Button>
                </div>
            </section>
        );
    }

    return (
        <section className="mt-6 space-y-5" aria-labelledby="consent-title">
            <div className="bg-panel-muted rounded-2xl p-6">
                <h2
                    id="consent-title"
                    className="text-foreground text-base font-bold"
                >
                    예약 정보 확인
                </h2>
                <dl className="text-description-foreground mt-3 space-y-1.5 text-sm">
                    <div className="flex gap-2">
                        <dt className="text-foreground w-24 shrink-0 font-semibold">
                            예약자
                        </dt>
                        <dd>
                            {context.guardianName} ({context.relation})
                        </dd>
                    </div>
                    <div className="flex gap-2">
                        <dt className="text-foreground w-24 shrink-0 font-semibold">
                            이용 일시
                        </dt>
                        <dd>
                            {formatUseDate(context.useDate)}{" "}
                            {toHhmm(context.arriveTime)}
                        </dd>
                    </div>
                    <div className="flex gap-2">
                        <dt className="text-foreground w-24 shrink-0 font-semibold">
                            병원
                        </dt>
                        <dd>{context.hospitalName}</dd>
                    </div>
                    <div className="flex gap-2">
                        <dt className="text-foreground w-24 shrink-0 font-semibold">
                            상품
                        </dt>
                        <dd>
                            {planDisplay(
                                context.plan === "plus" ? "plus" : "basic",
                            )}
                        </dd>
                    </div>
                </dl>
            </div>

            <div className="bg-background rounded-xl border p-5">
                <p className="text-foreground text-sm font-bold">
                    [필수] 매칭 전 파트너에게 거동·인지 상태 제공 동의
                    (민감정보)
                </p>
                <p className="text-description-foreground mt-2 text-sm leading-relaxed">
                    제공받는 자: 해당 예약 요청을 검토하는 함께가요 병원동행
                    파트너 / 목적: 서비스 수행 가능 여부 및 수락 여부 판단 /
                    항목: 거동상태, 인지상태 / 기간: 수락 여부 결정 시까지.
                    동의를 거부할 수 있으나, 동의하지 않으면 예약을 진행할 수
                    없습니다.
                </p>
                <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                    <Checkbox
                        id="consent-agree-health"
                        nativeButton
                        render={<button type="button" />}
                        className="mt-0.5"
                        checked={agreeHealth}
                        onCheckedChange={(c) => setAgreeHealth(c === true)}
                    />
                    <span className="text-foreground text-sm font-medium">
                        거동·인지 상태(민감정보)를 매칭 전 파트너에게 제공하는
                        데 동의합니다.
                    </span>
                </label>
            </div>

            <div className="bg-background rounded-xl border p-5">
                <p className="text-foreground text-sm font-bold">
                    [선택] 진료·검사 내용을 보호자에게 전달하는 데 동의
                </p>
                <p className="text-description-foreground mt-2 text-sm leading-relaxed">
                    동의하지 않으시면 파트너는 진료·검사 내용을 보호자에게
                    전달하지 않습니다.
                </p>
                <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                    <Checkbox
                        id="consent-share-medical"
                        nativeButton
                        render={<button type="button" />}
                        className="mt-0.5"
                        checked={shareMedical}
                        onCheckedChange={(c) => setShareMedical(c === true)}
                    />
                    <span className="text-foreground text-sm font-medium">
                        진료·검사 내용을 보호자에게 전달하는 데 동의합니다.
                    </span>
                </label>
            </div>

            {error && (
                <p
                    id="consent-error"
                    role="alert"
                    className="text-destructive text-sm"
                >
                    {error}
                </p>
            )}
            <Button
                id="consent-submit"
                type="button"
                className="h-11 w-full"
                disabled={pending}
                onClick={submit}
            >
                동의 완료
            </Button>
        </section>
    );
}
