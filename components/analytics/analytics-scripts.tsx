"use client";

import Script from "next/script";
import { GoogleAnalytics } from "@next/third-parties/google";

import { useConsent } from "@/hooks/use-consent";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

// 기본은 프로덕션에서만 로드. 로컬/미러링에서 GA DebugView·Meta Pixel Helper 로
// 검증하려면 .env.local 에 NEXT_PUBLIC_ANALYTICS_DEBUG=true 를 설정한다.
// (미설정 시 자동 off 라 지울 테스트 코드가 없다.)
const DEBUG = process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "true";
const ENABLED = process.env.NODE_ENV === "production" || DEBUG;

/**
 * GA4 + Meta Pixel 스크립트 로더.
 * 프로덕션(또는 디버그) + 동의(granted) + ID 존재 시에만 스크립트를 삽입한다.
 * 동의 전/거부 시에는 아무 스크립트도 로드하지 않는다.
 */
export function AnalyticsScripts() {
    const { granted } = useConsent();

    if (!ENABLED || !granted) return null;

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
