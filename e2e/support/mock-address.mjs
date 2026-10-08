import http from "node:http";

// 주소 API 응답 형식만 모의한다. 검색 쿼터·서명·예약 검증은 실제 앱 코드를 사용한다.
const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1:4011");
    response.setHeader("Content-Type", "application/json");
    if (url.pathname === "/health") return response.end('{"ok":true}');
    if (url.searchParams.get("confmKey") !== "e2e-local-address-only") {
        response.writeHead(403);
        return response.end('{"error":"invalid_test_key"}');
    }
    const hospital = url.searchParams.get("keyword")?.includes("연세");
    response.end(
        JSON.stringify({
            results: {
                common: {
                    errorCode: "0",
                    errorMessage: "정상",
                    totalCount: "1",
                },
                juso: [
                    {
                        roadAddr: hospital
                            ? "서울특별시 서대문구 연세로 50"
                            : "서울특별시 종로구 세종대로 175",
                        jibunAddr: "테스트 지번",
                        zipNo: "03000",
                        admCd: hospital ? "1141011400" : "1111011900",
                        bdNm: "",
                    },
                ],
            },
        }),
    );
});
server.listen(4011, "127.0.0.1");
