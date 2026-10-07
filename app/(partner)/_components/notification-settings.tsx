"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { setEmailNewRequest } from "../partner/_actions/notification-prefs";

/**
 * 알림 설정 (#255-4). 새 요청은 활동 지역·가능 시간이 맞을 때 인앱 알림이 가고,
 * 이메일은 켜고 끌 수 있다(기본 켜짐). 지역·시간은 활동 정보에서 고친다.
 */
export function NotificationSettings({
    initialEmail,
}: {
    initialEmail: boolean;
}) {
    const [email, setEmail] = useState(initialEmail);
    const [pending, startTransition] = useTransition();

    const onToggle = (next: boolean) => {
        const prev = email;
        setEmail(next);
        startTransition(async () => {
            const res = await setEmailNewRequest(next);
            if (res.ok)
                toast.success(
                    next
                        ? "새 요청 이메일 알림을 켰어요."
                        : "새 요청 이메일 알림을 껐어요.",
                );
            else {
                setEmail(prev);
                toast.error(res.message);
            }
        });
    };

    return (
        <section
            id="settings"
            className="border-border bg-background mb-6 scroll-mt-24 rounded-2xl border p-6 md:p-7"
        >
            <h2 className="text-foreground text-lg font-bold">알림 설정</h2>
            <p className="text-muted-foreground mt-1 text-sm break-keep">
                활동 지역과 가능 시간에 맞는 새 요청이 오면 이 화면으로
                알려드려요. 지역·시간이 비어 있으면 새 요청 알림이 가지 않아요.{" "}
                <Link
                    href="/partner/profile"
                    className="text-brand font-semibold underline"
                >
                    활동 정보 수정
                </Link>
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5">
                <Checkbox
                    className="mt-0.5"
                    checked={email}
                    disabled={pending}
                    onCheckedChange={(c) => onToggle(c === true)}
                />
                <span className="text-sm leading-relaxed">
                    <span className="text-foreground font-semibold">
                        새 요청을 이메일로도 받기
                    </span>
                    <span className="text-muted-foreground block">
                        가입한 이메일로 새 요청이 왔다는 사실과 목록 링크만
                        보내요. 일시·병원 등 요청 내용과 이용자
                        이름·연락처·주소· 진료정보는 메일에 담지 않아요.
                    </span>
                </span>
            </label>
        </section>
    );
}
