import { getEmailSender } from "@/lib/email";

import type { KakaoUnlinkEvent, KakaoUnlinkReferrer } from "./kakao-unlink";

/** 관리자 화면·메일에 보이는 사유 */
export const KAKAO_UNLINK_LABEL: Record<KakaoUnlinkReferrer, string> = {
    ACCOUNT_DELETE: "카카오계정 탈퇴",
    FORCED_ACCOUNT_DELETE: "카카오계정 강제 탈퇴(휴면 등)",
    UNLINK_FROM_ADMIN: "카카오 관리자 연결 해제",
    UNLINK_FROM_APPS: "사용자가 서비스 연결 해제",
    INCOMPLETE_SIGN_UP: "가입 미완료 연결 해제",
};

/**
 * 연결 해제 알림 메일 (#291). ADMIN_ALERT_EMAIL 이 없으면 보내지 않는다(관리자 홈 건수로만 확인).
 * ⚠️ 회원 이름·이메일·카카오 회원번호를 넣지 않는다. 관리자 화면에서 접속기록과 함께 확인한다.
 * 절대 던지지 않는다.
 */
export async function sendKakaoUnlinkAlert(
    event: KakaoUnlinkEvent,
): Promise<void> {
    try {
        const to = process.env.ADMIN_ALERT_EMAIL?.trim();
        if (!to) return;
        const site = (
            process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hamkegayo.kr"
        ).replace(/\/$/, "");
        const at = new Date().toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
        });
        await getEmailSender().send(
            to,
            `[함께가요] 카카오 연결 해제 · ${KAKAO_UNLINK_LABEL[event.referrerType]}`,
            `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 8px;color:#111827">카카오 연결 해제 알림</h2>
  <p style="margin:0 0 16px;color:#4b5563;line-height:1.6">
    ${KAKAO_UNLINK_LABEL[event.referrerType]} 알림을 받았습니다 (${at}).
    회원 데이터는 자동으로 바꾸지 않았습니다. 관리자 화면에서 회원을 확인하고
    회원탈퇴 절차로 처리한 뒤 처리 완료로 표시해 주세요.
  </p>
  <a href="${site}/admin/social-unlinks" style="color:#2563eb">관리자 화면에서 확인</a>
</div>`,
        );
    } catch {
        // 알림 실패는 기록을 막지 않는다
    }
}
