"use client";

import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";

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

  const notReady = () => toast.info("준비 중인 기능입니다.");

  return (
    <Menu.Root>
      <Menu.Trigger className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted data-[popup-open]:bg-muted">
        <UserRound className="size-4 text-brand" />
        회원메뉴
        <ChevronDown className="size-4 text-muted-foreground" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50">
          <Menu.Popup className="w-56 origin-[var(--transform-origin)] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none transition-[transform,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {/* 계정 정보 */}
            <div className="px-2.5 py-2">
              <p className="font-bold text-foreground">{name} 님</p>
              <p className="truncate text-sm text-muted-foreground">{subText}</p>
            </div>
            <Menu.Separator className="my-1 h-px bg-border" />
            {/* 마이페이지 (라우트 추후) */}
            <Menu.Item
              onClick={notReady}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none select-none data-[highlighted]:bg-muted"
            >
              <UserRound className="size-4" />
              마이페이지
            </Menu.Item>
            {/* 로그아웃 */}
            <Menu.Item
              onClick={onLogout}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-destructive outline-none select-none data-[highlighted]:bg-destructive/10"
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
