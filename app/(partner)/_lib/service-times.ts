/**
 * 진행 단계 시각 — 매뉴얼이 각 단계에서 기록하라고 정한 항목 (#55).
 *
 *  약관 제12조 ④ 는 이용시간 분쟁 시 "시작·종료시각 외에 도착 안내시각,
 *  서비스 진행기록" 을 함께 확인한다고 정한다. 그 자료가 이 값들이다.
 *
 *  라벨은 매뉴얼 단계 표현을 그대로 쓴다.
 *
 *  ⚠️ **이 값은 서버 액션 파일에 두지 않는다.** `"use server"` 파일은
 *     async 함수만 export 할 수 있고, 그 밖의 값을 내보내면 클라이언트가
 *     import 할 때 배열이 아니라 서버 참조 프록시를 받는다. 화면에서
 *     `.filter()` 를 부르는 순간 터진다 — 빌드는 통과하므로 실제로 그
 *     화면을 열기 전까지 드러나지 않는다.
 */
export const SERVICE_TIME_FIELDS = [
    { field: "notified_at", label: "도착 통보", step: 4 },
    { field: "hospital_arrived_at", label: "병원 도착", step: 7 },
    { field: "reception_at", label: "접수 완료", step: 7 },
    { field: "wait_started_at", label: "대기 시작", step: 7 },
    { field: "wait_ended_at", label: "대기 종료", step: 7 },
    { field: "treatment_started_at", label: "진료·검사 시작", step: 8 },
    { field: "treatment_ended_at", label: "진료·검사 종료", step: 8 },
    { field: "checkout_started_at", label: "수납·약국 시작", step: 9 },
    { field: "checkout_ended_at", label: "수납·약국 종료", step: 9 },
    { field: "home_departed_at", label: "귀가 출발", step: 11 },
    { field: "handover_at", label: "인계 확인", step: 12 },
] as const;

export type ServiceTimeField = (typeof SERVICE_TIME_FIELDS)[number]["field"];
