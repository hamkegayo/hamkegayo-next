import type { Page } from "@playwright/test";

/**
 * 결제창 JS SDK(https://pay.nicepay.co.kr/v1/js/)를 모의 스크립트로 바꾼다 (#214).
 *
 * 실제 결제창 대신 인증 성공 결과를 returnUrl(/api/payments/confirm)로 POST 한다.
 * 서명은 서버와 같은 규칙 hex(sha256(authToken + clientId + amount + secretKey))으로
 * 만들어, 승인 라우트의 위변조 검증을 그대로 통과·검증하게 한다.
 * tid 에는 주문번호를 실어 모의 PG 서버(e2e/support/mock-nicepay.mjs)가 응답에 쓴다.
 */
export async function mockNicepaySdk(page: Page, secretKey: string) {
    const script = `
window.AUTHNICE = {
  requestPay: function (o) {
    (async function () {
      var authToken = "e2e-" + Date.now();
      var amount = String(o.amount);
      var bytes = new TextEncoder().encode(authToken + o.clientId + amount + ${JSON.stringify(secretKey)});
      var digest = await crypto.subtle.digest("SHA-256", bytes);
      var signature = Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
      var fields = {
        authResultCode: "0000", authResultMsg: "인증 성공", tid: "E2E_" + o.orderId,
        clientId: o.clientId, orderId: o.orderId, amount: amount,
        authToken: authToken, signature: signature
      };
      var form = document.createElement("form");
      form.method = "POST";
      form.action = o.returnUrl;
      Object.keys(fields).forEach(function (k) {
        var input = document.createElement("input");
        input.type = "hidden"; input.name = k; input.value = fields[k];
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    })();
  }
};`;
    await page.route("https://pay.nicepay.co.kr/**", (route) =>
        route.fulfill({ contentType: "text/javascript", body: script }),
    );
}
