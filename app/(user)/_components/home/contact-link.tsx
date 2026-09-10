"use client";

import { trackContact } from "@/lib/analytics";

/**
 * 문의 창구로 연결하는 링크.
 *
 *  전에는 ComingSoonButton 이 자리를 지키고 있었다. 클릭하면 "준비 중입니다"
 *  토스트만 뜨는데 **GA4 contact · Pixel Contact 이벤트는 그대로 전송**하고
 *  있었다. 실제로 닿는 곳이 없는 클릭이 문의 전환으로 집계된 것이다.
 *
 *  창구는 이미 있었다 — COMPANY.tel 은 이용약관 부칙이 "고객센터" 로,
 *  COMPANY.email 은 처리방침 제14조가 공개하는 번호와 주소다. 연결만
 *  안 돼 있었다.
 *
 *  ⚠️ 이벤트 전송은 그대로 둔다. 지금까지의 집계와 끊기면 전후 비교가
 *     불가능해지고, 이제는 실제로 닿는 클릭이라 집계가 맞다.
 */
export function ContactLink({
    href,
    method,
    className,
    children,
}: {
    /** tel: · mailto: 등 실제 창구 주소 */
    href: string;
    method?: "phone" | "support";
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <a
            href={href}
            onClick={() => trackContact(method)}
            className={className}
        >
            {children}
        </a>
    );
}
