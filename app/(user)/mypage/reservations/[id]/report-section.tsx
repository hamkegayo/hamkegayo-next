"use client";

import { useState, useTransition } from "react";
import { FileText, Paperclip } from "lucide-react";

import { loadOwnReport } from "../../_actions/report";
import type { CustomerReport } from "../../_lib/report.server";

function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * 보호자 리포트 (#253). 처리방침 제1조 3호 — 서비스 수행기록 및 리포트 제공.
 * 리포트 본문·첨부는 진료내용 전달에 동의한 경우에만 온다 — 약관 제8조 · 처리방침 제10조 ④.
 */
export function ReportSection({ reservationId }: { reservationId: string }) {
    const [report, setReport] = useState<CustomerReport | null>(null);
    const [missing, setMissing] = useState(false);
    const [pending, startTransition] = useTransition();

    const onOpen = () =>
        startTransition(async () => {
            const res = await loadOwnReport(reservationId);
            setReport(res);
            setMissing(res === null);
        });

    if (!report) {
        return (
            <div className="space-y-3">
                <p className="text-description-foreground text-sm leading-relaxed">
                    {missing
                        ? "아직 파트너가 리포트를 제출하지 않았어요. 제출되면 알림으로 알려드려요."
                        : "파트너가 작성한 동행 리포트를 확인할 수 있어요."}
                </p>
                <button
                    type="button"
                    onClick={onOpen}
                    disabled={pending}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-60"
                >
                    <FileText className="size-4" />
                    {pending
                        ? "불러오는 중…"
                        : missing
                          ? "다시 확인"
                          : "리포트 보기"}
                </button>
            </div>
        );
    }

    if (report.purged) {
        return (
            <p className="text-description-foreground text-sm leading-relaxed">
                보유기간이 지나 리포트 내용이 파기되었어요.
            </p>
        );
    }

    if (!report.medicalShared) {
        return (
            <p className="text-description-foreground text-sm leading-relaxed break-keep">
                이용자가 진료 내용 전달에 동의하지 않아 리포트 내용을 보여 드릴
                수 없어요. 서비스 진행 상태와 시각은 위에서 확인할 수 있어요.
            </p>
        );
    }

    return (
        <div className="space-y-5 text-sm">
            <div className="flex items-center justify-between gap-3">
                <p className="text-description-foreground text-sm leading-relaxed">
                    {report.submittedAtLabel
                        ? `${report.submittedAtLabel} 제출`
                        : ""}
                </p>
                <button
                    type="button"
                    onClick={onOpen}
                    disabled={pending}
                    className="text-muted-foreground text-sm underline disabled:opacity-60"
                >
                    {pending ? "불러오는 중…" : "다시 불러오기"}
                </button>
            </div>

            <div>
                <p className="text-foreground leading-relaxed font-bold">
                    수행 지원 내용
                </p>
                {report.supports.length > 0 ? (
                    <ul className="text-description-foreground mt-2 list-disc space-y-1 pl-5">
                        {report.supports.map((s) => (
                            <li key={s}>{s}</li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-description-foreground mt-2 leading-relaxed">
                        -
                    </p>
                )}
            </div>

            <div>
                <p className="text-foreground leading-relaxed font-bold">
                    진료·검사 메모
                </p>
                <p className="text-description-foreground mt-2 leading-relaxed whitespace-pre-wrap">
                    {report.exam || "-"}
                </p>
            </div>

            <div>
                <p className="text-foreground leading-relaxed font-bold">
                    보호자 전달 사항
                </p>
                <p className="text-description-foreground mt-2 leading-relaxed whitespace-pre-wrap">
                    {report.guardianNote || "-"}
                </p>
            </div>

            {report.attachments.length > 0 && (
                <div>
                    <p className="text-foreground leading-relaxed font-bold">
                        첨부
                    </p>
                    <ul className="mt-2 space-y-2">
                        {report.attachments.map((a) => (
                            <li key={a.id} className="flex items-center gap-2">
                                <Paperclip className="text-muted-foreground size-4 shrink-0" />
                                {a.url ? (
                                    <a
                                        href={a.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-brand min-w-0 truncate underline"
                                    >
                                        {a.filename}
                                    </a>
                                ) : (
                                    <span className="text-muted-foreground min-w-0 truncate">
                                        {a.filename} (지금은 열 수 없어요)
                                    </span>
                                )}
                                <span className="text-muted-foreground shrink-0 text-sm">
                                    {formatSize(a.size)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-description-foreground mt-2 text-sm leading-relaxed">
                        첨부 링크는 5분 동안만 열려요. 시간이 지나면 “다시
                        불러오기”를 눌러 주세요.
                    </p>
                </div>
            )}
        </div>
    );
}
