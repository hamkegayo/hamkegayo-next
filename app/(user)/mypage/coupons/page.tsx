import Link from "next/link";
import { Ticket } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { createClient } from "@/utils/supabase/server";
import { ensureOpeningEventEmail } from "@/lib/opening-event-email.server";
import { OPENING_EVENT_TERMS } from "@/lib/opening-event";
import {
    OPENING_COUPON_MESSAGES,
    type OpeningCoupon,
} from "@/lib/opening-coupon";
import { getSessionProfile } from "../_lib/profile";

export default async function CouponWalletPage() {
    const { user } = await getSessionProfile();
    // 기존 인증 이메일 HMAC만 사용한다. 쿠폰함 조회는 선착순 자리를 확보하지 않는다.
    await ensureOpeningEventEmail(user);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("opening_event_coupon");
    const coupon = data as OpeningCoupon | null;
    return (
        <div>
            <AutoRefresh />
            <h1 className="text-foreground text-2xl font-extrabold">쿠폰함</h1>
            {error || !coupon ? (
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
                    <p className="text-foreground mt-4 text-3xl font-extrabold">
                        {coupon.discount.toLocaleString()}원
                    </p>
                    <p
                        role="status"
                        className="text-muted-foreground mt-3 text-sm leading-relaxed"
                    >
                        {OPENING_COUPON_MESSAGES[coupon.state]}
                    </p>
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
