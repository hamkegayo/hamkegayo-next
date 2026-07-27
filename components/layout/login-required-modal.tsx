"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";

import { Modal } from "@/components/ui/modal";

/**
 * 비로그인 상태로 로그인 필요 라우트 접근 시 미들웨어가 ?blocked=auth 를 붙여
 * 홈으로 보낸다. 이 모달이 안내 + 로그인 이동을 제공한다.
 */
export function LoginRequiredModal() {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const open = params.get("blocked") === "auth";
    const close = () => router.replace(pathname);

    return (
        <Modal open={open} onClose={close} className="max-w-sm">
            <div className="flex flex-col items-center text-center">
                <span className="bg-brand/10 text-brand flex size-14 items-center justify-center rounded-full">
                    <LogIn className="size-7" />
                </span>
                <h3 className="text-foreground mt-4 text-lg font-extrabold">
                    로그인이 필요해요
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    이 기능은 로그인 후 이용할 수 있어요.
                    <br />
                    로그인하고 계속 진행해 주세요.
                </p>
            </div>
            <div className="mt-6 flex gap-3">
                <button
                    type="button"
                    onClick={close}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    닫기
                </button>
                <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors"
                >
                    로그인하기
                </button>
            </div>
        </Modal>
    );
}
