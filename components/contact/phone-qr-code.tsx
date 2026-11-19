"use client";

import { useMemo } from "react";
import QRCode from "qrcode";

import { cn } from "@/lib/utils";
import { COMPANY } from "@/lib/legal/company";

/** 스캐너가 경계를 찾도록 두는 여백(모듈 수). QR 규격 권장값은 4 */
const QUIET_ZONE = 4;

/** QR 모듈 행렬 → 단일 SVG path. 순수 함수라 테스트에서 바로 검사한다 */
export function qrPathData(text: string): { size: number; d: string } {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
    const n = modules.size;
    let d = "";
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (modules.get(x, y)) {
                d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
            }
        }
    }
    return { size: n + QUIET_ZONE * 2, d };
}

/**
 * 고객센터 전화 QR 코드 (#304).
 *
 *  휴대폰 카메라로 스캔하면 `tel:` 로 바로 전화가 연결된다. 브라우저 안에서
 *  행렬을 계산해 SVG 로 그린다 — 외부 QR 이미지 API 를 부르지 않으므로
 *  번호가 제3자에게 전송되지 않고 오프라인에서도 보인다.
 */
export function PhoneQrCode({ className }: { className?: string }) {
    const { size, d } = useMemo(() => qrPathData(`tel:${COMPANY.tel}`), []);
    return (
        <svg
            role="img"
            aria-label={`고객센터 전화번호 ${COMPANY.tel} QR 코드`}
            viewBox={`0 0 ${size} ${size}`}
            data-testid="phone-qr-code"
            className={cn("block bg-white", className)}
        >
            {/* 다크 모드에서도 스캔되도록 배경을 흰색으로 고정한다 */}
            <rect width={size} height={size} fill="#ffffff" />
            <path d={d} fill="#000000" shapeRendering="crispEdges" />
        </svg>
    );
}
