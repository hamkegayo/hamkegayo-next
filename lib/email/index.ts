/**
 * 이메일 발송 추상화.
 *  - RESEND_API_KEY 가 있으면 Resend 로 실제 발송, 없으면 Mock(콘솔 출력)
 *  - 다른 공급사로 전환 시 EmailSender 를 구현하고 getEmailSender 만 수정
 */
export interface EmailSender {
    send(to: string, subject: string, html: string): Promise<void>;
}

/** 개발용 목 발송기 — 실제 메일은 보내지 않고 서버 콘솔에만 출력 */
class MockEmailSender implements EmailSender {
    async send(to: string, subject: string, html: string): Promise<void> {
        console.log(`\n[MockEmail] → ${to}\n제목: ${subject}\n${html}\n`);
    }
}

/** Resend 발송기 — REST API 직접 호출(추가 의존성 없음) */
class ResendEmailSender implements EmailSender {
    constructor(
        private readonly apiKey: string,
        private readonly from: string,
    ) {}

    async send(to: string, subject: string, html: string): Promise<void> {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ from: this.from, to, subject, html }),
        });

        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            throw new Error(`Resend 발송 실패(${res.status}): ${detail}`);
        }
    }
}

let sender: EmailSender | null = null;

/**
 * 이메일 발송기를 반환. RESEND_API_KEY 가 설정되어 있으면 Resend, 아니면 Mock.
 * EMAIL_FROM 미설정 시 hamkegayo.kr 기본 발신주소(no-reply@hamkegayo.kr)를 사용한다.
 */
export function getEmailSender(): EmailSender {
    if (sender) return sender;
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM ?? "함께가요 <no-reply@hamkegayo.kr>";
    sender = apiKey
        ? new ResendEmailSender(apiKey, from)
        : new MockEmailSender();
    return sender;
}

/** 인증번호 안내 메일 HTML 본문 */
export function buildOtpEmailHtml(code: string): string {
    return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 16px;color:#111827">함께가요 이메일 인증</h2>
      <p style="margin:0 0 24px;color:#4b5563">아래 인증번호를 회원가입 화면에 입력해 주세요.</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#2e9ce6;text-align:center;padding:16px 0;background:#f0f9ff;border-radius:12px">${code}</div>
      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af">인증번호는 5분간 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>
    </div>
  `;
}
