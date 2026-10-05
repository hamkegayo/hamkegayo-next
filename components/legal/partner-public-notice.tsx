import {
    operationalNoticeEffectiveDate,
    OPERATIONAL_NOTICE_ANNOUNCED_DATE,
} from "@/lib/legal/operational-release";

export function PartnerPublicNotice() {
    return (
        <aside
            className="mx-auto mt-8 max-w-4xl rounded-xl border p-4 text-sm leading-relaxed"
            aria-label="파트너 프로필 공개 안내"
        >
            <strong>파트너 프로필 공개 안내</strong>
            <p>
                개인정보처리방침 부속 고지 버전:
                partner-disclosure-2026-10-05-v1
            </p>
            <p>
                공고일: {OPERATIONAL_NOTICE_ANNOUNCED_DATE} · 시행일:{" "}
                {operationalNoticeEffectiveDate()}
            </p>
            <p>
                파트너 선택 전 서비스 제공자 정보 확인을 위해, 파트너가 공개에
                동의한 사진·표시 이름·자기소개 및 관리자 검증 근무
                병원·기간·부서·담당 업무와 인증 자격 명칭·발급기관을 제공합니다.
                실제 평점과 별도 공개 동의가 확인된 후기도 표시합니다.
            </p>
            <p>
                공개 대상과 기간은 해당 파트너가 수락한 예약의 예약자 및 해당
                예약의 매칭 중으로 제한합니다. 일반 방문자에게 전체 파트너
                목록을 공개하지 않습니다.
            </p>
            <p>
                공개 동의는 선택 사항입니다. 파트너는 My 프로필에서 동의를
                철회할 수 있으며, 거부·철회해도 예약 수락 기능은 유지됩니다.
                철회하면 추가 프로필 조회를 차단합니다. 이미 열람한 정보는
                회수할 수 없습니다.
            </p>
            <p>
                연락처·이메일·주소·생년월일·정산 계좌·증빙 원본은 상세
                프로필에서 공개하지 않습니다. 새 증빙 파일 수집 활성화는 별도
                절차입니다.
            </p>
        </aside>
    );
}
