import type { Metadata } from "next";

import { getConsentTokenState, type ConsentTokenState } from "./_actions";
import { ConsentForm } from "./_components/consent-form";

// 서명 토큰이 주소에 들어 있다 — 검색·미리보기·리퍼러로 새지 않게 한다.
export const metadata: Metadata = {
    title: "이용자 본인 동의",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

const STATE_MESSAGE: Record<
    Exclude<ConsentTokenState, "VALID">,
    { title: string; body: string }
> = {
    NOT_FOUND: {
        title: "확인할 수 없는 링크입니다",
        body: "주소가 올바른지 확인하거나, 예약하신 분께 새 링크를 요청해 주세요.",
    },
    EXPIRED: {
        title: "링크 유효 시간이 지났습니다",
        body: "예약하신 분께 동의 링크를 다시 보내 달라고 요청해 주세요.",
    },
    REVOKED: {
        title: "새 링크로 교체되었습니다",
        body: "예약하신 분이 새 링크를 보냈다면 가장 최근에 받은 링크를 사용해 주세요.",
    },
    LOCKED: {
        title: "본인 확인 시도 횟수를 초과했습니다",
        body: "안전을 위해 이 링크는 잠겼습니다. 예약하신 분께 새 링크를 요청해 주세요.",
    },
    USED: {
        title: "이미 동의가 완료된 예약입니다",
        body: "더 하실 일은 없습니다. 감사합니다.",
    },
    CLOSED: {
        title: "더 이상 진행할 수 없는 예약입니다",
        body: "예약이 취소되었거나 마감되었습니다.",
    },
};

export default async function ConsentPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const state = await getConsentTokenState(token);

    return (
        <main className="mx-auto min-h-dvh w-full max-w-xl px-4 py-10 md:py-16">
            <h1 className="text-foreground text-2xl font-bold">
                병원동행 이용자 본인 동의
            </h1>
            {state === "VALID" ? (
                <ConsentForm token={token} />
            ) : (
                <div
                    role="status"
                    className="bg-panel-muted mt-6 rounded-2xl p-6"
                >
                    <p className="text-foreground text-lg font-bold">
                        {STATE_MESSAGE[state].title}
                    </p>
                    <p className="text-description-foreground mt-2 text-sm leading-relaxed">
                        {STATE_MESSAGE[state].body}
                    </p>
                </div>
            )}
        </main>
    );
}
