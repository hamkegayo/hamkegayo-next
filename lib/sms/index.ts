/**
 * SMS 발송 추상화.
 *  - 지금은 Mock(개발용, 콘솔 출력)만 사용
 *  - 알리고 등 실제 발송으로 전환 시 AligoSmsSender 를 구현하고 env(SMS_PROVIDER)만 변경
 */
export interface SmsSender {
  send(to: string, text: string): Promise<void>;
}

/** 개발용 목 발송기 — 실제 문자는 보내지 않고 서버 콘솔에만 출력 */
class MockSmsSender implements SmsSender {
  async send(to: string, text: string): Promise<void> {
    console.log(`\n[MockSMS] → ${to}\n${text}\n`);
  }
}

/** 알리고 발송기 — 실제 연동 시 구현 (발신번호 등록/키 발급 후) */
class AligoSmsSender implements SmsSender {
  async send(): Promise<void> {
    throw new Error(
      "AligoSmsSender 미구현: SMS_PROVIDER=mock 으로 두거나 알리고 연동을 구현하세요.",
    );
  }
}

let sender: SmsSender | null = null;

/** 환경변수(SMS_PROVIDER)에 따라 발송기를 반환. 기본값은 mock. */
export function getSmsSender(): SmsSender {
  if (sender) return sender;
  sender =
    process.env.SMS_PROVIDER === "aligo"
      ? new AligoSmsSender()
      : new MockSmsSender();
  return sender;
}
