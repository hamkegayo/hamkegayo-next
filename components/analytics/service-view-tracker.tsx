"use client";

import { useEffect } from "react";

import { trackServiceView } from "@/lib/analytics";

/** 서비스 소개(/service) 진입 시 Pixel ViewContent 1회 전송 */
export function ServiceViewTracker() {
    useEffect(() => {
        trackServiceView();
    }, []);
    return null;
}
