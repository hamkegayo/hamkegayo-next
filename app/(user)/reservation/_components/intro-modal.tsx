"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { useReservationStore } from "../_store/reservation-store";

const LIMITS = [
    "지속적인 간병이 필요한 경우",
    "응급처치 또는 의료행위가 필요한 경우",
    "의사소통이 어려운 중증 인지장애가 있는 경우",
    "혼자 또는 1인 부축으로 이동이 어려운 경우",
    "격리 또는 특별 감염관리가 필요한 경우",
];

/** STEP0 · 예약 시작 전 필수 확인 모달 (동의해야만 진행 가능) */
export function IntroModal() {
    const confirmIntro = useReservationStore((s) => s.confirmIntro);
    const [agreed, setAgreed] = useState(false);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" />
            <div className="bg-background relative z-10 w-full max-w-md rounded-2xl p-6 shadow-xl md:p-8">
                <h2 className="text-foreground text-xl font-extrabold">
                    서비스 이용 전 확인해주세요.
                </h2>
                <p className="text-muted-foreground mt-4 text-center text-sm leading-relaxed">
                    함께가요는 병원 이동 및 진료 동행을 지원하는 서비스입니다.
                    <br />
                    아래와 같은 경우에는 서비스 이용이 제한될 수 있습니다.
                </p>

                <ul className="mt-6 flex flex-col gap-3 text-center">
                    {LIMITS.map((l) => (
                        <li
                            key={l}
                            className="text-foreground text-sm font-bold"
                        >
                            {l}
                        </li>
                    ))}
                </ul>

                <p className="text-muted-foreground mt-6 text-center text-sm">
                    이용 가능 여부가 불확실한 경우 고객센터로 문의해주세요.
                </p>

                <div className="bg-border my-5 h-px" />

                <label className="flex items-center justify-center gap-2">
                    <Checkbox
                        checked={agreed}
                        onCheckedChange={(checked) =>
                            setAgreed(checked === true)
                        }
                    />
                    <span className="text-foreground text-sm font-medium">
                        위 내용을 확인했습니다.
                    </span>
                </label>

                <button
                    type="button"
                    disabled={!agreed}
                    onClick={confirmIntro}
                    className={cn(
                        "mt-4 h-12 w-full rounded-lg text-base font-bold transition-colors",
                        agreed
                            ? "bg-brand text-brand-foreground hover:bg-brand/90"
                            : "bg-muted text-muted-foreground cursor-not-allowed",
                    )}
                >
                    예약 시작하기
                </button>
            </div>
        </div>
    );
}
