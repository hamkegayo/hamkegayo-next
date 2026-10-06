// E2E 모의 NICEPAY API 서버 (#214). 실제 PG 를 호출하지 않고 승인·조회·취소에 성공 응답을 준다.
// 서버는 NICEPAY_API_BASE_URL(루프백만 허용)로 이 주소를 호출한다 — lib/payments/nicepay.ts
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_NICEPAY_PORT ?? 4010);
/** tid → 승인 기록. 조회·취소 응답에 쓴다. */
const payments = new Map();

function send(res, body) {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
}

function readJson(req) {
    return new Promise((resolve) => {
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch {
                resolve({});
            }
        });
    });
}

createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = req.method === "POST" ? await readJson(req) : {};

    if (url.pathname === "/health") return send(res, { ok: true });

    // 망취소
    if (url.pathname === "/v1/payments/netcancel") {
        return send(res, {
            resultCode: "0000",
            resultMsg: "망취소 성공",
            orderId: body.orderId,
            status: "cancelled",
        });
    }
    // 주문번호 조회
    const findMatch = /^\/v1\/payments\/find\/(.+)$/.exec(url.pathname);
    if (findMatch) {
        const orderId = decodeURIComponent(findMatch[1]);
        const found = [...payments.values()].find((p) => p.orderId === orderId);
        return send(
            res,
            found ?? {
                resultCode: "0000",
                orderId,
                status: "ready",
                amount: 0,
            },
        );
    }
    // 취소
    const cancelMatch = /^\/v1\/payments\/([^/]+)\/cancel$/.exec(url.pathname);
    if (cancelMatch) {
        const tid = decodeURIComponent(cancelMatch[1]);
        const p = payments.get(tid) ?? { tid, amount: 0 };
        const cancelAmt = body.cancelAmt ?? p.amount;
        const balanceAmt = Math.max(0, (p.balanceAmt ?? p.amount) - cancelAmt);
        const next = {
            ...p,
            resultCode: "0000",
            status: balanceAmt > 0 ? "partialCancelled" : "cancelled",
            balanceAmt,
            cancelledTid: `${tid}C${Date.now()}`,
        };
        payments.set(tid, next);
        return send(res, next);
    }
    // 승인(POST) · 조회(GET)
    const payMatch = /^\/v1\/payments\/([^/]+)$/.exec(url.pathname);
    if (payMatch) {
        const tid = decodeURIComponent(payMatch[1]);
        if (req.method === "POST") {
            const approved = {
                resultCode: "0000",
                resultMsg: "정상 처리되었습니다.",
                tid,
                // 결제창 모의가 tid 에 주문번호를 실어 보낸다: E2E_<orderId>
                orderId: tid.startsWith("E2E_") ? tid.slice(4) : tid,
                amount: body.amount,
                balanceAmt: body.amount,
                status: "paid",
                paidAt: new Date().toISOString(),
                receiptUrl: null,
            };
            payments.set(tid, approved);
            return send(res, approved);
        }
        return send(
            res,
            payments.get(tid) ?? {
                resultCode: "0000",
                tid,
                status: "ready",
                amount: 0,
            },
        );
    }

    res.writeHead(404).end();
}).listen(PORT, "127.0.0.1", () => {
    console.log(`[mock-nicepay] http://127.0.0.1:${PORT}`);
});
