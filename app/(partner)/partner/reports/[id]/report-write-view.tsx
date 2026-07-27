"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, FileText, Info, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmModal } from "@/components/ui/modal";
import { SUPPORT_OPTIONS } from "../../../_lib/reports";
import type {
    ReportAttachmentView,
    ReportContext,
} from "../../../_lib/reports.server";
import {
    deleteReportAttachment,
    saveReport,
    uploadReportAttachment,
    type ReportInput,
} from "../../_actions/reports";
import {
    ReportPreviewModal,
    type ReportPreviewData,
} from "../../../_components/report-preview-modal";
import { ReportGeneratedModal } from "../../../_components/report-generated-modal";

function SummaryCol({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="text-foreground mt-1 font-bold">{value}</p>
        </div>
    );
}

/** 바이트 → "1.2MB" / "320KB" */
function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function ReportWriteView({ context }: { context: ReportContext }) {
    const router = useRouter();
    const item = context;
    const saved = context.report;

    // 기존 리포트에서 SUPPORT_OPTIONS 에 없는 값은 "기타"로 분리
    const savedEtc = (saved?.supports ?? []).find(
        (s) => !SUPPORT_OPTIONS.includes(s as (typeof SUPPORT_OPTIONS)[number]),
    );

    const [meetTime, setMeetTime] = useState(saved?.meetTime ?? "");
    const [endTime, setEndTime] = useState(saved?.endTime ?? "");
    const [supports, setSupports] = useState<Set<string>>(() =>
        saved
            ? new Set(
                  saved.supports.filter((s) =>
                      SUPPORT_OPTIONS.includes(
                          s as (typeof SUPPORT_OPTIONS)[number],
                      ),
                  ),
              )
            : new Set(SUPPORT_OPTIONS),
    );
    const [etcChecked, setEtcChecked] = useState(Boolean(savedEtc));
    const [etcText, setEtcText] = useState(savedEtc ?? "");
    const [exam, setExam] = useState(saved?.exam ?? "");
    const [guardianNote, setGuardianNote] = useState(saved?.guardianNote ?? "");
    const [attachments, setAttachments] = useState<ReportAttachmentView[]>(
        context.attachments,
    );

    const [previewOpen, setPreviewOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [successOpen, setSuccessOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const fileRef = useRef<HTMLInputElement>(null);

    const buildInput = (): ReportInput => ({
        meetTime,
        endTime,
        supports: selectedSupports,
        exam,
        guardianNote,
    });

    const onSaveDraft = () => {
        startTransition(async () => {
            const res = await saveReport(item.serviceId, buildInput(), false);
            if (res.ok) toast.success("임시 저장되었습니다.");
            else toast.error(res.message);
        });
    };

    const onUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        startTransition(async () => {
            const res = await uploadReportAttachment(item.serviceId, fd);
            if (res.ok) {
                setAttachments((prev) => [...prev, res.attachment]);
                toast.success("첨부가 업로드되었습니다.");
            } else {
                toast.error(res.message);
            }
        });
    };

    const onDeleteAttachment = (id: string) => {
        startTransition(async () => {
            const res = await deleteReportAttachment(id);
            if (res.ok) {
                setAttachments((prev) => prev.filter((x) => x.id !== id));
            } else {
                toast.error(res.message);
            }
        });
    };

    const toggleSupport = (name: string) => {
        setSupports((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const selectedSupports = [
        ...SUPPORT_OPTIONS.filter((s) => supports.has(s)),
        ...(etcChecked && etcText.trim() ? [etcText.trim()] : []),
    ];

    const previewData: ReportPreviewData = {
        hospital: item.hospital,
        customerName: item.customerName,
        customerAge: item.customerAge,
        serviceDate: item.serviceDate,
        partnerName: item.partnerName,
        timeRange: meetTime && endTime ? `${meetTime} ~ ${endTime}` : "미입력",
        supports: selectedSupports,
        exam,
        guardianNote,
        attachmentKinds: attachments.map((a) => a.kind),
    };

    const doGenerate = () => {
        setPreviewOpen(false);
        setConfirmOpen(false);
        startTransition(async () => {
            const res = await saveReport(item.serviceId, buildInput(), true);
            if (res.ok) setSuccessOpen(true);
            else toast.error(res.message);
        });
    };

    const handleGenerate = () => {
        setPreviewOpen(false);
        // 검사 진행 내용과 보호자 전달사항이 모두 비면 확인 모달
        if (!exam.trim() && !guardianNote.trim()) {
            setConfirmOpen(true);
            return;
        }
        doGenerate();
    };

    return (
        <div>
            {/* 헤더 */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-muted-foreground text-sm font-semibold">
                        리포트 작성 &gt; 리포트 목록 &gt;{" "}
                        <span className="text-brand">보호자 리포트 작성</span>
                    </p>
                    <h1 className="text-foreground mt-2 text-2xl font-extrabold md:text-3xl">
                        보호자 리포트 작성
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        서비스가 종료되었습니다. 아래 내용을 입력하시면 보호자
                        리포트가 자동으로 생성됩니다.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => toast.info("작성 가이드는 준비 중입니다.")}
                    className="border-border bg-background text-foreground hover:bg-muted inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-bold transition-colors"
                >
                    <Info className="size-4" />
                    작성 가이드 보기
                </button>
            </div>

            {/* 요약 바 */}
            <div className="border-border bg-background mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border p-6 md:grid-cols-5 md:p-7">
                <SummaryCol label="예약 번호" value={item.code} />
                <SummaryCol label="서비스 일자" value={item.serviceDate} />
                <SummaryCol
                    label="이용자"
                    value={`${item.customerName} (${item.customerAge} / ${item.customerGender})`}
                />
                <SummaryCol label="병원" value={item.hospital} />
                <SummaryCol label="담당 파트너" value={item.partnerName} />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
                {/* 좌측 폼 (2/3) */}
                <div className="space-y-5 lg:col-span-2">
                    {/* 1. 서비스 수행 시간 */}
                    <section className="border-border bg-background rounded-2xl border p-6 md:p-7">
                        <h2 className="text-foreground text-lg font-bold">
                            1. 서비스 수행 시간
                        </h2>
                        <p className="text-muted-foreground mt-1 text-sm">
                            파트너가 이용자를 처음 만난 시간과 서비스 시간을
                            입력해주세요.
                        </p>
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                            <label className="flex-1">
                                <span className="text-foreground text-sm font-semibold">
                                    만난 시간
                                </span>
                                <div className="border-input bg-background focus-within:border-ring focus-within:ring-ring/40 mt-1.5 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 focus-within:ring-[3px]">
                                    <Clock className="text-muted-foreground size-4" />
                                    <input
                                        type="time"
                                        value={meetTime}
                                        onChange={(e) =>
                                            setMeetTime(e.target.value)
                                        }
                                        className="w-full bg-transparent text-sm outline-none"
                                    />
                                </div>
                            </label>
                            <span className="text-muted-foreground hidden pb-3 sm:block">
                                →
                            </span>
                            <label className="flex-1">
                                <span className="text-foreground text-sm font-semibold">
                                    종료 시간
                                </span>
                                <div className="border-input bg-background focus-within:border-ring focus-within:ring-ring/40 mt-1.5 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 focus-within:ring-[3px]">
                                    <Clock className="text-muted-foreground size-4" />
                                    <input
                                        type="time"
                                        value={endTime}
                                        onChange={(e) =>
                                            setEndTime(e.target.value)
                                        }
                                        className="w-full bg-transparent text-sm outline-none"
                                    />
                                </div>
                            </label>
                        </div>
                    </section>

                    {/* 2. 수행 지원 내용 */}
                    <section className="border-border bg-background rounded-2xl border p-6 md:p-7">
                        <h2 className="text-foreground text-lg font-bold">
                            2. 수행 지원 내용{" "}
                            <span className="text-muted-foreground text-sm font-normal">
                                (해당 항목을 선택해주세요)
                            </span>
                        </h2>
                        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                            {SUPPORT_OPTIONS.map((s) => (
                                <label
                                    key={s}
                                    className="text-foreground flex cursor-pointer items-center gap-2 text-sm"
                                >
                                    <Checkbox
                                        checked={supports.has(s)}
                                        onCheckedChange={() => toggleSupport(s)}
                                    />
                                    {s}
                                </label>
                            ))}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                            <label className="text-foreground flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                                <Checkbox
                                    checked={etcChecked}
                                    onCheckedChange={(c) =>
                                        setEtcChecked(c === true)
                                    }
                                />
                                기타
                            </label>
                            <input
                                type="text"
                                value={etcText}
                                onChange={(e) => setEtcText(e.target.value)}
                                disabled={!etcChecked}
                                placeholder="직접 입력해주세요"
                                className="border-input bg-background placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40 flex-1 rounded-lg border px-3.5 py-2 text-sm outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                    </section>

                    {/* 3. 검사 진행 내용 */}
                    <section className="rounded-2xl border border-emerald-300/50 bg-emerald-50/50 p-6 md:p-7 dark:bg-emerald-500/5">
                        <h2 className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                            3. 검사 진행 내용
                        </h2>
                        <p className="text-muted-foreground mt-1 text-sm">
                            검사 항목, 진행 상황 및 특이사항을 입력해주세요.
                        </p>
                        <textarea
                            value={exam}
                            onChange={(e) =>
                                setExam(e.target.value.slice(0, 1000))
                            }
                            maxLength={1000}
                            placeholder="예) 혈액검사 진행, X-ray 촬영, 초음파 검사 대기 등, 특이사항 없음 등"
                            className="border-input bg-background placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40 mt-4 min-h-28 w-full resize-y rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                        />
                        <p className="text-muted-foreground mt-1 text-right text-xs">
                            {exam.length} / 1000
                        </p>
                    </section>

                    {/* 4. 보호자 전달사항 */}
                    <section className="border-border bg-background rounded-2xl border p-6 md:p-7">
                        <h2 className="text-foreground text-lg font-bold">
                            4. 보호자 전달사항
                        </h2>
                        <p className="text-muted-foreground mt-1 text-sm">
                            보호자에게 전달해야 할 내용이나 안내사항을
                            입력해주세요.
                        </p>
                        <textarea
                            value={guardianNote}
                            onChange={(e) =>
                                setGuardianNote(e.target.value.slice(0, 1000))
                            }
                            maxLength={1000}
                            placeholder="예) 다음 검사 일정 및 준비사항, 복약 안내, 추가 검사 및 재방문 일정, 의사 전달사항 등"
                            className="border-input bg-background placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40 mt-4 min-h-28 w-full resize-y rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                        />
                        <p className="text-muted-foreground mt-1 text-right text-xs">
                            {guardianNote.length} / 1000
                        </p>
                    </section>
                </div>

                {/* 우측 첨부 파일 (1/3) */}
                <div className="lg:col-span-1">
                    <section className="border-border bg-background rounded-2xl border p-6 md:p-7">
                        <h2 className="text-foreground text-lg font-bold">
                            첨부 파일
                        </h2>
                        <p className="text-muted-foreground mt-1 text-sm">
                            영수증, 처방전, 검사 예약증 등 관련 자료를
                            첨부해주세요.
                        </p>

                        <ul className="mt-4 space-y-3">
                            {attachments.map((a) => (
                                <li
                                    key={a.id}
                                    className="border-border flex items-center gap-3 rounded-xl border p-3"
                                >
                                    <span className="bg-brand/10 text-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
                                        <FileText className="size-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-foreground flex items-center gap-1.5 text-sm font-bold">
                                            {a.kind}
                                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:bg-emerald-500/15">
                                                업로드 완료
                                            </span>
                                        </p>
                                        <p className="text-muted-foreground truncate text-xs">
                                            {a.filename} ({formatSize(a.size)})
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        aria-label="첨부 삭제"
                                        disabled={pending}
                                        onClick={() => onDeleteAttachment(a.id)}
                                        className="text-muted-foreground hover:bg-muted flex size-7 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50"
                                    >
                                        <X className="size-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>

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
                            className="border-border bg-muted/20 hover:bg-muted/40 mt-4 flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-center transition-colors disabled:opacity-60"
                        >
                            <Upload className="text-muted-foreground size-5" />
                            <span className="text-foreground text-sm font-bold">
                                클릭하여 파일 업로드
                            </span>
                            <span className="text-muted-foreground text-xs">
                                JPG, PNG, PDF 파일만 가능 (최대 5MB)
                            </span>
                        </button>
                    </section>
                </div>
            </div>

            {/* 하단 액션 */}
            <div className="mt-8 flex flex-col items-center gap-3">
                <div className="flex flex-wrap justify-center gap-3">
                    <button
                        type="button"
                        onClick={onSaveDraft}
                        disabled={pending}
                        className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-bold transition-colors disabled:opacity-60"
                    >
                        임시 저장
                    </button>
                    <button
                        type="button"
                        onClick={() => setPreviewOpen(true)}
                        className="border-brand bg-background text-brand hover:bg-brand/5 rounded-lg border px-6 py-3 text-sm font-bold transition-colors"
                    >
                        미리보기
                    </button>
                    <button
                        type="button"
                        onClick={handleGenerate}
                        className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-6 py-3 text-sm font-bold transition-colors"
                    >
                        보호자 리포트 생성
                    </button>
                </div>
                <p className="text-muted-foreground text-center text-xs">
                    리포트 생성 시 보호자에게 문자로 링크가 발송되며, PDF로도
                    다운로드할 수 있습니다.
                </p>
            </div>

            {/* 모달 */}
            <ReportPreviewModal
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                onConfirm={handleGenerate}
                data={previewData}
            />
            <ConfirmModal
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={doGenerate}
                title="입력 내용을 확인해주세요"
                description="검사 진행 내용 또는 보호자 전달사항을 한 가지 이상 입력하면 더 충실한 리포트가 됩니다."
                cancelLabel="계속 작성"
                confirmLabel="그래도 생성"
            />
            <ReportGeneratedModal
                open={successOpen}
                onClose={() => setSuccessOpen(false)}
                onDownload={() => toast.success("PDF 다운로드를 시작합니다.")}
                onGoList={() => router.push("/partner/reports")}
                customerName={item.customerName}
            />
        </div>
    );
}
