import Link from "next/link";
import { Ticket } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { createClient } from "@/utils/supabase/server";
import { openingEventEmailStatus } from "@/lib/opening-event-email.server";
import { OpeningEventRegister } from "@/components/opening-event-register";
import {
    OPENING_EVENT_CHANGE_NOTICE,
    OPENING_EVENT_DEADLINE_LABEL,
    OPENING_EVENT_TERMS,
} from "@/lib/opening-event";
import {
    OPENING_COUPON_MESSAGES,
    type OpeningCoupon,
} from "@/lib/opening-coupon";
import { getSessionProfile } from "../_lib/profile";

export default async function CouponWalletPage() {
    const { user } = await getSessionProfile();
    // 렌더링(프리페치 포함)은 읽기만 한다. 미등록이면 화면에서 POST로 등록한 뒤 다시 그린다 (#283 리뷰).
    // 조회로 정원을 확보하지 않는다.
    const emailStatus = await openingEventEmailStatus(user);
    const registered = emailStatus === "registered";
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("opening_event_coupon");
    const rawCoupon = data as OpeningCoupon | null;
    const coupon =
        rawCoupon &&
        !registered &&
        ["AVAILABLE", "HELD"].includes(rawCoupon.state)
            ? { ...rawCoupon, state: "PAUSED" as const }
            : rawCoupon;
    // 종료 후에는 식별값을 새로 등록하지 않고, 파기로 미등록이 된 회원도 '확인 중'에 머물지 않는다 (#297).
    // '확인 중' 안내는 등록하면 쿠폰이 보일 수 있는 상태(HIDDEN)에서만 쓴다.
    const ended = rawCoupon?.ended ?? rawCoupon?.state === "CLOSED";
    const registering = emailStatus === "missing" && !ended;
    const checking = registering && rawCoupon?.state === "HIDDEN";
    // 혜택 안내(금액·자동 적용·기한·변경 안내)는 쿠폰을 쓸 수 있는 상태에서만 보인다 (#298 리뷰).
    // 확보·사용한 쿠폰은 실제 확보액을 보여 준다.
    const usable =
        coupon !== null &&
        ["AVAILABLE", "HELD", "WAITING"].includes(coupon.state);
    const claimedDiscount =
        coupon && (coupon.state === "HELD" || coupon.state === "USED")
            ? coupon.discount
            : null;
    return (
        <div>
            {coupon?.state === "HELD" && <AutoRefresh />}
            {registering && <OpeningEventRegister />}
            <h1 className="text-foreground text-2xl font-extrabold">쿠폰함</h1>
            {checking && !error ? (
                <p role="status" className="text-muted-foreground mt-6">
                    쿠폰을 확인하고 있습니다.
                </p>
            ) : error || !coupon ? (
                <p role="alert" className="mt-6 text-sm">
                    쿠폰을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
                </p>
            ) : coupon.state === "HIDDEN" ? (
                <p className="text-muted-foreground mt-6">
                    {OPENING_COUPON_MESSAGES.HIDDEN}
                </p>
            ) : (
                <article className="border-brand/30 mt-6 max-w-xl rounded-2xl border p-6">
                    <div className="text-brand flex items-center gap-2 font-bold">
                        <Ticket className="size-5" />
                        오픈 이벤트 쿠폰
                    </div>
                    {claimedDiscount !== null ? (
                        <p className="text-foreground mt-4 text-3xl font-extrabold">
                            {claimedDiscount.toLocaleString()}원
                        </p>
                    ) : (
                        usable && (
                            <>
                                <p className="text-foreground mt-4 text-3xl font-extrabold">
                                    첫 1시간 무료
                                </p>
                                {coupon.discounts && (
                                    <p className="text-foreground mt-2 font-bold">
                                        Basic{" "}
                                        {coupon.discounts.basic.toLocaleString()}
                                        원 · Plus{" "}
                                        {coupon.discounts.plus.toLocaleString()}
                                        원
                                    </p>
                                )}
                                <p className="text-muted-foreground mt-1 text-sm">
                                    예약한 서비스에 맞춰 자동 적용됩니다.
                                </p>
                            </>
                        )
                    )}
                    {usable && (
                        <p className="text-muted-foreground mt-1 text-sm">
                            {OPENING_EVENT_DEADLINE_LABEL}까지 결제가 확정된
                            예약에 적용
                        </p>
                    )}
                    <p
                        role="status"
                        className="text-muted-foreground mt-3 text-sm leading-relaxed"
                    >
                        {OPENING_COUPON_MESSAGES[coupon.state]}
                    </p>
                    {usable && (
                        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
                            {OPENING_EVENT_CHANGE_NOTICE}
                        </p>
                    )}
                    {coupon.state === "AVAILABLE" && (
                        <Link
                            href="/reservation"
                            className="bg-brand text-brand-foreground mt-5 inline-block rounded-lg px-5 py-3 font-bold"
                        >
                            예약하고 쿠폰 사용하기
                        </Link>
                    )}
                    {coupon.state === "HELD" && coupon.reservationId && (
                        <Link
                            href={`/mypage/reservations/${coupon.reservationId}`}
                            className="text-brand mt-5 inline-block underline"
                        >
                            결제 중인 예약 확인하기
                        </Link>
                    )}
                    <details className="mt-5 text-sm">
                        <summary className="cursor-pointer font-bold">
                            쿠폰 사용 조건
                        </summary>
                        <ul className="text-muted-foreground mt-3 space-y-3 leading-relaxed">
                            {OPENING_EVENT_TERMS.map((term) => (
                                <li key={term}>{term}</li>
                            ))}
                        </ul>
                    </details>
                    <Link
                        href="/event/opening"
                        className="text-brand mt-4 inline-block text-sm underline"
                    >
                        이벤트 조건·이메일 식별정보 처리 안내
                    </Link>
                </article>
            )}
        </div>
    );
}
