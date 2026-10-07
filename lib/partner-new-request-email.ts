/**
 * 파트너 새 요청 메일 (#255-4, #269 리뷰).
 * 예약 내용(일시·상품·병원·예약 ID)을 받지 않는다 — 처리방침 제6조의 Resend 위탁 항목이
 * "이메일 주소, 인증 정보"뿐이므로, 새 요청이 왔다는 사실과 수락 대기 목록 링크만 보낸다.
 */
export function buildNewRequestEmail(siteBase: string): {
    subject: string;
    html: string;
} {
    const link = `${siteBase.replace(/\/$/, "")}/partner/requests`;
    return {
        subject: "[함께가요] 새 동행 요청이 도착했어요",
        html: `
<p>활동 지역·시간에 맞는 새 병원동행 요청이 도착했어요.</p>
<p>요청 내용은 파트너 화면에서 확인해 주세요.</p>
<p><a href="${link}">수락 대기 목록 보기</a></p>
<p style="color:#888;font-size:12px">알림 메일은 파트너 화면의 알림 &gt; 알림 설정에서 끌 수 있어요.</p>`,
    };
}
