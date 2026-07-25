/** 파트너 진행 관리(수락한 서비스) 목업 데이터 */

export type ServiceStatus = "scheduled" | "in_progress" | "completed";

export type ManagementItem = {
    id: string;
    plan: "Basic" | "Plus";
    hospital: string;
    /** 검사 동행 / 접수 동행 / 진료 동행 / 약국 동행 */
    type: string;
    customerName: string;
    customerAge: string;
    /** 예약 일자 라벨 (2025.05.28 (수)) */
    dateLabel: string;
    /** 예약 시각 (14:30) */
    timeLabel: string;
    amount: number;
    status: ServiceStatus;
    /** 예약 번호 (A20250528-1430) */
    code: string;
    /** 시작/종료 기록 시 표시할 시각 (목업 고정값) */
    startTime: string;
    endTime: string;
};

export const STATUS_META: Record<
    ServiceStatus,
    { label: string; badge: string; dot: string }
> = {
    in_progress: {
        label: "진행중",
        badge: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15",
        dot: "bg-emerald-500",
    },
    scheduled: {
        label: "진행 예정",
        badge: "bg-blue-100 text-blue-600 dark:bg-blue-500/15",
        dot: "bg-blue-500",
    },
    completed: {
        label: "귀가완료",
        badge: "bg-muted text-muted-foreground",
        dot: "bg-muted-foreground",
    },
};

export const MANAGEMENT_ITEMS: ManagementItem[] = [
    {
        id: "svc-1",
        plan: "Plus",
        hospital: "서울아산병원",
        type: "검사 동행",
        customerName: "김영희",
        customerAge: "72세",
        dateLabel: "2025.05.28 (수)",
        timeLabel: "14:30",
        amount: 25000,
        status: "in_progress",
        code: "A20250528-1430",
        startTime: "14:30",
        endTime: "16:30",
    },
    {
        id: "svc-2",
        plan: "Basic",
        hospital: "강남세브란스병원",
        type: "접수 동행",
        customerName: "이정민",
        customerAge: "68세",
        dateLabel: "2025.05.28 (수)",
        timeLabel: "16:00",
        amount: 20000,
        status: "scheduled",
        code: "A20250528-1600",
        startTime: "16:00",
        endTime: "18:00",
    },
    {
        id: "svc-3",
        plan: "Plus",
        hospital: "삼성서울병원",
        type: "진료 동행",
        customerName: "박순자",
        customerAge: "75세",
        dateLabel: "2025.05.27 (화)",
        timeLabel: "13:00",
        amount: 25000,
        status: "completed",
        code: "A20250527-1300",
        startTime: "13:00",
        endTime: "15:00",
    },
    {
        id: "svc-4",
        plan: "Plus",
        hospital: "한양대학교병원",
        type: "약국 동행",
        customerName: "최광호",
        customerAge: "70세",
        dateLabel: "2025.05.26 (월)",
        timeLabel: "10:30",
        amount: 25000,
        status: "completed",
        code: "A20250526-1030",
        startTime: "10:30",
        endTime: "12:30",
    },
];

export function getManagementItem(id: string): ManagementItem | undefined {
    return MANAGEMENT_ITEMS.find((s) => s.id === id);
}
