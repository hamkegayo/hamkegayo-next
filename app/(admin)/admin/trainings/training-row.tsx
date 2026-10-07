"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { clearPartnerTraining, recordPartnerTraining } from "./actions";

export const COURSES = [
    { code: "BASIC", label: "기본 업무교육" },
    { code: "EMERGENCY", label: "응급상황 대응교육" },
    { code: "PRIVACY", label: "개인정보 보호교육" },
] as const;

export type CourseRecord = {
    completed_on: string;
    evidence_ref: string;
    confirmed_at: string;
};

const input =
    "border-input bg-background mt-1 w-full rounded-lg border px-3 py-2 text-sm";

/** 파트너 1명의 교육 3종 기록·삭제 (#255-3) */
export function TrainingRow({
    partnerId,
    courses,
}: {
    partnerId: string;
    courses: Record<string, CourseRecord>;
}) {
    const [course, setCourse] = useState<string>(COURSES[0].code);
    const [completedOn, setCompletedOn] = useState("");
    const [evidenceRef, setEvidenceRef] = useState("");
    const [pending, startTransition] = useTransition();

    const onRecord = () =>
        startTransition(async () => {
            const res = await recordPartnerTraining({
                partnerId,
                course,
                completedOn,
                evidenceRef,
            });
            if (res.ok) {
                toast.success("이수 확인을 기록했습니다.");
                setCompletedOn("");
                setEvidenceRef("");
            } else toast.error(res.message);
        });

    const onClear = (code: string) => {
        const reason = window.prompt("삭제 사유를 입력해 주세요 (5-300자)");
        if (reason === null) return;
        startTransition(async () => {
            const res = await clearPartnerTraining({
                partnerId,
                course: code,
                reason,
            });
            if (res.ok) toast.success("기록을 삭제했습니다.");
            else toast.error(res.message);
        });
    };

    return (
        <div className="mt-3 space-y-3">
            <ul className="space-y-1 text-sm">
                {COURSES.map((c) => {
                    const r = courses[c.code];
                    return (
                        <li
                            key={c.code}
                            className="flex flex-wrap items-center gap-2"
                        >
                            <span className="w-36 font-semibold">
                                {c.label}
                            </span>
                            {r ? (
                                <>
                                    <span>
                                        {r.completed_on} 이수 · 증빙{" "}
                                        {r.evidence_ref}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={pending}
                                        onClick={() => onClear(c.code)}
                                        className="text-muted-foreground text-xs underline"
                                    >
                                        삭제
                                    </button>
                                </>
                            ) : (
                                <span className="text-destructive">미확인</span>
                            )}
                        </li>
                    );
                })}
            </ul>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end">
                <label className="text-sm">
                    교육
                    <select
                        className={input}
                        value={course}
                        onChange={(e) => setCourse(e.target.value)}
                    >
                        {COURSES.map((c) => (
                            <option key={c.code} value={c.code}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-sm">
                    이수일
                    <input
                        type="date"
                        className={input}
                        value={completedOn}
                        onChange={(e) => setCompletedOn(e.target.value)}
                    />
                </label>
                <label className="text-sm">
                    증빙 (이수증 번호·문서명)
                    <input
                        className={input}
                        value={evidenceRef}
                        maxLength={200}
                        onChange={(e) => setEvidenceRef(e.target.value)}
                    />
                </label>
                <button
                    type="button"
                    disabled={
                        pending || !completedOn || evidenceRef.trim().length < 2
                    }
                    onClick={onRecord}
                    className="bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                    기록
                </button>
            </div>
        </div>
    );
}
