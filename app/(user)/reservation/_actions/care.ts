"use server";

/**
 * 예약 STEP1 의 '이용자 정보 불러오기' 용 조회.
 *
 *  마이페이지에 저장해 둔 환자 정보(care_recipients)를 예약 폼에서 다시 입력하지
 *  않게 한다. 화면 문구는 이미 "환자 정보는 마이페이지에서 관리할 수 있습니다" 라고
 *  안내하고 있었는데 정작 불러오는 경로가 없었다.
 *
 *  예약 화면은 전부 클라이언트 컴포넌트(zustand)라 서버 전용 조회를 직접 부를 수
 *  없다. 그래서 얇은 Server Action 하나를 둔다 — 조회 로직은 마이페이지와 같은
 *  것을 쓴다. 두 벌로 갈라지면 RLS 전제가 어긋난다.
 */

import {
    getCareRecipients,
    type CareRecipient,
} from "@/app/(user)/mypage/_lib/care.server";

/** 로그인 사용자의 환자 목록. 비로그인·조회 실패 시 빈 배열. */
export async function listMyCareRecipients(): Promise<CareRecipient[]> {
    return getCareRecipients();
}
