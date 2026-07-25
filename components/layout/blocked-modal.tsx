"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Ban } from "lucide-react";

import { Modal } from "@/components/ui/modal";

/**
 * 역할이 맞지 않는 영역 접근 시 미들웨어가 붙인 ?blocked=<flag> 를 읽어
 * 안내 모달을 표시하고, 닫으면 URL의 플래그를 정리한다.
 * (열림 상태를 URL에서 직접 파생 — 닫으면 replace 로 플래그 제거)
 */
export function BlockedModal({
    flag,
    title,
    description,
}: {
    /** 미들웨어가 붙이는 blocked 값 ("user" | "partner") */
    flag: string;
    title: string;
    description: React.ReactNode;
}) {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const open = params.get("blocked") === flag;
    const close = () => router.replace(pathname);

    return (
        <Modal open={open} onClose={close} className="max-w-sm">
            <div className="flex flex-col items-center text-center">
                <span className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-full">
                    <Ban className="size-7" />
                </span>
                <h3 className="text-foreground mt-4 text-lg font-extrabold">
                    {title}
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {description}
                </p>
            </div>
            <button
                type="button"
                onClick={close}
                className="bg-brand text-brand-foreground hover:bg-brand/90 mt-6 w-full rounded-lg px-4 py-3 text-sm font-bold transition-colors"
            >
                확인
            </button>
        </Modal>
    );
}
