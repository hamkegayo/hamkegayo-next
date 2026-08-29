"use client";

import Script from "next/script";
import { GoogleAnalytics } from "@next/third-parties/google";

import { useConsent } from "@/hooks/use-consent";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

// 운영 서비스 도메인에서만 로드한다.
//  - Vercel 은 프리뷰 배포에서도 NODE_ENV=production 이므로 NODE_ENV 로는 프리뷰가
//    걸러지지 않고, 프로덕션 배포도 *.vercel.app 도메인으로 접근할 수 있다.
//    두 경우 모두 운영 데이터셋을 오염시키므로 호스트를 기준으로 판단한다.
//  - 로컬/프리뷰에서 GA DebugView·Meta Pixel Helper 로 검증할 때만
//    .env.local 에 NEXT_PUBLIC_ANALYTICS_DEBUG=true 를 설정한다(확인 후 되돌릴 것).
const DEBUG = process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "true";
const PRODUCTION_HOSTS = ["hamkegayo.kr", "www.hamkegayo.kr"];

function isProductionHost(): boolean {
    if (typeof window === "undefined") return false;
    return PRODUCTION_HOSTS.includes(window.location.hostname);
}

/**
 * GA4 + Meta Pixel 스크립트 로더.
 * 운영 도메인(또는 디버그) + 동의(granted) + ID 존재 시에만 스크립트를 삽입한다.
 * 동의 전/거부 시에는 아무 스크립트도 로드하지 않는다.
 */
export function AnalyticsScripts() {
    const { granted } = useConsent();

    const enabled = DEBUG || isProductionHost();
    if (!enabled || !granted) return null;

    return (
        <>
            {GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null}

            {PIXEL_ID ? (
                <Script id="meta-pixel" strategy="afterInteractive">
                    {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
                </Script>
            ) : null}
        </>
    );
}
