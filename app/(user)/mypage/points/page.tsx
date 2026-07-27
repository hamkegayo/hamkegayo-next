import { CreditCard, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

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

// 포인트 적립/사용 로직은 결제·완료 연동 시 도입 예정. 현재는 실제 보유 0P.
const BALANCE = 0;
const PENDING = 0;
const EXPIRING = 0;

export default function MypagePoints() {
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
                            {BALANCE.toLocaleString()}{" "}
                            <span className="text-lg">P</span>
                        </p>
                    </div>
                </div>
                <div className="flex flex-col justify-center gap-3 sm:pl-8">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                            적립예정 포인트
                        </span>
                        <span className="text-foreground font-bold">
                            {PENDING.toLocaleString()} P
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                            소멸예정 포인트
                        </span>
                        <span className="text-foreground font-bold">
                            {EXPIRING.toLocaleString()} P
                        </span>
                    </div>
                </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                {/* 포인트 내역 */}
                <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
                    <h2 className="text-foreground text-lg font-bold">
                        포인트 내역
                    </h2>
                    <div className="text-muted-foreground mt-4 rounded-xl border border-dashed px-6 py-14 text-center text-sm">
                        아직 포인트 적립/사용 내역이 없어요.
                        <br />
                        서비스를 이용하면 내역이 표시됩니다.
                    </div>
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
                                <ul className="text-muted-foreground mt-2 space-y-1 pl-6 text-sm">
                                    <li>서비스 이용 시 결제 금액의 1% 적립</li>
                                    <li>이벤트 참여 시 추가 적립</li>
                                </ul>
                            </div>
                            <div>
                                <p className="text-foreground flex items-center gap-2 font-bold">
                                    <CreditCard className="text-muted-foreground size-4" />
                                    사용방법
                                </p>
                                <ul className="text-muted-foreground mt-2 space-y-1 pl-6 text-sm">
                                    <li>예약 결제 시 포인트 사용 가능</li>
                                    <li>1P = 1원으로 사용 가능</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
                        <h2 className="text-foreground text-lg font-bold">
                            소멸 예정 포인트
                        </h2>
                        <div className="mt-6 text-center">
                            <p className="text-foreground font-bold">
                                소멸 예정 포인트가 없습니다.
                            </p>
                            <p className="text-muted-foreground mt-1 text-sm">
                                유효기간이 지나면 포인트가 자동으로 소멸됩니다.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
