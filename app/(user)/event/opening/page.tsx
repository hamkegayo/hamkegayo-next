import { OPENING_EVENT_TERMS } from "@/lib/opening-event";
import { COMPANY } from "@/lib/legal/company";

export default function OpeningEventNoticePage() {
    return (
        <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
            <h1 className="text-2xl font-bold">
                25,000원 오픈 이벤트 쿠폰 안내
            </h1>
            <p>
                실제 결제와 예약 확정 순으로 선착순 20명에게 적용합니다. 정원
                소진 또는 행사 종료 시 신규 적용을 종료합니다.
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
                기록입니다. 권한 있는 운영 담당자만 관리하며 공개 팝업에는 남은
                정원과 행사 상태만 표시합니다.
            </p>
            <p>
                행사 종료 후 관련 예약·결제·취소·환불·사고 처리가 완료되면
                이메일 HMAC과 제외 목록을 파기합니다. 거래 및 접근 이력은
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
