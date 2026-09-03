"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Check,
    CheckCircle2,
    ChevronLeft,
    FileText,
    Hourglass,
    House,
    MapPin,
    Play,
    Square,
    Upload,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { PartnerServiceView } from "../../../_lib/services.server";
import {
    arriveService,
    completeService,
    endService,
    startService,
} from "../../_actions/services";
import { EndServiceModal } from "../../../_components/end-service-modal";
import { ServiceFeedbackModal } from "../../../_components/service-feedback-modal";

type MemoTab = "start" | "end";

export function ServiceDetailView({
    service,
}: {
    service: PartnerServiceView;
}) {
    const router = useRouter();
    const item = service;

    // 초기 진행 상태를 서비스 상태(state)로부터 파생
    const initial = useMemo(() => {
        switch (service.state) {
            case "COMPLETED":
                return { started: true, ended: true, done: true };
            case "ENDED":
                return { started: true, ended: true, done: false };
            case "IN_PROGRESS":
                return { started: true, ended: false, done: false };
            default:
                return { started: false, ended: false, done: false };
        }
    }, [service.state]);

    const [arrived, setArrived] = useState(
        !!service.arrivedAtLabel || initial.started,
    );
    const [started, setStarted] = useState(initial.started);
    const [ended, setEnded] = useState(initial.ended);
    const [done, setDone] = useState(initial.done);
    const [pending, startTransition] = useTransition();

    const [endOpen, setEndOpen] = useState(false);
    const [feedbackOpen, setFeedbackOpen] = useState(false);

    const [memoTab, setMemoTab] = useState<MemoTab>("start");
    const [startMemo, setStartMemo] = useState(service.startMemo ?? "");
    const [endMemo, setEndMemo] = useState(service.endMemo ?? "");

    const startAt = `${item.dateLabel} ${service.startedAtLabel ?? "-"}`;
    const endAt = `${item.dateLabel} ${service.endedAtLabel ?? "-"}`;
    const serviceName = `${item.hospital} ${item.type}`;

    // 헤더 상태 배지
    const statusBadge = done
        ? null
        : ended
          ? {
                label: "귀가 대기",
                cls: "bg-amber-100 text-amber-600 dark:bg-amber-500/15",
                dot: "bg-amber-500",
            }
          : started
            ? {
                  label: "진행중",
                  cls: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15",
                  dot: "bg-emerald-500",
              }
            : {
                  label: "진행 예정",
                  cls: "bg-blue-100 text-blue-600 dark:bg-blue-500/15",
                  dot: "bg-blue-500",
              };

    const onArrive = () => {
        startTransition(async () => {
            const res = await arriveService(service.id);
            if (res.ok) {
                setArrived(true);
                toast.success("도착이 기록되고 보호자에게 안내되었습니다.");
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    };

    const onStart = () => {
        startTransition(async () => {
            const res = await startService(service.id, startMemo);
            if (res.ok) {
                setStarted(true);
                toast.success("서비스 시작이 기록되었습니다.");
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    };

    const onEndConfirm = () => {
        startTransition(async () => {
            const res = await endService(service.id, endMemo);
            if (res.ok) {
                setEnded(true);
                setEndOpen(false);
                setMemoTab("end");
                toast.success("서비스 종료가 기록되었습니다.");
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    };

    const onFeedbackSubmit = () => {
        startTransition(async () => {
            const res = await completeService(service.id);
            if (res.ok) {
                setFeedbackOpen(false);
                setDone(true);
                toast.success("피드백이 제출되었습니다. 수고하셨습니다!");
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    };

    /* ---------- 완료 화면 ---------- */
    if (done) {
        return (
            <div className="mx-auto flex max-w-2xl flex-col items-center py-8">
                <div className="border-border bg-background w-full rounded-2xl border p-8 md:p-10">
                    <div className="flex items-start gap-4">
                        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15">
                            <Check className="size-7" strokeWidth={3} />
                        </span>
                        <div>
                            <h1 className="text-foreground text-2xl font-extrabold">
                                서비스가 완료되었습니다
                            </h1>
                            <p className="text-muted-foreground mt-1">
                                귀가까지 안전하게 마쳤습니다. 수고하셨습니다.
                            </p>
                        </div>
                    </div>

                    <div className="border-border mt-7 border-t pt-6">
                        <SummaryRow
                            label="서비스"
                            value={`${serviceName} (${item.plan.toUpperCase()})`}
                        />
                        <SummaryRow
                            label="이용자"
                            value={`${item.customerName} (${item.customerAge})`}
                        />
                        <SummaryRow label="서비스 시작" value={startAt} />
                        <SummaryRow label="서비스 종료" value={endAt} />
                        <SummaryRow
                            label="청구 이용시간"
                            value={item.durationLabel}
                        />
                        <SummaryRow
                            label={
                                item.amountProvisional
                                    ? "예상 정산 금액"
                                    : "정산 금액"
                            }
                            value={`${item.amount.toLocaleString()}원`}
                            valueClass="text-brand"
                        />
                    </div>

                    <div className="mt-7 flex gap-3">
                        <Link
                            href="/partner/management"
                            className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-xl border px-4 py-3.5 text-center text-sm font-bold transition-colors"
                        >
                            진행 관리로
                        </Link>
                        <Link
                            href={`/partner/reports/${service.id}`}
                            className="bg-brand text-brand-foreground hover:bg-brand/90 flex-1 rounded-xl px-4 py-3.5 text-center text-sm font-bold transition-colors"
                        >
                            리포트 쓰러가기
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    /* ---------- 세부 진행 화면 ---------- */
    return (
        <div>
            <Link
                href="/partner/management"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-semibold transition-colors"
            >
                <ChevronLeft className="size-4" />
                진행 중 목록으로
            </Link>

            <div className="mt-3 flex items-start justify-between gap-4">
                <div>
                    <p className="text-muted-foreground text-sm font-semibold">
                        진행관리 &gt; 수락한 서비스 목록 &gt;{" "}
                        <span className="text-brand">세부 진행</span>
                    </p>
                    <h1 className="text-foreground mt-2 text-2xl font-extrabold md:text-3xl">
                        세부 진행
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        서비스 시작과 종료를 기록하고, 메모를 남겨주세요.
                    </p>
                </div>
                {ended && (
                    <button
                        type="button"
                        onClick={() =>
                            toast.info("예약/요청 정보는 준비 중입니다.")
                        }
                        className="border-border bg-background text-foreground hover:bg-muted inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-bold transition-colors"
                    >
                        <FileText className="size-4" />
                        예약/요청 정보 보기
                    </button>
                )}
            </div>

            {/* 요약 카드 */}
            <div className="border-border bg-background mt-6 flex flex-col gap-5 rounded-2xl border p-6 md:flex-row md:items-center md:justify-between md:p-7">
                <div className="flex items-start gap-4">
                    <span className="bg-brand/10 text-brand flex size-14 shrink-0 items-center justify-center rounded-xl">
                        <House className="size-7" />
                    </span>
                    <div>
                        <h2 className="text-foreground text-xl font-extrabold">
                            {serviceName}
                        </h2>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:bg-emerald-500/15">
                                {item.plan.toUpperCase()}
                            </span>
                            {statusBadge && (
                                <span
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                                        statusBadge.cls,
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "size-1.5 rounded-full",
                                            statusBadge.dot,
                                        )}
                                    />
                                    {statusBadge.label}
                                </span>
                            )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
                            <span className="text-muted-foreground">
                                예약 번호{" "}
                                <span className="text-foreground font-bold">
                                    {item.code}
                                </span>
                            </span>
                            <span className="text-muted-foreground">
                                이용자{" "}
                                <span className="text-foreground font-bold">
                                    {item.customerName} ({item.customerAge})
                                </span>
                            </span>
                            <span className="text-muted-foreground">
                                예약 시간{" "}
                                <span className="text-foreground font-bold">
                                    {item.dateLabel} {item.timeLabel}
                                </span>
                            </span>
                        </div>
                    </div>
                </div>
                <div className="border-border shrink-0 border-t pt-4 text-right md:border-t-0 md:border-l md:pt-0 md:pl-8">
                    <p className="text-muted-foreground text-sm">
                        {item.amountProvisional
                            ? "예상 정산 금액"
                            : "정산 금액"}
                    </p>
                    <p className="text-brand mt-1 text-3xl font-extrabold">
                        {item.amount.toLocaleString()}원
                    </p>
                    <p className="text-muted-foreground text-xs">
                        {item.durationLabel} 기준 · 수수료 차감 후
                        {item.surcharged ? " · 주말·공휴일 할증 적용" : ""}
                    </p>
                    {item.amountProvisional && (
                        <p className="text-muted-foreground text-xs">
                            (실제 이용시간에 따라 종료 후 확정)
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
                {/* 서비스 진행 */}
                <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
                    <h2 className="text-foreground text-lg font-bold">
                        서비스 진행
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                        서비스 시작과 종료 시간을 기록해주세요.
                    </p>

                    {/* STEP 1 - 도착 통보 */}
                    <StepBlock
                        index={1}
                        title="현장 도착 통보"
                        icon={MapPin}
                        done={arrived}
                    >
                        {arrived ? (
                            <RecordedBox
                                label="도착 통보 완료"
                                date={item.dateLabel}
                                timeLabel="도착 시간"
                                time={service.arrivedAtLabel ?? "-"}
                            />
                        ) : (
                            <>
                                <p className="text-muted-foreground text-sm">
                                    약속 장소에 도착하면 눌러주세요. 보호자에게
                                    도착이 안내되고, 이 시각부터 이용시간이
                                    계산됩니다.
                                </p>
                                <button
                                    type="button"
                                    onClick={onArrive}
                                    disabled={pending}
                                    className="bg-brand text-brand-foreground hover:bg-brand/90 mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-bold transition-colors disabled:opacity-60"
                                >
                                    <MapPin className="size-4" />
                                    도착 통보
                                </button>
                            </>
                        )}
                    </StepBlock>

                    {/* STEP 2 - 시작 */}
                    <StepBlock
                        index={2}
                        title="서비스 시작"
                        icon={Play}
                        done={started}
                    >
                        {started ? (
                            <RecordedBox
                                label="시작 완료"
                                date={item.dateLabel}
                                timeLabel="시작 시간"
                                time={service.startedAtLabel ?? "-"}
                            />
                        ) : (
                            <button
                                type="button"
                                onClick={onStart}
                                disabled={pending}
                                className="bg-brand text-brand-foreground hover:bg-brand/90 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-bold transition-colors disabled:opacity-60"
                            >
                                <Play className="size-4" />
                                서비스 시작
                            </button>
                        )}
                    </StepBlock>

                    {/* STEP 3 - 종료 */}
                    <StepBlock
                        index={3}
                        title="서비스 종료"
                        icon={Square}
                        done={ended}
                        disabled={!started}
                    >
                        {ended ? (
                            <RecordedBox
                                label="종료 완료"
                                date={item.dateLabel}
                                timeLabel="종료 시간"
                                time={service.endedAtLabel ?? "-"}
                            />
                        ) : (
                            <>
                                <PendingBox />
                                <button
                                    type="button"
                                    disabled={!started}
                                    onClick={() => setEndOpen(true)}
                                    className={cn(
                                        "mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-4 py-3 text-sm font-bold transition-colors",
                                        started
                                            ? "border-destructive/50 text-destructive hover:bg-destructive/5"
                                            : "border-border text-muted-foreground cursor-not-allowed",
                                    )}
                                >
                                    <Square className="size-4" />
                                    서비스 종료
                                </button>
                            </>
                        )}
                    </StepBlock>

                    {/* 종료 후: 귀가 완료 + 피드백 */}
                    {ended && (
                        <div className="mt-5 rounded-xl border border-amber-300/50 bg-amber-50 p-4 dark:bg-amber-500/10">
                            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                                서비스가 종료되었습니다.
                            </p>
                            <p className="mt-0.5 text-sm text-amber-700/80 dark:text-amber-400/80">
                                이용자의 귀가를 확인한 뒤 피드백을 남기고 완료
                                처리해 주세요.
                            </p>
                            <button
                                type="button"
                                onClick={() => setFeedbackOpen(true)}
                                className="bg-brand text-brand-foreground hover:bg-brand/90 mt-3 w-full rounded-lg px-4 py-3 text-sm font-bold transition-colors"
                            >
                                귀가 완료 및 피드백 작성
                            </button>
                        </div>
                    )}
                </div>

                {/* 메모 작성 */}
                <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
                    <h2 className="text-foreground text-lg font-bold">
                        메모 작성
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                        서비스 시작과 종료에 대한 메모를 남겨주세요.
                    </p>

                    {/* 종료 후에는 시작/종료 탭 표시 */}
                    {ended && (
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            {(["start", "end"] as const).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setMemoTab(t)}
                                    className={cn(
                                        "rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors",
                                        memoTab === t
                                            ? "border-brand bg-brand/5 text-brand"
                                            : "border-border text-muted-foreground hover:bg-muted",
                                    )}
                                >
                                    {t === "start"
                                        ? "서비스 시작"
                                        : "서비스 종료"}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="mt-4">
                        <textarea
                            value={memoTab === "start" ? startMemo : endMemo}
                            onChange={(e) => {
                                const v = e.target.value.slice(0, 1000);
                                if (memoTab === "start") setStartMemo(v);
                                else setEndMemo(v);
                            }}
                            maxLength={1000}
                            placeholder={
                                memoTab === "start"
                                    ? "서비스 시작 시점의 상태·특이사항을 입력해 주세요."
                                    : "서비스 종료 시점의 상태·특이사항을 입력해 주세요."
                            }
                            className="border-input bg-background placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40 min-h-40 w-full resize-y rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                        />
                        <p className="text-muted-foreground mt-1 text-right text-xs">
                            {(memoTab === "start" ? startMemo : endMemo).length}{" "}
                            / 1000
                        </p>
                    </div>

                    {/* 파일 첨부 */}
                    <p className="text-foreground mt-4 text-sm font-bold">
                        사진/파일 첨부{" "}
                        <span className="text-muted-foreground font-normal">
                            (선택)
                        </span>
                    </p>
                    <button
                        type="button"
                        onClick={() => toast.info("파일 첨부는 준비 중입니다.")}
                        className="border-border bg-muted/30 hover:bg-muted/50 mt-2 flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors"
                    >
                        <Upload className="text-muted-foreground size-5" />
                        <span className="text-foreground text-sm font-bold">
                            사진 또는 파일을 선택하세요
                        </span>
                        <span className="text-muted-foreground text-xs">
                            JPG, PNG, PDF (최대 10MB)
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => toast.success("임시 저장되었습니다.")}
                        className="bg-brand text-brand-foreground hover:bg-brand/90 mt-4 w-full rounded-lg px-4 py-3 text-sm font-bold transition-colors"
                    >
                        임시 저장
                    </button>

                    {/* 메모 요약 */}
                    <p className="text-foreground mt-6 text-sm font-bold">
                        메모 요약{" "}
                        <span className="text-muted-foreground font-normal">
                            (자동으로 최종 리포트에 포함됩니다)
                        </span>
                    </p>
                    <div className="border-border bg-muted/20 mt-2 min-h-28 rounded-xl border border-dashed p-4 text-sm">
                        {startMemo || endMemo ? (
                            <ul className="space-y-2">
                                {startMemo && (
                                    <li className="text-foreground">
                                        <span className="text-brand font-bold">
                                            시작
                                        </span>{" "}
                                        · {startMemo}
                                    </li>
                                )}
                                {endMemo && (
                                    <li className="text-foreground">
                                        <span className="text-brand font-bold">
                                            종료
                                        </span>{" "}
                                        · {endMemo}
                                    </li>
                                )}
                            </ul>
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
                                <FileText className="text-muted-foreground size-5" />
                                <p className="text-muted-foreground">
                                    작성된 메모가 여기에 표시됩니다.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <EndServiceModal
                open={endOpen}
                onClose={() => setEndOpen(false)}
                onConfirm={onEndConfirm}
                serviceName={serviceName}
                startAt={startAt}
                endAt={endAt}
            />
            <ServiceFeedbackModal
                open={feedbackOpen}
                onClose={() => setFeedbackOpen(false)}
                onSubmit={onFeedbackSubmit}
            />
        </div>
    );
}

/* ---------- 하위 컴포넌트 ---------- */

function StepBlock({
    index,
    title,
    icon: Icon,
    done,
    disabled,
    children,
}: {
    index: number;
    title: string;
    icon: typeof Play;
    done: boolean;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="mt-5">
            <div className="flex items-center gap-2.5">
                <span
                    className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        done
                            ? "bg-emerald-500 text-white"
                            : disabled
                              ? "bg-muted text-muted-foreground"
                              : "bg-brand text-brand-foreground",
                    )}
                >
                    {done ? (
                        <Check className="size-4" strokeWidth={3} />
                    ) : (
                        index
                    )}
                </span>
                <Icon
                    className={cn(
                        "size-5",
                        done ? "text-emerald-500" : "text-muted-foreground",
                    )}
                />
                <span className="text-foreground font-bold">{title}</span>
            </div>
            <div
                className={cn(
                    "mt-3 rounded-xl border p-4",
                    done
                        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                        : "border-border",
                )}
            >
                {children}
            </div>
        </div>
    );
}

function RecordedBox({
    label,
    date,
    timeLabel,
    time,
}: {
    label: string;
    date: string;
    timeLabel: string;
    time: string;
}) {
    return (
        <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-4" />
                    {label}
                </span>
                <span className="text-muted-foreground">
                    날짜{" "}
                    <span className="text-foreground font-bold">{date}</span>
                </span>
                <span className="text-muted-foreground">
                    {timeLabel}{" "}
                    <span className="text-foreground font-bold">{time}</span>
                </span>
            </div>
            <div className="bg-background/60 text-muted-foreground mt-3 w-full rounded-lg px-4 py-2.5 text-center text-sm font-bold">
                완료됨
            </div>
        </>
    );
}

function PendingBox() {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5 font-bold">
                <Hourglass className="size-4" />
                종료 대기 중
            </span>
            <span className="text-muted-foreground">날짜 -</span>
            <span className="text-muted-foreground">종료 시간 -</span>
        </div>
    );
}

function SummaryRow({
    label,
    value,
    valueClass,
}: {
    label: string;
    value: string;
    valueClass?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-muted-foreground">{label}</span>
            <span
                className={cn(
                    "text-foreground text-right font-bold",
                    valueClass,
                )}
            >
                {value}
            </span>
        </div>
    );
}
