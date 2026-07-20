"use client";

import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown, LogOut, UserRound } from "lucide-react";

import { logout } from "@/app/(user)/_actions/auth";

type Props = {
    /** 표시 이름 */
    name: string;
    /** 이름 아래 보조 텍스트 (이메일 또는 아이디) */
    subText: string;
};

export function MemberMenu({ name, subText }: Props) {
    const router = useRouter();

    const onLogout = async () => {
        await logout();
        router.push("/login");
        router.refresh();
    };

    return (
        <Menu.Root>
            <Menu.Trigger className="border-border bg-background text-foreground hover:bg-muted data-[popup-open]:bg-muted inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors">
                <UserRound className="text-brand size-4" />
                회원메뉴
                <ChevronDown className="text-muted-foreground size-4" />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner sideOffset={8} align="end" className="z-50">
                    <Menu.Popup className="border-border bg-popover text-popover-foreground w-56 origin-[var(--transform-origin)] rounded-xl border p-1.5 shadow-lg transition-[transform,opacity] outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
                        {/* 계정 정보 */}
                        <div className="px-2.5 py-2">
                            <p className="text-foreground font-bold">
                                {name} 님
                            </p>
                            <p className="text-muted-foreground truncate text-sm">
                                {subText}
                            </p>
                        </div>
                        <Menu.Separator className="bg-border my-1 h-px" />
                        {/* 마이페이지 */}
                        <Menu.Item
                            onClick={() => router.push("/mypage")}
                            className="text-foreground data-[highlighted]:bg-muted flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none"
                        >
                            <UserRound className="size-4" />
                            마이페이지
                        </Menu.Item>
                        {/* 로그아웃 */}
                        <Menu.Item
                            onClick={onLogout}
                            className="text-destructive data-[highlighted]:bg-destructive/10 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium outline-none select-none"
                        >
                            <LogOut className="size-4" />
                            로그아웃
                        </Menu.Item>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
