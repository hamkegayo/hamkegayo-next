"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";

import { COMPANY } from "@/lib/legal/company";
import { isTouchPrimaryDevice } from "@/lib/phone-contact";
import { openPhoneContactModal } from "./phone-contact-store";

/** 새 탭·다운로드 등 브라우저 고유 동작이라 가로채지 않는다 */
function isModifiedClick(e: MouseEvent<HTMLAnchorElement>): boolean {
    return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

/**
 * 고객센터 전화 링크 (#304).
 *
 *  마크업은 평범한 `<a href="tel:...">` 그대로다 — 모달·번호 텍스트를 함께
 *  그리지 않는다(모달은 root layout 의 PhoneContactModalHost 가 하나만 그린다).
 *
 *  - 터치가 주 입력인 기기: 기본 `tel:` 동작(전화 앱)
 *  - 그 밖(PC): 기본 동작을 막고 번호·QR·카카오톡 안내 모달을 연다
 *
 *  `onClick` 은 어느 쪽이든 먼저 한 번 부른다 — ContactLink 의 문의 전환
 *  집계(trackContact)가 PC·모바일 모두 같은 기준으로 유지된다.
 */
export function PhoneContactLink({
    href = `tel:${COMPANY.tel}`,
    onClick,
    children,
    ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
    function handleClick(e: MouseEvent<HTMLAnchorElement>) {
        onClick?.(e);
        if (e.defaultPrevented || isModifiedClick(e)) return;
        if (isTouchPrimaryDevice()) return;
        e.preventDefault();
        openPhoneContactModal();
    }

    return (
        <a href={href} onClick={handleClick} {...rest}>
            {children}
        </a>
    );
}
