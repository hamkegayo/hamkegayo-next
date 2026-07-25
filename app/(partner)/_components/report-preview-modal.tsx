"use client";

import { X } from "lucide-react";

import { Modal } from "@/components/ui/modal";

export type ReportPreviewData = {
    hospital: string;
    customerName: string;
    customerAge: string;
    serviceDate: string;
    partnerName: string;
    timeRange: string;
    supports: string[];
    exam: string;
    guardianNote: string;
    attachmentKinds: string[];
};

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground w-24 shrink-0">{label}</span>
            <span className="text-foreground font-bold">{value}</span>
        </div>
    );
}

function Block({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="border-border border-t pt-4">
            <p className="text-brand text-sm font-bold">{title}</p>
            <div className="mt-2">{children}</div>
        </div>
    );
}

export function ReportPreviewModal({
    open,
    onClose,
    onConfirm,
    data,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    data: ReportPreviewData;
}) {
    return (
        <Modal open={open} onClose={onClose} className="max-w-lg">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-foreground text-lg font-extrabold">
                        보호자 리포트 미리보기
                    </h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                        보호자에게 전달될 리포트 형태입니다.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="닫기"
                    className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-full transition-colors"
                >
                    <X className="size-5" />
                </button>
            </div>

            {/* 리포트 카드 */}
            <div className="border-border mt-4 overflow-hidden rounded-xl border">
                <div className="bg-brand text-brand-foreground px-5 py-4">
                    <p className="text-xs font-semibold opacity-90">
                        함께가요 · 보호자 리포트
                    </p>
                    <p className="mt-1 text-lg font-extrabold">
                        {data.hospital} 동행 리포트
                    </p>
                </div>

                <div className="max-h-[52vh] space-y-4 overflow-y-auto p-5">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Field
                            label="이용자"
                            value={`${data.customerName} (${data.customerAge})`}
                        />
                        <Field label="서비스 일자" value={data.serviceDate} />
                        <Field label="담당 파트너" value={data.partnerName} />
                        <Field label="서비스 시간" value={data.timeRange} />
                    </div>

                    <Block title="수행 지원 내용">
                        {data.supports.length ? (
                            <div className="flex flex-wrap gap-2">
                                {data.supports.map((s) => (
                                    <span
                                        key={s}
                                        className="bg-brand/10 text-brand rounded-full px-3 py-1 text-xs font-bold"
                                    >
                                        {s}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-sm">
                                미선택
                            </p>
                        )}
                    </Block>

                    <Block title="검사 진행 내용">
                        <p className="text-foreground text-sm whitespace-pre-wrap">
                            {data.exam.trim() || (
                                <span className="text-muted-foreground">
                                    미작성
                                </span>
                            )}
                        </p>
                    </Block>

                    <Block title="보호자 전달사항">
                        <p className="text-foreground text-sm whitespace-pre-wrap">
                            {data.guardianNote.trim() || (
                                <span className="text-muted-foreground">
                                    미작성
                                </span>
                            )}
                        </p>
                    </Block>

                    <Block title="첨부 자료">
                        <p className="text-foreground text-sm">
                            {data.attachmentKinds.length
                                ? data.attachmentKinds.join(", ")
                                : "없음"}
                        </p>
                    </Block>
                </div>
            </div>

            <div className="mt-5 flex gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    닫기
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors"
                >
                    이대로 생성하기
                </button>
            </div>
        </Modal>
    );
}
