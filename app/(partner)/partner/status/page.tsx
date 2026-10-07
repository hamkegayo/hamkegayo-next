import Link from "next/link";
import { CheckCircle2, CircleAlert, Clock } from "lucide-react";

import { getMyIdentityCheck } from "../../_lib/identity.server";
import { getPartnerQualifications } from "../../_lib/qualifications.server";
import {
    TRAINING_COURSES,
    getMyTrainingStatus,
} from "../../_lib/training.server";
import { getPartnerPublicProfile } from "../_actions/public-profile";
import { getMyPayoutAccount } from "../_actions/payout-account";
import { TRAINING_MATERIALS_READY } from "@/lib/partner-training";

type Tone = "done" | "pending" | "todo";

function Badge({ tone, label }: { tone: Tone; label: string }) {
    const Icon =
        tone === "done"
            ? CheckCircle2
            : tone === "pending"
              ? Clock
              : CircleAlert;
    const cls =
        tone === "done"
            ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15"
            : tone === "pending"
              ? "text-amber-600 bg-amber-50 dark:bg-amber-500/15"
              : "text-destructive bg-destructive/10";
    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}
        >
            <Icon className="size-3.5" />
            {label}
        </span>
    );
}

function Item({
    title,
    desc,
    tone,
    label,
    href,
}: {
    title: string;
    desc: string;
    tone: Tone;
    label: string;
    href?: string;
}) {
    return (
        <li className="flex items-start justify-between gap-4 py-4">
            <div className="min-w-0">
                <p className="text-foreground font-bold">{title}</p>
                <p className="text-muted-foreground mt-1 text-sm break-keep">
                    {desc}
                </p>
                {href && (
                    <Link
                        href={href}
                        className="text-brand mt-1 inline-block text-sm font-semibold underline"
                    >
                        바로가기
                    </Link>
                )}
            </div>
            <Badge tone={tone} label={label} />
        </li>
    );
}

/**
 * 인증/교육 상태 (#255-3). 흩어져 있던 상태를 한곳에 모아 보여 주고 각 화면으로 연결한다.
 * 교육 3종은 매뉴얼 10장 — 첫 업무 수락 전에 이수 확인. 기록은 운영센터(심사 담당)가 남긴다.
 */
export default async function PartnerStatusPage() {
    const [identity, quals, publicProfile, payout, training] =
        await Promise.all([
            getMyIdentityCheck(),
            getPartnerQualifications(),
            getPartnerPublicProfile(),
            getMyPayoutAccount(),
            TRAINING_MATERIALS_READY ? getMyTrainingStatus() : null,
        ]);

    const identityStatus = identity.ok ? identity.status : null;
    const verifiedQuals = quals.filter((q) => !q.pending).length;
    const pendingQuals = quals.filter((q) => q.pending).length;
    const doneCourses = training
        ? TRAINING_COURSES.filter((c) => training.completed[c.code]).length
        : 0;

    const identityDesc = !identity.ok
        ? "상태를 불러오지 못했어요."
        : identityStatus === "VERIFIED"
          ? "본인확인이 완료됐어요."
          : identityStatus === "PENDING"
            ? "운영센터가 확인하고 있어요."
            : !identity.enabled
              ? "아직 접수를 받지 않아요. 열리면 안내해 드려요."
              : "프로필에서 생년월일을 제출해 주세요.";

    return (
        <div>
            <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                인증/교육 상태
            </h1>
            <p className="text-muted-foreground mt-2">
                업무 수락 전에 확인이 필요한 항목을 모아 보여 드려요.
            </p>

            {/* 교육 자료 준비 전에는 숨긴다 (lib/partner-training.ts) */}
            {TRAINING_MATERIALS_READY && (
                <section className="border-border bg-background mt-6 rounded-2xl border p-6 md:p-7">
                    <h2 className="text-foreground text-lg font-bold">
                        교육 이수
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm break-keep">
                        첫 업무를 수락하기 전에 세 가지 교육 이수가 확인되어야
                        해요. 이수 확인은 운영센터가 기록합니다.
                    </p>
                    {training?.required === null && (
                        <p
                            role="alert"
                            className="text-destructive mt-2 text-sm break-keep"
                        >
                            수락 제한 여부를 확인하지 못했어요. 이수가 모두
                            확인되지 않았다면 요청 수락이 막힐 수 있어요.
                        </p>
                    )}
                    {training?.required === true && doneCourses < 3 && (
                        <p className="text-destructive mt-2 text-sm font-semibold break-keep">
                            이수가 모두 확인되기 전에는 요청을 수락할 수 없어요.
                        </p>
                    )}
                    {training === null ? (
                        <p
                            role="alert"
                            className="text-destructive mt-4 text-sm"
                        >
                            교육 기록을 불러오지 못했어요. 잠시 후 다시 시도해
                            주세요.
                        </p>
                    ) : (
                        <ul className="divide-border mt-2 divide-y">
                            {TRAINING_COURSES.map((c) => {
                                const on = training.completed[c.code];
                                return (
                                    <Item
                                        key={c.code}
                                        title={c.label}
                                        desc={
                                            on
                                                ? `${on} 이수 확인`
                                                : "운영센터에 이수 확인을 요청해 주세요."
                                        }
                                        tone={on ? "done" : "todo"}
                                        label={on ? "이수" : "미확인"}
                                    />
                                );
                            })}
                        </ul>
                    )}
                </section>
            )}

            <section className="border-border bg-background mt-5 rounded-2xl border p-6 md:p-7">
                <h2 className="text-foreground text-lg font-bold">인증</h2>
                <ul className="divide-border mt-2 divide-y">
                    <Item
                        title="본인확인 (생년월일)"
                        desc={identityDesc}
                        tone={
                            identityStatus === "VERIFIED"
                                ? "done"
                                : identityStatus === "PENDING"
                                  ? "pending"
                                  : "todo"
                        }
                        label={
                            identityStatus === "VERIFIED"
                                ? "완료"
                                : identityStatus === "PENDING"
                                  ? "확인 중"
                                  : "미완료"
                        }
                        href="/partner/profile"
                    />
                    <Item
                        title="자격·경력 인증"
                        desc={
                            quals.length === 0
                                ? "등록한 자격이 없어요."
                                : `인증 ${verifiedQuals}건${
                                      pendingQuals
                                          ? ` · 확인 중 ${pendingQuals}건`
                                          : ""
                                  }`
                        }
                        tone={
                            verifiedQuals > 0
                                ? "done"
                                : pendingQuals > 0
                                  ? "pending"
                                  : "todo"
                        }
                        label={
                            verifiedQuals > 0
                                ? "인증"
                                : pendingQuals > 0
                                  ? "확인 중"
                                  : "미등록"
                        }
                        href="/partner/profile"
                    />
                    <Item
                        title="상세 정보 공개 동의"
                        desc={
                            publicProfile?.consent
                                ? "고객에게 경력 등 상세 정보가 공개돼요."
                                : "동의하면 고객이 경력 등 상세 정보를 볼 수 있어요."
                        }
                        tone={publicProfile?.consent ? "done" : "todo"}
                        label={publicProfile?.consent ? "동의" : "미동의"}
                        href="/partner/profile"
                    />
                    <Item
                        title="정산 계좌"
                        desc={
                            payout
                                ? `${payout.bankName} ****${payout.last4} 등록됨`
                                : "정산받을 계좌를 등록해 주세요."
                        }
                        tone={payout ? "done" : "todo"}
                        label={payout ? "등록" : "미등록"}
                        href="/partner/settlement"
                    />
                </ul>
            </section>
        </div>
    );
}
