"use client";

/**
 * 설치 안내 시트 (#117 · #139) — 플랫폼별 본문과 모달 껍데기.
 *
 *  두 곳에서 연다.
 *
 *  | 호출부                    | 여는 때                 | 닫기 횟수 |
 *  | ------------------------- | ----------------------- | --------- |
 *  | install-prompt.tsx (자동) | /login·/signup 진입     | 센다      |
 *  | install-entry.tsx (메뉴)  | 사용자가 "앱 설치" 누름 | 안 센다   |
 *
 *  본문은 같고 **닫기·수락이 무엇을 기록하는지만** 다르다. 그래서 그 둘을
 *  `handlers` 로 받는다. 설치 사실(recordInstall)만은 어디서 열었든 같다.
 */

import { useState } from "react";
import Image from "next/image";
import {
    Check,
    Copy,
    Ellipsis,
    EllipsisVertical,
    Share,
    SquarePlus,
    X,
} from "lucide-react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import {
    clearInstallEvent,
    pwaLog,
    type BeforeInstallPromptEvent,
} from "@/lib/pwa/install-event";
import {
    chromeIntentUrl,
    kakaoExternalUrl,
    type Platform,
} from "@/lib/pwa/platform";
import { recordInstall } from "./install-prompt-store";

/** 시트 안의 동작을 호출부가 정한다 */
export type InstallHandlers = {
    /** 닫았다 — X · ESC · 배경 · "나중에" · 네이티브 설치창 취소("native") */
    dismiss: (via?: "native") => void;
    /** 받아들였다 — 네이티브 설치 수락 · 외부 브라우저로 이동 */
    accept: (via: "native" | "external") => void;
    /** 네이티브 설치창을 열지 못했다 — Chrome 메뉴 안내로 넘긴다 */
    fail: () => void;
};

/** 어떤 본문을 보여 줄지 — 보통은 플랫폼대로, 설치창 실패 시 메뉴 안내 */
export type SheetVariant = "platform" | "android-menu";

/**
 * iOS 는 설치 앱과 Safari 의 저장소가 분리된다(#116). 로그인 화면에서
 * 권하는 것이라 설치 → 앱 열기 → **또 로그인** 을 만난다. 미리 말한다.
 *
 *  ⚠️ **iOS 에만** 쓴다. Android 에서 Chrome 으로 설치한 앱은 Chrome 과
 *     저장소를 공유해 로그인이 유지된다 — 거기에 이 문구를 쓰면 사실과 다르다.
 */
const RELOGIN_NOTE = "설치한 앱에서는 한 번 더 로그인해 주세요.";

/**
 * 이 환경에서 설치를 권할 수 있는가.
 *  Android 는 `beforeinstallprompt` 를 잡았을 때만 — 없으면 "설치하기" 가
 *  아무 일도 하지 않는다.
 */
export function canOffer(
    p: Platform,
    deferred: BeforeInstallPromptEvent | null,
): boolean {
    switch (p.kind) {
        case "standalone":
        case "desktop":
            return false;
        case "android":
            return deferred !== null;
        default:
            return true;
    }
}

/**
 * 네이티브 설치창을 띄우고 결과를 handlers 로 넘긴다.
 *
 *  `prompt()` 는 한 번만 쓸 수 있다. 부르는 순간 비운다 — 그러면 자동
 *  모달도 닫히고(canOffer 가 false) 네이티브 설치창만 남는다.
 *
 *  ⚠️ `prompt()` 가 실패하면 **반드시 잡는다.** 모달은 이미 닫혔으므로
 *     잡지 않으면 사용자에게는 "눌렀는데 아무 일도 없음" 이 된다. 실제로
 *     스테이징 실기기(Android Chrome)에서 그 증상이 났다. 실패하면 Chrome
 *     메뉴로 설치하는 안내로 넘긴다.
 */
export async function runNativePrompt(
    deferred: BeforeInstallPromptEvent | null,
    handlers: InstallHandlers,
): Promise<void> {
    if (!deferred) return;
    clearInstallEvent();
    pwaLog("prompt() 호출");
    try {
        // prompt() 는 설치창이 뜰 때가 아니라 사용자가 응답할 때 끝난다.
        // "호출" 뒤에 아무 줄도 없으면 설치창이 뜨지 않고 멈춘 것이다.
        await deferred.prompt();
        pwaLog("prompt() 응답 받음");
    } catch (e) {
        const err = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        pwaLog(`prompt() 실패 — ${err}`);
        handlers.fail();
        return;
    }
    const { outcome } = await deferred.userChoice;
    pwaLog(`설치창 결과 — ${outcome}`);
    if (outcome === "accepted") {
        handlers.accept("native");
        // appinstalled 도 오지만 늦을 수 있다. 여기서 먼저 막아 둔다.
        recordInstall();
        // Chrome 은 설치를 백그라운드에서 수십 초에 걸쳐 진행하고, 기종에
        // 따라 아이콘이 홈 화면이 아니라 앱 목록에만 생긴다. 말없이 두면
        // "설치가 안 됐다" 고 느낀다.
        toast.success("설치를 시작했어요", {
            description:
                "잠시 뒤 홈 화면이나 앱 목록에서 함께가요를 찾아 주세요.",
        });
    } else {
        handlers.dismiss("native");
    }
}

export function InstallSheet({
    open,
    platform,
    deferred,
    handlers,
    variant = "platform",
}: {
    open: boolean;
    platform: Platform;
    deferred: BeforeInstallPromptEvent | null;
    handlers: InstallHandlers;
    variant?: SheetVariant;
}) {
    return (
        // max-h-full — 크게보기(CSS zoom)는 dvh 와 배율이 어긋날 수 있어 부모
        // (오버레이) 기준으로 잡는다. 작은 폰 + 1.2배에서 넘치면 안에서 스크롤.
        <Modal
            open={open}
            onClose={() => handlers.dismiss()}
            className="animate-in fade-in-0 zoom-in-95 max-h-full max-w-sm overflow-y-auto p-6 duration-300"
        >
            <button
                type="button"
                onClick={() => handlers.dismiss()}
                aria-label="닫기"
                className="text-muted-foreground hover:bg-muted absolute top-3 right-3 rounded-full p-2 transition-colors"
            >
                <X className="size-5" />
            </button>

            {variant === "android-menu" ? (
                <AndroidMenuGuide onDismiss={() => handlers.dismiss()} />
            ) : (
                <Body
                    platform={platform}
                    deferred={deferred}
                    handlers={handlers}
                />
            )}
        </Modal>
    );
}

function Body({
    platform,
    deferred,
    handlers,
}: {
    platform: Platform;
    deferred: BeforeInstallPromptEvent | null;
    handlers: InstallHandlers;
}) {
    const dismiss = () => handlers.dismiss();
    switch (platform.kind) {
        case "android":
            return <AndroidInstall deferred={deferred} handlers={handlers} />;
        case "ios":
            return <IosGuide browser={platform.browser} onDismiss={dismiss} />;
        case "inapp-android":
            return (
                <OpenExternal
                    browser="Chrome"
                    href={() => chromeIntentUrl(window.location.href)}
                    handlers={handlers}
                />
            );
        case "inapp-kakao-ios":
            return (
                <OpenExternal
                    browser="Safari"
                    href={() => kakaoExternalUrl(window.location.href)}
                    handlers={handlers}
                />
            );
        case "inapp-ios":
            return <InAppGuide onDismiss={dismiss} />;
        default:
            return null;
    }
}

/* ---------- 공통 조각 ---------- */

function Header({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center text-center">
            <Image
                src="/common/icon192.png"
                alt=""
                width={64}
                height={64}
                className="size-16"
            />
            <h3 className="text-foreground mt-3 text-xl font-extrabold break-keep">
                {title}
            </h3>
            <div className="text-muted-foreground mt-2 text-base leading-relaxed break-keep">
                {children}
            </div>
        </div>
    );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            {...props}
            className="bg-brand text-brand-foreground hover:bg-brand/90 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-bold transition-colors"
        />
    );
}

function LaterButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="text-muted-foreground hover:bg-muted mt-2 w-full rounded-xl px-4 py-3 text-base font-bold transition-colors"
        >
            나중에
        </button>
    );
}

function Step({
    n,
    icon,
    children,
}: {
    n: number;
    icon?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <li className="flex items-center gap-3">
            <span className="bg-brand/10 text-brand flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold">
                {n}
            </span>
            <span className="text-foreground flex flex-wrap items-center gap-1 text-base leading-snug">
                {children}
                {icon && (
                    <span className="border-border bg-muted inline-flex size-7 items-center justify-center rounded-md border">
                        {icon}
                    </span>
                )}
            </span>
        </li>
    );
}

/* ---------- Android — 네이티브 설치창 ---------- */

function AndroidInstall({
    deferred,
    handlers,
}: {
    deferred: BeforeInstallPromptEvent | null;
    handlers: InstallHandlers;
}) {
    const install = () => runNativePrompt(deferred, handlers);

    return (
        <>
            <Header title="홈 화면에 함께가요 추가">
                다음부터 홈 화면 아이콘으로 바로 열 수 있어요.
            </Header>
            <div className="mt-5">
                <PrimaryButton onClick={install}>설치하기</PrimaryButton>
                <LaterButton onClick={() => handlers.dismiss()} />
            </div>
        </>
    );
}

/* ---------- Android — 설치창을 못 열었을 때 Chrome 메뉴 안내 ---------- */

function AndroidMenuGuide({ onDismiss }: { onDismiss: () => void }) {
    return (
        <>
            <Header title="Chrome 메뉴에서 설치해 주세요">
                설치 창이 열리지 않았어요. 아래 순서대로 누르면 설치할 수
                있어요.
            </Header>
            <ol className="mt-5 space-y-3">
                <Step n={1} icon={<EllipsisVertical className="size-4" />}>
                    오른쪽 위 메뉴 버튼
                </Step>
                <Step n={2}>
                    &lsquo;앱 설치&rsquo; 또는 &lsquo;홈 화면에 추가&rsquo;
                </Step>
            </ol>
            <div className="mt-5">
                <PrimaryButton onClick={onDismiss}>확인했어요</PrimaryButton>
            </div>
        </>
    );
}

/* ---------- iOS — 공유 → 홈 화면에 추가 ---------- */

function IosGuide({
    browser,
    onDismiss,
}: {
    browser: "safari" | "other";
    onDismiss: () => void;
}) {
    return (
        <>
            <Header title="홈 화면에 함께가요 추가">
                아래 순서대로 누르면 앱처럼 쓸 수 있어요.
            </Header>
            <ol className="mt-5 space-y-3">
                <Step n={1} icon={<Share className="text-brand size-4" />}>
                    {browser === "safari"
                        ? "화면 아래 공유 버튼"
                        : "주소창 옆 공유 버튼"}
                </Step>
                <Step n={2} icon={<SquarePlus className="size-4" />}>
                    &lsquo;홈 화면에 추가&rsquo;
                </Step>
                <Step n={3}>오른쪽 위 &lsquo;추가&rsquo;</Step>
            </ol>
            <p className="text-muted-foreground bg-muted mt-4 rounded-lg px-3 py-2 text-center text-sm break-keep">
                {RELOGIN_NOTE}
            </p>
            <div className="mt-5">
                <PrimaryButton onClick={onDismiss}>확인했어요</PrimaryButton>
            </div>
        </>
    );
}

/* ---------- 인앱 — 외부 브라우저로 직행 (Android 전반 · 카카오톡 iOS) ---------- */

function OpenExternal({
    browser,
    href,
    handlers,
}: {
    browser: "Chrome" | "Safari";
    href: () => string;
    handlers: InstallHandlers;
}) {
    const open = () => {
        handlers.accept("external");
        window.location.href = href();
    };

    return (
        <>
            <Header title={`${browser}에서 열어 주세요`}>
                지금 화면은 앱 안의 브라우저라 홈 화면에 추가할 수 없어요.
            </Header>
            <div className="mt-5">
                <PrimaryButton onClick={open}>{browser}로 열기</PrimaryButton>
                <LaterButton onClick={() => handlers.dismiss()} />
            </div>
        </>
    );
}

/* ---------- 인앱 — 강제 이동 불가 (인스타·페북 등 iOS) ---------- */

function InAppGuide({ onDismiss }: { onDismiss: () => void }) {
    const [copied, setCopied] = useState(false);
    /** 복사에 실패했을 때 직접 복사하도록 보여 줄 주소 */
    const [manualUrl, setManualUrl] = useState<string | null>(null);

    const copy = async () => {
        const href = window.location.href;
        try {
            await navigator.clipboard.writeText(href);
            setCopied(true);
        } catch {
            // 인앱 브라우저는 클립보드를 막는 경우가 많다. 조용히 실패하면
            // 사용자는 눌렀는데 아무 일도 없다고 느낀다 — 주소를 보여 준다.
            setManualUrl(href);
        }
    };

    return (
        <>
            <Header title="Safari에서 열어 주세요">
                지금 화면은 앱 안의 브라우저라 홈 화면에 추가할 수 없어요.
            </Header>
            <ol className="mt-5 space-y-3">
                <Step n={1} icon={<Ellipsis className="size-4" />}>
                    화면 위 메뉴 버튼
                </Step>
                <Step n={2}>&lsquo;외부 브라우저에서 열기&rsquo;</Step>
            </ol>
            <p className="text-muted-foreground mt-4 text-center text-sm break-keep">
                메뉴가 없으면 주소를 복사해 Safari에 붙여 넣으세요.
            </p>
            <div className="mt-3">
                {manualUrl && (
                    <div className="mb-3">
                        <p className="text-destructive text-center text-sm break-keep">
                            복사하지 못했어요. 아래 주소를 길게 눌러 복사해
                            주세요.
                        </p>
                        <input
                            readOnly
                            value={manualUrl}
                            aria-label="이 페이지 주소"
                            autoFocus
                            onFocus={(e) => e.currentTarget.select()}
                            className="border-border bg-muted text-foreground mt-2 w-full rounded-lg border px-3 py-2.5 text-sm"
                        />
                    </div>
                )}
                <PrimaryButton onClick={copy}>
                    {copied ? (
                        <>
                            <Check className="size-5" /> 복사했어요
                        </>
                    ) : (
                        <>
                            <Copy className="size-5" /> 주소 복사
                        </>
                    )}
                </PrimaryButton>
                <LaterButton onClick={onDismiss} />
            </div>
        </>
    );
}
