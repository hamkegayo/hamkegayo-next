import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async headers() {
        return [
            {
                // 서비스워커는 항상 새로 받게 한다 (#116).
                //  캐시되면 잘못 배포한 SW 를 고쳐 올려도 브라우저가 옛 파일을 계속
                //  쓴다. register() 의 updateViaCache: "none" 과 짝이다.
                source: "/sw.js",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "no-cache, no-store, must-revalidate",
                    },
                    {
                        key: "Content-Type",
                        value: "application/javascript; charset=utf-8",
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
