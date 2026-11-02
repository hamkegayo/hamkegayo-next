import {
    OPENING_EVENT_CAPACITY,
    OPENING_EVENT_CHANGE_NOTICE,
    OPENING_EVENT_DEADLINE_LABEL,
    OPENING_EVENT_DISCOUNT,
    OPENING_EVENT_TERMS,
} from "@/lib/opening-event";
import { COMPANY } from "@/lib/legal/company";
import { createClient } from "@/utils/supabase/server";

type OpeningEventStatus = {
    enabled: boolean;
    remaining: number;
    ended?: boolean;
};

export default async function OpeningEventNoticePage() {
    // 식별정보 처리 고지가 있어 종료 후에도 페이지는 남기고 상태만 표시한다 (#297).
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("opening_event_status");
    const status = error
        ? undefined
        : (data as unknown as OpeningEventStatus[] | null)?.[0];
    const statusMessage = status?.ended
        ? "이벤트가 종료되었습니다. 종료 전에 결제가 확정된 예약의 할인은 그대로 유지됩니다."
        : status && status.remaining === 0
          ? `선착순 ${OPENING_EVENT_CAPACITY}명이 모두 사용해 신규 적용이 종료되었습니다.`
          : null;
    return (
        <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
            <h1 className="text-2xl font-bold">
                오픈 이벤트 첫 1시간 무료 쿠폰 안내
            </h1>
            {statusMessage && (
                <p
                    role="status"
                    className="rounded-xl border p-4 text-sm font-semibold"
                >
                    {statusMessage}
                </p>
            )}
            <p>
                예약한 서비스의 최초 1시간 요금(Basic{" "}
                {OPENING_EVENT_DISCOUNT.basic.toLocaleString("ko-KR")}원, Plus{" "}
                {OPENING_EVENT_DISCOUNT.plus.toLocaleString("ko-KR")}원)을
                할인합니다. {OPENING_EVENT_DEADLINE_LABEL}까지 결제가 확정된
                예약에 실제 결제와 예약 확정 순으로 선착순{" "}
                {OPENING_EVENT_CAPACITY}명에게 적용하며, 선착순 인원이 모두
                사용하면 기간 중이라도 신규 적용을 종료합니다.
            </p>
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                {OPENING_EVENT_CHANGE_NOTICE}
            </p>
            <ul className="list-disc space-y-3 pl-5">
                {OPENING_EVENT_TERMS.map((term) => (
                    <li key={term}>{term}</li>
                ))}
            </ul>
            <h2 className="text-xl font-bold">이벤트 식별정보 처리 안내</h2>
            <p>
                인증된 이메일 계정당 1회 참여와 같은 이메일 재가입 중복 참여
                방지를 위해, 서버에서 인증 이메일을 환경별 비밀 키로 HMAC 처리한
                식별값을 생성합니다. 이벤트 테이블에는 이메일 원문을 추가
                저장하지 않습니다.
            </p>
            <p>
                처리 항목은 회원 식별자, 이메일 HMAC 식별값, 이메일 인증 확인
                시각·방법, 제외 상태, 예약·결제 연결 및 할인 사용/복원
                기록입니다. 권한 있는 운영 담당자만 관리하며, 공개 팝업과 이
                안내 화면에는 개인별 정보 없이 행사 진행 상태만 표시합니다.
            </p>
            <p>
                행사 종료({OPENING_EVENT_DEADLINE_LABEL} 기간 만료 또는 그 전
                운영 종료 중 먼저 오는 때) 후 관련 예약·결제·취소·환불·사고
                처리가 완료되면 이메일 HMAC과 제외 목록을 파기합니다. 선착순
                인원이 소진되어도 회사·파트너 사유의 혜택 재사용을 처리할 수
                있도록 행사 종료 전까지는 보관합니다. 거래 및 접근 이력은
                개인정보처리방침의 별도 보관 기준에 따릅니다.
            </p>
            <p>
                이벤트 식별정보 및 참여 관련 문의·열람·정정·삭제 요청은{" "}
                {COMPANY.email} 또는 고객센터 {COMPANY.tel}로 접수할 수
                있습니다. 일반 서비스 이용 동의와 구분하며, 이벤트를 이용하지
                않아도 일반 예약을 할 수 있습니다. 이미 사용한 혜택은 고객
                취소나 탈퇴만으로 복원되지 않습니다.
            </p>
        </main>
    );
}
