import { CreditCard, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { getMyPoints } from "../_lib/points.server";

function PCoin({ className }: { className?: string }) {
    return (
        <span
            className={cn(
                "flex items-center justify-center rounded-full bg-amber-400 font-extrabold text-white shadow-sm",
                className,
            )}
        >
            P
        </span>
    );
}

export default async function MypagePoints() {
    const { balance, entries } = await getMyPoints();

    return (
        <div>
            <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                내 포인트
            </h1>

            {/* 보유 포인트 */}
            <h2 className="text-foreground mt-8 text-lg font-bold">
                보유 포인트
            </h2>
            <div className="border-border bg-background sm:divide-border mt-4 grid gap-4 rounded-2xl border p-6 sm:grid-cols-[1.4fr_1fr] sm:gap-0 sm:divide-x">
                <div className="flex items-center gap-4">
                    <PCoin className="size-14 text-2xl" />
                    <div>
                        <p className="text-muted-foreground text-sm">
                            사용 가능한 포인트
                        </p>
                        <p className="text-3xl font-extrabold text-amber-500">
                            {balance.toLocaleString()}{" "}
                            <span className="text-lg">P</span>
                        </p>
                    </div>
                </div>
                <div className="flex flex-col justify-center gap-3 sm:pl-8">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">유효기간</span>
                        <span className="text-foreground font-bold">없음</span>
                    </div>
                    <p className="text-description-foreground text-xs break-keep">
                        적립된 포인트는 기한 없이 사용할 수 있어요.
                    </p>
                </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                {/* 포인트 내역 */}
                <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
                    <h2 className="text-foreground text-lg font-bold">
                        포인트 내역
                    </h2>

                    {entries.length === 0 ? (
                        <div className="text-muted-foreground mt-4 rounded-xl border border-dashed px-6 py-14 text-center text-sm">
                            아직 포인트 적립/사용 내역이 없어요.
                            <br />
                            서비스를 이용하면 내역이 표시됩니다.
                        </div>
                    ) : (
                        <ul className="divide-border mt-4 divide-y">
                            {entries.map((e) => (
                                <li
                                    key={e.id}
                                    className="flex items-center justify-between gap-4 py-3.5"
                                >
                                    <div className="min-w-0">
                                        <p className="text-foreground font-semibold">
                                            {e.label}
                                        </p>
                                        <p className="text-muted-foreground mt-0.5 text-xs">
                                            {e.dateLabel}
                                            {e.expiresLabel
                                                ? ` · ${e.expiresLabel}`
                                                : ""}
                                        </p>
                                    </div>
                                    <span
                                        className={cn(
                                            "shrink-0 font-extrabold",
                                            e.amount > 0
                                                ? "text-amber-500"
                                                : "text-muted-foreground",
                                        )}
                                    >
                                        {e.amount > 0 ? "+" : ""}
                                        {e.amount.toLocaleString()} P
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* 우측: 안내 */}
                <div className="space-y-5">
                    <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
                        <h2 className="text-foreground flex items-center gap-2 text-lg font-bold">
                            <PCoin className="size-5 text-xs" />
                            포인트 안내
                        </h2>

                        <div className="mt-5 space-y-5">
                            <div>
                                <p className="text-foreground flex items-center gap-2 font-bold">
                                    <UserRound className="text-muted-foreground size-4" />
                                    적립방법
                                </p>
                                {/* 지급기준 공개 — 약관 제19조 ④ "별도로 정하여 안내한다" (#249) */}
                                <ul className="text-description-foreground mt-2 space-y-1 pl-6 text-sm break-keep">
                                    <li>
                                        서비스 이용이 끝나고 최종 정산이
                                        완료되면 실제 결제 금액의 1%를 적립해요.
                                    </li>
                                    <li>
                                        포인트로 결제한 금액과 할인 금액은 적립
                                        기준에서 빠져요. 1P 미만은 버려요.
                                    </li>
                                    <li>
                                        예약 취소, 노쇼, 서비스 제공 불가 건은
                                        적립되지 않아요.
                                    </li>
                                </ul>
                            </div>
                            <div>
                                <p className="text-foreground flex items-center gap-2 font-bold">
                                    <CreditCard className="text-muted-foreground size-4" />
                                    사용방법
                                </p>
                                <ul className="text-description-foreground mt-2 space-y-1 pl-6 text-sm">
                                    <li>예약 결제 시 포인트 사용 가능</li>
                                    <li>1P = 1원으로 사용 가능</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
