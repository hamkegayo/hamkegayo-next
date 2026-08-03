"use client";

import { toast } from "sonner";

import { trackContact } from "@/lib/analytics";

/**
 * 아직 준비되지 않은 기능용 버튼 — 클릭 시 "준비 중입니다." 안내.
 * `contact` 가 지정되면 클릭 시 문의 이벤트(GA4 contact / Pixel Contact)를 함께 전송한다.
 * (직렬화 가능한 문자열 prop 이라 서버 컴포넌트에서도 전달 가능)
 */
export function ComingSoonButton({
    className,
    children,
    contact,
}: {
    className?: string;
    children: React.ReactNode;
    contact?: "phone" | "support";
}) {
    return (
        <button
            type="button"
            onClick={() => {
                if (contact) trackContact(contact);
                toast.info("준비 중입니다.");
            }}
            className={className}
        >
            {children}
        </button>
    );
}
