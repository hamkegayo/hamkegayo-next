/** 파트너 정산 관리 목업 데이터 */

export type SettlementStatus = "paid" | "pending";

export type Settlement = {
    id: string;
    /** 서비스 일자 (2025.05.30 (금)) */
    serviceDate: string;
    hospital: string;
    plan: "Basic" | "Plus";
    /** 정산 금액 (진행 중이면 null) */
    amount: number | null;
    status: SettlementStatus;
    /** 정산일 (미지급이면 null) */
    settledDate: string | null;
};

export const FEE_RATE = 0.033;

/** 원천징수/수수료 및 실수령액 계산 */
export function calcFee(amount: number) {
    const withholding = Math.round(amount * FEE_RATE);
    return { withholding, net: amount - withholding };
}

export const SETTLEMENTS: Settlement[] = [
    {
        id: "ST-2505-005",
        serviceDate: "2025.05.30 (금)",
        hospital: "서울아산병원",
        plan: "Basic",
        amount: 62000,
        status: "paid",
        settledDate: "2025.06.02",
    },
    {
        id: "ST-2505-004",
        serviceDate: "2025.05.28 (수)",
        hospital: "강남세브란스병원",
        plan: "Plus",
        amount: 58000,
        status: "paid",
        settledDate: "2025.05.30",
    },
    {
        id: "ST-2505-003",
        serviceDate: "2025.05.24 (토)",
        hospital: "삼성서울병원",
        plan: "Basic",
        amount: 74000,
        status: "paid",
        settledDate: "2025.05.26",
    },
    {
        id: "ST-2505-002",
        serviceDate: "2025.05.20 (화)",
        hospital: "분당서울대병원",
        plan: "Plus",
        amount: 92000,
        status: "paid",
        settledDate: "2025.05.22",
    },
    {
        id: "ST-2505-001",
        serviceDate: "2025.05.18 (일)",
        hospital: "서울성모병원",
        plan: "Basic",
        amount: null,
        status: "pending",
        settledDate: null,
    },
];

const paid = SETTLEMENTS.filter((s) => s.status === "paid");
const totalAmount = paid.reduce((sum, s) => sum + (s.amount ?? 0), 0);
const totalWithholding = paid.reduce(
    (sum, s) => sum + (s.amount ? calcFee(s.amount).withholding : 0),
    0,
);

export const SETTLEMENT_SUMMARY = {
    totalAmount, // 286,000
    totalWithholding, // 9,438
    totalNet: totalAmount - totalWithholding, // 276,562
    completedCount: paid.length, // 4
    inProgressCount: SETTLEMENTS.length - paid.length, // 1
    nextPayoutDate: "2025.06.15",
    periodFrom: "2025.05.01",
    periodTo: "2025.05.31",
    account: {
        bank: "국민",
        masked: "1234-**-7890",
        lastChanged: "2025.05.01",
    },
};

export function getSettlement(id: string): Settlement | undefined {
    return SETTLEMENTS.find((s) => s.id === id);
}
