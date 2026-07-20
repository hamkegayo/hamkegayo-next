"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import {
    BadgeCheck,
    Bell,
    ChevronDown,
    LogOut,
    UserRound,
    ZoomIn,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ui/modal";
import { useZoom } from "@/components/providers/zoom-provider";
import { logout } from "@/app/(user)/_actions/auth";

export function PartnerHeader({ name }: { name: string }) {
    const { enlarged, toggle } = useZoom();
    const router = useRouter();
    const [confirmOpen, setConfirmOpen] = useState(false);

    const onLogout = async () => {
        await logout();
        router.push("/login");
        router.refresh();
    };

    const notReady = () => toast.info("준비 중인 기능입니다.");

    return (
        <>
            <header className="border-border bg-background fixed inset-x-0 top-0 z-40 h-16 border-b">
                <div className="flex h-16 items-center justify-between gap-4 px-6">
                    {/* 로고 + 크게보기 */}
                    <div className="flex items-center gap-4">
                        <Link
                            href="/partner"
                            className="flex items-center gap-2"
                        >
                            <Image
                                src="/common/logo.svg"
                                alt="함께가요"
                                width={28}
                                height={28}
                                priority
                            />
                            <span className="text-foreground text-xl font-extrabold">
                                함께가요{" "}
                                <span className="text-brand">Partner</span>
                            </span>
                        </Link>

                        <button
                            type="button"
                            onClick={toggle}
                            aria-pressed={enlarged}
                            className={cn(
                                "border-brand inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                                enlarged
                                    ? "bg-brand text-brand-foreground hover:bg-brand/90"
                                    : "bg-background text-brand hover:bg-brand/5",
                            )}
                        >
                            <ZoomIn className="size-4" />
                            {enlarged ? "작게보기" : "크게보기"}
                        </button>
                    </div>

                    {/* 알림 + 프로필 */}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={notReady}
                            aria-label="알림"
                            className="text-foreground hover:bg-muted relative flex size-9 items-center justify-center rounded-lg transition-colors"
                        >
                            <Bell className="size-5" />
                            <span className="bg-destructive absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white">
                                3
                            </span>
                        </button>

                        <Menu.Root>
                            <Menu.Trigger className="text-foreground hover:bg-muted data-[popup-open]:bg-muted inline-flex items-center gap-2 rounded-full px-1.5 py-1 text-sm font-semibold transition-colors">
                                <span className="bg-muted size-7 rounded-full" />
                                {name}님
                                <ChevronDown className="text-muted-foreground size-4" />
                            </Menu.Trigger>
                            <Menu.Portal>
                                <Menu.Positioner
                                    sideOffset={8}
                                    align="end"
                                    className="z-50"
                                >
                                    <Menu.Popup className="border-border bg-popover text-popover-foreground w-52 origin-[var(--transform-origin)] rounded-xl border p-1.5 shadow-lg transition-[transform,opacity] outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
                                        <Menu.Item
                                            onClick={notReady}
                                            className="text-foreground data-[highlighted]:bg-muted flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none"
                                        >
                                            <UserRound className="size-4" />
                                            프로필 수정
                                        </Menu.Item>
                                        <Menu.Item
                                            onClick={notReady}
                                            className="text-foreground data-[highlighted]:bg-muted flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none"
                                        >
                                            <BadgeCheck className="size-4" />
                                            인증/교육 상태
                                        </Menu.Item>
                                        <Menu.Separator className="bg-border my-1 h-px" />
                                        <Menu.Item
                                            onClick={() => setConfirmOpen(true)}
                                            className="text-destructive data-[highlighted]:bg-destructive/10 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium outline-none select-none"
                                        >
                                            <LogOut className="size-4" />
                                            로그아웃
                                        </Menu.Item>
                                    </Menu.Popup>
                                </Menu.Positioner>
                            </Menu.Portal>
                        </Menu.Root>
                    </div>
                </div>
            </header>

            <ConfirmModal
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={onLogout}
                title="로그아웃"
                description="로그아웃 하시겠어요?"
                cancelLabel="취소"
                confirmLabel="로그아웃"
            />
        </>
    );
}
