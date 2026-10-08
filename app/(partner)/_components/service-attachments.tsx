"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";

import type { ReportAttachmentView } from "../_lib/reports.server";
import {
    deleteReportAttachment,
    uploadReportAttachment,
} from "../partner/_actions/reports";

function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * 서비스 메모의 사진/파일 첨부 (#255-2).
 * 리포트 첨부(report_attachments, JPG/PNG/PDF·5MB)에 바로 저장되어 리포트 작성 화면으로 이어진다.
 * 고객에게는 진료내용 전달 동의가 있을 때만 보인다(처리방침 제10조 ④, #253).
 */
export function ServiceAttachments({
    serviceId,
    initial,
}: {
    serviceId: string;
    initial: ReportAttachmentView[];
}) {
    const [attachments, setAttachments] = useState(initial);
    const [pending, startTransition] = useTransition();
    const fileRef = useRef<HTMLInputElement>(null);

    const onUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        startTransition(async () => {
            const res = await uploadReportAttachment(serviceId, fd);
            if (res.ok) {
                setAttachments((prev) => [...prev, res.attachment]);
                toast.success(
                    "첨부가 업로드되었습니다. 리포트에 함께 담깁니다.",
                );
            } else {
                toast.error(res.message);
            }
        });
    };

    const onDelete = (id: string) => {
        startTransition(async () => {
            const res = await deleteReportAttachment(id);
            if (res.ok)
                setAttachments((prev) => prev.filter((x) => x.id !== id));
            else toast.error(res.message);
        });
    };

    return (
        <div className="mt-2">
            {attachments.length > 0 && (
                <ul className="mb-3 space-y-2">
                    {attachments.map((a) => (
                        <li
                            key={a.id}
                            className="border-border flex items-center gap-3 rounded-xl border p-3"
                        >
                            <span className="bg-brand/10 text-brand flex size-8 shrink-0 items-center justify-center rounded-lg">
                                <FileText className="size-4" />
                            </span>
                            <p className="text-foreground min-w-0 flex-1 truncate text-sm leading-relaxed">
                                {a.filename}{" "}
                                <span className="text-muted-foreground text-sm">
                                    ({formatSize(a.size)})
                                </span>
                            </p>
                            <button
                                type="button"
                                aria-label="첨부 삭제"
                                disabled={pending}
                                onClick={() => onDelete(a.id)}
                                className="text-muted-foreground hover:bg-muted flex size-7 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50"
                            >
                                <X className="size-4" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={onUploadChange}
                className="hidden"
            />
            <button
                type="button"
                disabled={pending}
                onClick={() => fileRef.current?.click()}
                className="border-border bg-muted/30 hover:bg-muted/50 flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors disabled:opacity-60"
            >
                <Upload className="text-muted-foreground size-5" />
                <span className="text-foreground text-sm font-bold">
                    {pending ? "처리 중…" : "사진 또는 파일을 선택하세요"}
                </span>
                <span className="text-muted-foreground text-sm">
                    JPG, PNG, PDF (최대 5MB) · 리포트 첨부로 함께 저장돼요
                </span>
            </button>
            {/* 개인정보 최소화 — 업로드 전 안내 (#255 제안안) */}
            <p className="text-description-foreground mt-2 text-sm leading-relaxed break-keep">
                이용자 얼굴, 진료 서류의 주민등록번호·계좌번호가 보이지 않게
                가리고 올려 주세요.
            </p>
        </div>
    );
}
