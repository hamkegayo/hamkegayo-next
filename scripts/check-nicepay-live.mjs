// 운영키 인증을 거래 변경 없이 확인한다. 승인·취소 API는 호출하지 않는다.
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const API_BASE = "https://api.nicepay.co.kr";
// NICEPAY 공식 코드집의 주문/거래 없음 응답만 인증 확인으로 인정한다.
const NOT_FOUND_CODES = new Set(["U107", "U126", "A118", "A243", "A251"]);

export async function checkNicepayLive(env = process.env, fetcher = fetch) {
    const clientKey = env.NEXT_PUBLIC_NICEPAY_CLIENT_KEY?.trim();
    const secretKey = env.NICEPAY_SECRET_KEY?.trim();
    if (!/^R[12]_/.test(clientKey ?? "") || !secretKey) {
        throw new Error("운영 Client Key와 Secret Key를 설정해 주세요.");
    }

    const orderId = `release-check-${randomUUID()}`;
    const orderDate = new Date()
        .toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
        .replaceAll("-", "");
    let response;
    let body;
    try {
        response = await fetcher(
            `${API_BASE}/v1/payments/find/${orderId}?orderDate=${orderDate}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Basic ${Buffer.from(`${clientKey}:${secretKey}`).toString("base64")}`,
                    "Content-Type": "application/json;charset=utf-8",
                },
                redirect: "error",
                signal: AbortSignal.timeout(10_000),
            },
        );
        body = await response.json();
    } catch {
        throw new Error(
            "운영 API 조회에 실패했습니다. 연결 상태를 확인하세요.",
        );
    }

    const resultCode = body?.resultCode;
    if (
        ![200, 400, 404].includes(response.status) ||
        !NOT_FOUND_CODES.has(resultCode)
    ) {
        // 원본 응답에는 거래정보가 포함될 수 있으므로 출력하지 않는다.
        const safeCode =
            typeof resultCode === "string" && /^[A-Z0-9]{4}$/.test(resultCode)
                ? resultCode
                : "unknown";
        throw new Error(
            `운영키 인증을 확인하지 못했습니다 (HTTP ${response.status}, 코드 ${safeCode}). 키와 PG 설정을 확인하세요.`,
        );
    }
    return { http: response.status, resultCode, readOnly: true };
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    try {
        const result = await checkNicepayLive();
        console.log("운영키 조회 인증 확인:", JSON.stringify(result));
        console.log("실결제·취소 성공 여부는 배포 후 별도 검증해야 합니다.");
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
