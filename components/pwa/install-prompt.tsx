"use client";

/**
 * 모바일 PWA 설치 유도 모달 (#117).
 *
 *  **UX 를 방해하지 않는 것이 이 모달의 절반이다.** 그래서 띄우는 조건이
 *  보여 주는 내용보다 길다.
 *
 *  ## 언제 — 로그인·회원가입 화면에서만
 *
 *  로그인하려는 사람은 재방문 의사가 있는 사람이다. middleware 가 로그인
 *  상태의 /login·/signup 접근을 홈으로 돌려보내므로 **여기 도달하는 건
 *  비로그인 사용자뿐**이고, /login 은 이용자·파트너를 한 화면에서 받는다.
 *
 *  `ALLOWED_PATHS` 는 허용 목록이다. 결제 화면(/pay/*, 예약 결제 단계)과
 *  관리자 로그인은 목록에 없으므로 이 컴포넌트를 어디에 잘못 두어도 뜨지
 *  않는다 — 돈이 흐르는 화면의 모달은 이탈로 직결된다.
 *
 *  ## 띄우지 않는 경우
 *
 *  - 쿠키 동의 배너가 떠 있는 동안 — 배너(z-60)가 모달 딤 위에 겹친다.
 *    배너를 처리하면 그때 뜬다
 *  - 재노출 정책이 막을 때 (lib/pwa/prompt-policy.ts)
 *  - 저장소를 못 쓸 때 — 닫아도 기록이 안 남아 매번 뜬다
 *  - 데스크톱 · 이미 설치된 앱
 *  - Android 에서 `beforeinstallprompt` 를 아직 못 잡았을 때 — 이벤트 없이
 *    띄우면 "설치하기" 가 아무 일도 하지 않는다
 *
 *  ## 계측
 *
 *  `gaEvent()` 는 쿠키 동의 게이트를 탄다. **동의하지 않은 사용자는 집계되지
 *  않는다** — 수치를 읽을 때 감안한다.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Check, Copy, Ellipsis, Share, SquarePlus, X } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { useConsent } from "@/hooks/use-consent";
import { gaEvent } from "@/lib/analytics";
import {
    clearInstallEvent,
    getInstallEvent,
    getServerInstallEvent,
    subscribeInstallEvent,
    type BeforeInstallPromptEvent,
} from "@/lib/pwa/install-event";
import {
    chromeIntentUrl,
    kakaoExternalUrl,
    platformLabel,
    type Platform,
} from "@/lib/pwa/platform";
import {
    getPromptEnv,
    getServerPromptEnv,
    recordDismiss,
    recordInstall,
    subscribePromptEnv,
} from "./install-prompt-store";

/**
 * 동의 배너가 닫힌 뒤 설치 모달까지 쉬는 시간.
 *  창 두 개가 연달아 튀어나오면 피로하다. 한 박자 쉬어 전환을 부드럽게 한다.
 *  배너가 없던 방문(이미 동의를 처리한 사용자)은 기다리지 않는다.
 */
const BANNER_GAP_MS = 1500;

/** 이 경로에서만 띄운다 — 허용 목록 */
const ALLOWED_PATHS = ["/login", "/signup"];

/** iOS 는 설치 앱과 Safari 의 저장소가 분리된다(#116). 로그인 화면에서
 *  권하는 것이라 설치 → 앱 열기 → **또 로그인** 을 만난다. 미리 말한다. */
const RELOGIN_NOTE = "설치한 앱에서는 한 번 더 로그인해 주세요.";

function canOffer(p: Platform, deferred: BeforeInstallPromptEvent | null) {
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

export function InstallPrompt() {
    const pathname = usePathname();
    const { bannerOpen } = useConsent();
    const env = useSyncExternalStore(
        subscribePromptEnv,
        getPromptEnv,
        getServerPromptEnv,
    );
    const deferred = useSyncExternalStore(
        subscribeInstallEvent,
        getInstallEvent,
        getServerInstallEvent,
    );

    // 배너가 먼저 떴던 방문이면, 배너가 닫히고 BANNER_GAP_MS 뒤에 연다
    const [gapPassed, setGapPassed] = useState(false);
    const consentPending = env?.consentPending ?? false;
    useEffect(() => {
        if (!consentPending || bannerOpen) return;
        const t = setTimeout(() => setGapPassed(true), BANNER_GAP_MS);
        return () => clearTimeout(t);
    }, [consentPending, bannerOpen]);
    const waited = !consentPending || gapPassed;

    const allowed = ALLOWED_PATHS.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    const open =
        env !== null &&
        allowed &&
        !bannerOpen &&
        waited &&
        env.eligible &&
        canOffer(env.platform, deferred);

    const label = env ? platformLabel(env.platform) : "";

    // 계측 — 열린 순간 한 번
    const shownRef = useRef(false);
    useEffect(() => {
        if (!open || shownRef.current) return;
        shownRef.current = true;
        gaEvent("pwa_prompt_shown", { platform: label });
    }, [open, label]);

    // 모든 닫기 경로(X · ESC · 배경 · "나중에")가 여기로 온다
    const dismiss = () => {
        const count = recordDismiss();
        gaEvent("pwa_prompt_dismissed", { platform: label, count });
    };

    if (!env) return null;

    return (
        // max-h-full — 크게보기(CSS zoom)는 dvh 와 배율이 어긋날 수 있어 부모
        // (오버레이) 기준으로 잡는다. 작은 폰 + 1.2배에서 넘치면 안에서 스크롤.
        <Modal
            open={open}
            onClose={dismiss}
            className="animate-in fade-in-0 zoom-in-95 max-h-full max-w-sm overflow-y-auto p-6 duration-300"
        >
            <button
                type="button"
                onClick={dismiss}
                aria-label="닫기"
                className="text-muted-foreground hover:bg-muted absolute top-3 right-3 rounded-full p-2 transition-colors"
            >
                <X className="size-5" />
            </button>

            <Body
                platform={env.platform}
                deferred={deferred}
                label={label}
                onDismiss={dismiss}
            />
        </Modal>
    );
}

function Body({
    platform,
    deferred,
    label,
    onDismiss,
}: {
    platform: Platform;
    deferred: BeforeInstallPromptEvent | null;
    label: string;
    onDismiss: () => void;
}) {
    switch (platform.kind) {
        case "android":
            return (
                <AndroidInstall
                    deferred={deferred}
                    label={label}
                    onDismiss={onDismiss}
                />
            );
        case "ios":
            return (
                <IosGuide browser={platform.browser} onDismiss={onDismiss} />
            );
        case "inapp-android":
            return (
                <OpenExternal
                    browser="Chrome"
                    href={() => chromeIntentUrl(window.location.href)}
                    label={label}
                    onDismiss={onDismiss}
                />
            );
        case "inapp-kakao-ios":
            return (
                <OpenExternal
                    browser="Safari"
                    href={() => kakaoExternalUrl(window.location.href)}
                    label={label}
                    onDismiss={onDismiss}
                />
            );
        case "inapp-ios":
            return <InAppGuide onDismiss={onDismiss} />;
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
    label,
    onDismiss,
}: {
    deferred: BeforeInstallPromptEvent | null;
    label: string;
    onDismiss: () => void;
}) {
    const install = async () => {
        if (!deferred) return;
        // prompt() 는 한 번만 쓸 수 있다. 부르는 순간 비운다 — 모달도 함께
        // 닫히고(canOffer 가 false 가 된다) 네이티브 설치창만 남는다.
        clearInstallEvent();
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === "accepted") {
            gaEvent("pwa_prompt_accepted", { platform: label });
            // appinstalled 도 오지만 늦을 수 있다. 여기서 먼저 막아 둔다.
            recordInstall();
        } else {
            // 네이티브 설치창의 "취소" 도 닫기 경로다
            const count = recordDismiss();
            gaEvent("pwa_prompt_dismissed", {
                platform: label,
                count,
                via: "native",
            });
        }
    };

    return (
        <>
            <Header title="홈 화면에 함께가요 추가">
                다음부터 홈 화면 아이콘으로 바로 열 수 있어요.
            </Header>
            <p className="text-muted-foreground bg-muted mt-4 rounded-lg px-3 py-2 text-center text-sm break-keep">
                {RELOGIN_NOTE}
            </p>
            <div className="mt-5">
                <PrimaryButton onClick={install}>설치하기</PrimaryButton>
                <LaterButton onClick={onDismiss} />
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
    label,
    onDismiss,
}: {
    browser: "Chrome" | "Safari";
    href: () => string;
    label: string;
    onDismiss: () => void;
}) {
    const open = () => {
        gaEvent("pwa_prompt_accepted", { platform: label, via: "external" });
        // 인앱 쪽 기록은 닫기로 남긴다. 외부 브라우저는 저장소가 따로라 거기서는
        // 처음부터 다시 판정하고, 여기(인앱)로 돌아왔을 때는 또 묻지 않는다.
        recordDismiss();
        window.location.href = href();
    };

    return (
        <>
            <Header title={`${browser}에서 열어 주세요`}>
                지금 화면은 앱 안의 브라우저라 홈 화면에 추가할 수 없어요.
            </Header>
            <div className="mt-5">
                <PrimaryButton onClick={open}>{browser}로 열기</PrimaryButton>
                <LaterButton onClick={onDismiss} />
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
