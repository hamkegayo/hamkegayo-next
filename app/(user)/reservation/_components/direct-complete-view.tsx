import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock, Phone } from "lucide-react";

import { Section } from "@/app/(user)/_components/home/section";
import {
    CUSTOMER_CENTER_CALL_LABEL,
    CUSTOMER_CENTER_TEL_HREF,
    DIRECT_COMPLETE_PARAGRAPHS,
} from "@/lib/direct-flow-copy";
import { PhoneContactLink } from "@/components/contact/phone-contact-link";
import { StepBand } from "./step-band";
import { UrgentCallNotice } from "./urgent-call-notice";

function InfoRow({ label, value }: { label: string; value?: string }) {
    return (
        <div className="flex gap-4 py-2 text-sm">
            <span className="text-muted-foreground w-16 shrink-0 font-semibold">
                {label}
            </span>
            <span className="text-foreground">{value || "-"}</span>
        </div>
    );
}

/**
 * STEP6(내부 step 8) · 신규 방식(#300) 결제 완료 화면.
 *
 *  결제 직후에는 "예약 확정" 이 아니라 접수·파트너 확인 중임을 말한다. 확정은 운영자가 파트너를
 *  배정한 뒤다. 이 화면을 보지 않고 브라우저를 닫아도 접수·알림·배정은 서버가 결제 승인 때부터 이어간다.
 */
export function DirectCompleteView({
    reservationNo,
    statusHref,
    planLabel,
    visitLabel,
    useDate,
    startTime,
    hospital,
    userName,
}: {
    reservationNo: string;
    statusHref: string;
    planLabel: string;
    visitLabel: string;
    /** 급한 예약 판정용 — "YYYY-MM-DD" */
    useDate: string;
    startTime: string;
    hospital?: string;
    userName?: string;
}) {
    return (
        <>
            <StepBand
                index={6}
                totalSteps={6}
                title="예약 신청이 접수되었습니다."
                subtitles={["파트너 배정이 완료되면 예약이 최종 확정됩니다."]}
            />

            <Section>
                <div className="mx-auto max-w-xl">
                    {/* 안내문 원문 — 문구를 바꾸지 않는다 */}
                    <div
                        data-testid="direct-complete-notice"
                        className="border-brand/30 bg-brand/5 rounded-2xl border p-6"
                    >
                        <div className="text-foreground space-y-3 leading-relaxed">
                            {DIRECT_COMPLETE_PARAGRAPHS.map((text) => (
                                <p key={text}>{text}</p>
                            ))}
                        </div>
                        <PhoneContactLink
                            href={CUSTOMER_CENTER_TEL_HREF}
                            className="bg-brand text-brand-foreground hover:bg-brand/90 mt-5 flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-bold transition-colors"
                        >
                            <Phone className="size-4" />
                            {CUSTOMER_CENTER_CALL_LABEL}
                        </PhoneContactLink>
                    </div>

                    <div className="mt-4">
                        <UrgentCallNotice
                            useDate={useDate}
                            time={startTime}
                            context="complete"
                            hideCallButtonWhenNormal
                        />
                    </div>

                    {/* 진행 상태 및 3단계 안내 */}
                    <div
                        data-testid="direct-complete-steps"
                        className="border-border bg-background mt-4 rounded-2xl border p-6"
                    >
                        <p className="text-foreground flex items-center gap-2 font-bold">
                            <Clock className="text-muted-foreground size-5" />
                            진행 상태
                        </p>
                        <p className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-500/15">
                            결제 완료 · 파트너 배정 대기
                        </p>

                        <ol className="mt-5 grid gap-2.5 sm:grid-cols-3">
                            <li className="border-brand/40 bg-brand/5 rounded-xl border p-3">
                                <p className="text-brand text-xs font-extrabold">
                                    ① 접수·결제 완료(현재)
                                </p>
                            </li>
                            <li className="border-border bg-muted/30 rounded-xl border p-3">
                                <p className="text-foreground text-xs font-bold">
                                    ② 24시간 이내 파트너 확인
                                </p>
                            </li>
                            <li className="border-border bg-muted/30 rounded-xl border p-3">
                                <p className="text-foreground text-xs font-bold">
                                    ③ 담당 파트너 확정 문자 안내
                                </p>
                            </li>
                        </ol>

                        <p className="bg-muted/40 text-description-foreground mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-xs leading-relaxed font-medium">
                            <CheckCircle2 className="text-brand size-4 shrink-0" />
                            이 화면을 닫으셔도 예약 접수와 파트너 배정은
                            정상적으로 진행됩니다.
                        </p>
                    </div>

                    {/* 예약 번호 */}
                    <div className="border-border bg-background mt-4 rounded-2xl border p-6 text-center">
                        <p className="text-muted-foreground text-sm">
                            예약 번호
                        </p>
                        <p className="text-foreground mt-1 text-2xl font-extrabold">
                            {reservationNo}
                        </p>
                        <p className="text-description-foreground mt-1 text-xs">
                            예약 번호는 예약 조회 및 문의시 필요합니다
                        </p>
                    </div>

                    {/* 예약 정보 */}
                    <div className="border-border bg-background mt-4 rounded-2xl border p-6">
                        <p className="text-foreground flex items-center gap-2 font-bold">
                            <CalendarDays className="text-muted-foreground size-5" />
                            예약 정보
                        </p>
                        <div className="divide-border mt-4 divide-y">
                            <InfoRow label="서비스" value={planLabel} />
                            <InfoRow label="방문일시" value={visitLabel} />
                            <InfoRow label="병원" value={hospital} />
                            <InfoRow label="이용자" value={userName} />
                        </div>
                    </div>

                    <div className="mt-8 flex justify-center gap-3">
                        <Link
                            href="/"
                            className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-bold transition-colors"
                        >
                            홈으로 이동
                        </Link>
                        <Link
                            href={statusHref}
                            className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-6 py-3 text-sm font-bold transition-colors"
                        >
                            예약 현황 보기
                        </Link>
                    </div>
                </div>
            </Section>
        </>
    );
}
