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
    { recorded }: { recorded: boolean },
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
        const label = KAKAO_UNLINK_LABEL[event.referrerType];
        const body = recorded
            ? `${label} 알림을 받았습니다 (${at}).
    회원 데이터는 자동으로 바꾸지 않았습니다. 관리자 화면에서 회원을 확인하고
    운영 기준에 따라 조치한 뒤 처리 완료로 표시해 주세요.`
            : `${label} 알림을 받았지만 기록에 실패했습니다 (${at}).
    카카오는 이 알림을 다시 보내지 않습니다. 서버 로그의 [kakao-unlink] 항목과
    마이그레이션 적용·Supabase 연결 상태를 확인해 주세요.`;
        await getEmailSender().send(
            to,
            `[함께가요] 카카오 연결 해제${recorded ? "" : " 기록 실패"} · ${label}`,
            `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 8px;color:#111827">카카오 연결 해제 알림</h2>
  <p style="margin:0 0 16px;color:#4b5563;line-height:1.6">
    ${body}
  </p>
  <a href="${site}/admin/social-unlinks" style="color:#2563eb">관리자 화면에서 확인</a>
</div>`,
        );
    } catch (error) {
        // 알림 실패는 기록을 막지 않는다. 진단용으로 오류 이름만 남긴다.
        console.error(
            "[kakao-unlink] 알림 메일 실패:",
            error instanceof Error ? error.name : "unknown",
        );
    }
}
