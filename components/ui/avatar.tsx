"use client";

import * as React from "react";
import { UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 원형 아바타. 사진이 없거나 로딩에 실패하면 기본 아이콘으로 폴백한다.
 *
 * next/image 대신 <img> 를 쓰는 이유: 프로필 사진은 만료 시간이 붙은 signed URL 이라
 * 매번 URL 이 달라져 이미지 최적화 캐시가 사실상 무효하고,
 * remotePatterns 에 Supabase 스토리지 호스트를 열어줄 필요도 없어진다.
 */
export function Avatar({
    src,
    alt,
    className,
    iconClassName,
    fallbackClassName,
}: {
    src?: string | null;
    alt: string;
    /** 바깥 원의 크기/배경 (예: "size-14 bg-muted") */
    className?: string;
    /** 폴백 아이콘 크기/색 */
    iconClassName?: string;
    /** 폴백일 때만 덧붙일 클래스 */
    fallbackClassName?: string;
}) {
    // 실패 여부를 boolean 이 아니라 "실패한 src" 로 들고 있으면
    // 사진을 교체하거나 URL 이 재발급될 때 별도 초기화 없이 다시 시도된다.
    const [failedSrc, setFailedSrc] = React.useState<string | null>(null);

    const showImage = Boolean(src) && failedSrc !== src;

    return (
        <span
            className={cn(
                "flex shrink-0 items-center justify-center overflow-hidden rounded-full",
                className,
                !showImage && fallbackClassName,
            )}
        >
            {showImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src as string}
                    alt={alt}
                    onError={() => setFailedSrc(src as string)}
                    className="size-full object-cover"
                />
            ) : (
                <UserRound className={cn("size-1/2", iconClassName)} />
            )}
        </span>
    );
}
