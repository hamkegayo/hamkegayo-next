"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import {
    reportButtonError,
    reportOverrunNotice,
} from "../partner/_actions/services";

export type NoticeKind = "OVERRUN_NOTICE" | "BUTTON_ERROR";

/**
 * 현장 고지·오류 신고 (#55 — 매뉴얼 대응카드 13 · 26).
 *
 *  두 대응카드가 요구하는 기록 항목이 서로 달라 한 컴포넌트에서 갈랐다.
 *  공통은 **"실제 시각"** 이다.
 *
 *  여기서 시각을 손으로 받는 것이 리포트에서 시각 입력을 없앤 것과
 *  어긋나 보일 수 있는데, 성격이 다르다. 리포트의 시각은 **청구의 근거가
 *  되는 시스템 기록**이라 사람이 치면 안 되고, 여기 적는 시각은 매뉴얼이
 *  기록하라고 정한 **신고 내용**이다.
 *
 *    대응카드 26 — "① 실제 시각과 장소를 기록한다 … ⑦ 임의의 시각을
 *                   입력하지 않는다"
 *
 *  즉 금지된 것은 "시스템 시각 칸에 가짜 시각을 넣는 것" 이지 신고서에
 *  사실을 적는 것이 아니다. 그래서 이 값은 services 에 바로 들어가지
 *  않고, 반영은 운영센터가 사유를 남기고 한다.
 */
export function ServiceNoticeModal({
    open,
    onClose,
    kind,
    serviceId,
    /** 서비스 일자 기준 ISO. 없으면 오늘로 만든다. */
    baseDate,
    onDone,
}: {
    open: boolean;
    onClose: () => void;
    kind: NoticeKind;
    serviceId: string;
    baseDate: string | null;
    onDone: () => void;
}) {
    const [time, setTime] = useState("");
    const [expectedEnd, setExpectedEnd] = useState("");
    const [notifiedTo, setNotifiedTo] = useState<"USER" | "GUARDIAN" | "BOTH">(
        "BOTH",
    );
    const [errorText, setErrorText] = useState("");
    const [detail, setDetail] = useState("");
    const [pending, setPending] = useState(false);

    const overrun = kind === "OVERRUN_NOTICE";

    /** "HH:mm" → 서비스 당일의 ISO. 서비스는 하루 안에 끝난다. */
    const toIso = (hhmm: string): string | null => {
        const [hh, mm] = hhmm.split(":").map((n) => Number(n));
        if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
        const at = baseDate ? new Date(baseDate) : new Date();
        if (Number.isNaN(at.getTime())) return null;
        at.setHours(hh, mm, 0, 0);
        return at.toISOString();
    };

    const submit = async () => {
        const occurredAt = toIso(time);
        if (!occurredAt) {
            toast.error("실제 시각을 입력해 주세요.");
            return;
        }
        if (!overrun && !errorText.trim()) {
            toast.error("화면에 표시된 오류 문구를 적어 주세요.");
            return;
        }

        setPending(true);
        const res = overrun
            ? await reportOverrunNotice(serviceId, {
                  occurredAt,
                  notifiedTo,
                  expectedEndAt: expectedEnd ? toIso(expectedEnd) : null,
                  detail: detail.trim(),
              })
            : await reportButtonError(serviceId, {
                  occurredAt,
                  errorText: errorText.trim(),
                  detail: detail.trim(),
              });
        setPending(false);

        if (!res.ok) {
            toast.error(res.message);
            return;
        }
        toast.success("운영센터에 전달했어요.");
        onDone();
    };

    return (
        <Modal open={open} onClose={onClose} className="max-w-md">
            <h3 className="text-foreground text-lg font-extrabold">
                {overrun ? "예정 종료시각 초과 알림" : "버튼 오류 신고"}
            </h3>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                {overrun
                    ? "이용자·보호자에게 알린 사실을 남깁니다. 추가시간은 현장에서 정하지 않습니다 — 운영센터가 확인합니다."
                    : "적어 주신 시각은 기록으로만 남습니다. 요금에 반영할지는 운영센터가 확인 후 정정합니다."}
            </p>

            <div className="mt-5 space-y-4">
                <label className="block">
                    <span className="text-foreground text-sm font-semibold">
                        {overrun ? "알린 실제 시각" : "버튼을 누른 실제 시각"}
                    </span>
                    <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="border-input bg-background focus:border-ring focus:ring-ring/40 mt-1.5 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus:ring-[3px]"
                    />
                </label>

                {overrun ? (
                    <>
                        <div>
                            <span className="text-foreground text-sm font-semibold">
                                알린 대상
                            </span>
                            <div className="mt-1.5 grid grid-cols-3 gap-2">
                                {(
                                    [
                                        ["USER", "이용자"],
                                        ["GUARDIAN", "보호자"],
                                        ["BOTH", "둘 다"],
                                    ] as const
                                ).map(([v, label]) => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => setNotifiedTo(v)}
                                        className={
                                            notifiedTo === v
                                                ? "border-brand bg-brand/10 text-brand rounded-lg border px-3 py-2 text-sm font-bold"
                                                : "border-border text-muted-foreground hover:bg-muted rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                                        }
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label className="block">
                            <span className="text-foreground text-sm font-semibold">
                                알린 예상 종료시각{" "}
                                <span className="text-muted-foreground font-normal">
                                    (선택)
                                </span>
                            </span>
                            <input
                                type="time"
                                value={expectedEnd}
                                onChange={(e) => setExpectedEnd(e.target.value)}
                                className="border-input bg-background focus:border-ring focus:ring-ring/40 mt-1.5 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus:ring-[3px]"
                            />
                        </label>
                    </>
                ) : (
                    <label className="block">
                        <span className="text-foreground text-sm font-semibold">
                            화면에 표시된 오류 문구
                        </span>
                        <input
                            type="text"
                            value={errorText}
                            onChange={(e) => setErrorText(e.target.value)}
                            placeholder="예) 처리에 실패했습니다"
                            className="border-input bg-background focus:border-ring focus:ring-ring/40 mt-1.5 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus:ring-[3px]"
                        />
                    </label>
                )}

                <label className="block">
                    <span className="text-foreground text-sm font-semibold">
                        {overrun ? "지연 사유와 남은 업무" : "통신상태 등"}
                    </span>
                    <textarea
                        value={detail}
                        onChange={(e) => setDetail(e.target.value)}
                        rows={3}
                        placeholder={
                            overrun
                                ? "예) 검사 순서가 밀려 진료가 40분 지연됨. 수납·약국 절차 남음"
                                : "예) 지하 1층, 데이터가 끊김"
                        }
                        className="border-input bg-background focus:border-ring focus:ring-ring/40 mt-1.5 w-full resize-none rounded-lg border px-3.5 py-2.5 text-sm outline-none focus:ring-[3px]"
                    />
                </label>

                {/*
                  대응카드 26 금지 사항 — 업무와 무관한 개인정보·진료정보가
                  포함된 화면을 저장하거나 전송하지 않는다. 적는 칸에서
                  미리 막아 두는 편이 낫다.
                */}
                <p className="text-muted-foreground text-xs leading-relaxed">
                    이용자 이름·연락처·진료 내용은 적지 마세요. 예약번호로
                    확인됩니다.
                </p>
            </div>

            <div className="mt-6 flex gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    닫기
                </button>
                <button
                    type="button"
                    disabled={pending}
                    onClick={submit}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors disabled:opacity-60"
                >
                    {pending ? "보내는 중" : "운영센터에 알리기"}
                </button>
            </div>
        </Modal>
    );
}
