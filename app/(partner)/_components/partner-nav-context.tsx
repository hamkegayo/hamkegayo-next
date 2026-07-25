"use client";

import { createContext, useContext, useState } from "react";

type PartnerNavValue = {
    /** 모바일 드로워 열림 상태 */
    open: boolean;
    setOpen: (value: boolean) => void;
};

const PartnerNavContext = createContext<PartnerNavValue | null>(null);

/** 헤더(햄버거)와 사이드바(드로워)가 열림 상태를 공유하기 위한 컨텍스트 */
export function PartnerNavProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <PartnerNavContext.Provider value={{ open, setOpen }}>
            {children}
        </PartnerNavContext.Provider>
    );
}

export function usePartnerNav(): PartnerNavValue {
    const ctx = useContext(PartnerNavContext);
    if (!ctx) {
        throw new Error(
            "usePartnerNav 는 PartnerNavProvider 안에서만 사용할 수 있습니다.",
        );
    }
    return ctx;
}
