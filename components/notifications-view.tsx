"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NotificationView } from "@/lib/notifications";
import {
    markAllNotificationsRead,
    markNotificationRead,
} from "@/lib/notifications-actions";

export function NotificationsView({
    notifications,
}: {
    notifications: NotificationView[];
}) {
    const router = useRouter();
    const [, startTransition] = useTransition();

    const hasUnread = notifications.some((n) => !n.isRead);

    const onClick = (n: NotificationView) => {
        startTransition(async () => {
            if (!n.isRead) await markNotificationRead(n.id);
            if (n.link) router.push(n.link);
            else router.refresh();
        });
    };

    const onReadAll = () => {
        startTransition(async () => {
            await markAllNotificationsRead();
            router.refresh();
        });
    };

    return (
        <div>
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                    알림
                </h1>
                {hasUnread && (
                    <button
                        type="button"
                        onClick={onReadAll}
                        className="border-border bg-background text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-bold transition-colors"
                    >
                        <CheckCheck className="size-4" />
                        모두 읽음
                    </button>
                )}
            </div>

            {notifications.length === 0 ? (
                <div className="border-border bg-background mt-6 flex flex-col items-center gap-3 rounded-2xl border px-6 py-16 text-center">
                    <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                        <Bell className="size-6" />
                    </span>
                    <p className="text-foreground font-bold">
                        새로운 알림이 없어요
                    </p>
                </div>
            ) : (
                <ul className="divide-border border-border bg-background mt-6 divide-y overflow-hidden rounded-2xl border">
                    {notifications.map((n) => (
                        <li key={n.id}>
                            <button
                                type="button"
                                onClick={() => onClick(n)}
                                className={cn(
                                    "hover:bg-muted/30 flex w-full items-start gap-3 px-5 py-4 text-left transition-colors",
                                    !n.isRead && "bg-brand/5",
                                )}
                            >
                                <span
                                    className={cn(
                                        "mt-1.5 size-2 shrink-0 rounded-full",
                                        n.isRead
                                            ? "bg-transparent"
                                            : "bg-brand",
                                    )}
                                />
                                <div className="min-w-0 flex-1">
                                    <p
                                        className={cn(
                                            "text-foreground",
                                            n.isRead
                                                ? "font-semibold"
                                                : "font-bold",
                                        )}
                                    >
                                        {n.title}
                                    </p>
                                    {n.body && (
                                        <p className="text-muted-foreground mt-0.5 text-sm">
                                            {n.body}
                                        </p>
                                    )}
                                    <p className="text-muted-foreground mt-1 text-xs">
                                        {n.timeLabel}
                                    </p>
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
