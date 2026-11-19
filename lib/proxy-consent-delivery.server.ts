/**
 * 본인 동의 링크 전달 어댑터 (#306, 처리방침 제10조 ②).
 *
 * 문자·알림톡 상용 발송 계약이 아직 없어 기본 구현은 MANUAL_LINK 다 — 링크를 보호자 화면에 보여 주고
 * 보호자가 이용자에게 직접 전달한다. 발송 수단이 계약되면 `ConsentDelivery` 구현체를 추가하고
 * `PROXY_CONSENT_DELIVERY_PROVIDER` 로 켠다 (호출부는 바꾸지 않는다).
 *
 * 링크(토큰 원문)와 연락처 전체는 로그·DB 어디에도 남기지 않는다. 남기는 것은 전달 수단 이름뿐이다.
 */
export type ConsentDeliveryChannel = "MANUAL_LINK" | "SMS" | "ALIMTALK";

export type ConsentDeliveryRequest = {
    reservationId: string;
    /** 이용자 연락처. 어댑터 안에서만 쓰고 기록하지 않는다 */
    patientPhone: string;
    link: string;
    expiresAt: string;
};

export type ConsentDeliveryResult = {
    channel: ConsentDeliveryChannel;
    /** 시스템이 이용자에게 직접 보냈는지. false 면 보호자가 링크를 전달해야 한다 */
    delivered: boolean;
};

export interface ConsentDelivery {
    readonly channel: ConsentDeliveryChannel;
    send(req: ConsentDeliveryRequest): Promise<ConsentDeliveryResult>;
}

/** 발송 수단이 없을 때의 안전한 기본값 — 아무것도 보내지 않고 보호자 전달로 안내한다. */
export const manualLinkDelivery: ConsentDelivery = {
    channel: "MANUAL_LINK",
    async send() {
        return { channel: "MANUAL_LINK", delivered: false };
    },
};

const providers: Partial<Record<string, ConsentDelivery>> = {
    // 상용 문자·알림톡 계약 후 여기에 등록한다. 예: sms: smsConsentDelivery
};

export function getConsentDelivery(
    provider = process.env.PROXY_CONSENT_DELIVERY_PROVIDER,
): ConsentDelivery {
    const key = provider?.trim().toLowerCase();
    return (key && providers[key]) || manualLinkDelivery;
}

/**
 * 링크를 전달한다. 발송 실패는 보호자 수동 전달로 되돌린다 (링크는 화면에 항상 있다).
 */
export async function deliverConsentLink(
    req: ConsentDeliveryRequest,
    delivery: ConsentDelivery = getConsentDelivery(),
): Promise<ConsentDeliveryResult> {
    try {
        const result = await delivery.send(req);
        console.info("[proxy-consent] delivery", {
            reservationId: req.reservationId,
            channel: result.channel,
            delivered: result.delivered,
        });
        return result;
    } catch (e) {
        console.error("[proxy-consent] delivery failed", {
            reservationId: req.reservationId,
            channel: delivery.channel,
            error: e instanceof Error ? e.message : "unknown",
        });
        return { channel: "MANUAL_LINK", delivered: false };
    }
}
