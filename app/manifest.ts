import type { MetadataRoute } from "next";

/**
 * PWA 매니페스트 (#116) — `/manifest.webmanifest` 로 서빙된다.
 *
 *  ## 단일 앱이다 — 사용자·파트너 공용
 *
 *  manifest 는 origin 당 하나가 원칙이다. start_url·scope 를 갈라 두 앱으로
 *  설치시키는 것은 브라우저마다 달라 보장되지 않는다(안드로이드에서 둘로 뜨던
 *  것이 iOS 에서 하나로 합쳐지는 식). 나눌 실익도 없다 — `/login` 이 두 역할을
 *  함께 받고 middleware 가 JWT role 로 `/partner` 에 보낸다.
 *  파트너 진입점은 `shortcuts` 로 준다.
 *
 *  ## 아이콘
 *
 *  - any      — 투명 배경 그대로. 런처가 자기 모양으로 감싼다
 *  - maskable — 같은 그림을 흰 배경에 얹었다. 로고가 중심에서 반경 33% 안에
 *               있어 안전영역(40%)을 이미 지킨다 — 따로 여백을 넣지 않았다.
 *               투명하게 두면 런처가 빈 곳을 검게 칠한다
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        id: "/",
        name: "함께가요",
        short_name: "함께가요",
        // layout 의 description 과 같은 문구 — "진료·처방" 계열 표현을 쓰지 않는다.
        description: "병원 방문 이동과 절차를 돕는 동행 지원 서비스",
        lang: "ko",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        // --brand (app/globals.css)
        theme_color: "#2e9ce6",
        icons: [
            {
                src: "/common/icon192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/common/icon512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/common/icon512-maskable.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],
        shortcuts: [
            {
                name: "파트너 홈",
                short_name: "파트너",
                url: "/partner",
                icons: [
                    {
                        src: "/common/icon192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                ],
            },
        ],
    };
}
