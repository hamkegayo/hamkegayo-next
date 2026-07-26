/** 파트너 리포트 작성 목업 데이터 */

import { type ReportStatus } from "@/lib/reservation";

// 상태 타입은 공용 단일 소스로 이동(#20). 기존 import 경로 호환을 위해 재-export.
export type { ReportStatus };

export type ReportAttachment = {
    id: string;
    /** 처방전 / 영수증 등 */
    kind: string;
    filename: string;
    size: string;
};

export type ReportItem = {
    id: string;
    plan: "Basic" | "Plus";
    hospital: string;
    /** 검사 동행 / 진료 동행 / 접수 동행 / 약국 동행 */
    type: string;
    customerName: string;
    customerAge: string;
    customerGender: string;
    /** 서비스 일자 (2025.06.17 (화)) */
    serviceDate: string;
    /** 예약 번호 (R20250617-0012, DB code 포맷) */
    code: string;
    status: ReportStatus;
    partnerName: string;
    attachments: ReportAttachment[];
};

/** 수행 지원 내용 선택지 (기타는 별도 입력) */
export const SUPPORT_OPTIONS = [
    "병원 이동 지원",
    "접수 지원",
    "진료 동행",
    "검사 동행",
    "수납 지원",
    "약국 방문",
    "귀가 지원",
] as const;

function defaultAttachments(name: string, date: string): ReportAttachment[] {
    const d = date.replace(/[^0-9]/g, "").slice(0, 8);
    return [
        {
            id: "att-presc",
            kind: "처방전",
            filename: `처방전_${name}_${d}.jpg`,
            size: "1.2MB",
        },
        {
            id: "att-receipt",
            kind: "영수증",
            filename: `영수증_${name}_${d}.jpg`,
            size: "1.5MB",
        },
    ];
}

export const REPORT_ITEMS: ReportItem[] = [
    {
        id: "rpt-1",
        plan: "Plus",
        hospital: "원주세브란스기독병원",
        type: "검사 동행",
        customerName: "홍길동",
        customerAge: "82세",
        customerGender: "여성",
        serviceDate: "2025.06.17 (화)",
        code: "R20250617-0012",
        status: "pending",
        partnerName: "김서현 파트너",
        attachments: defaultAttachments("홍길동", "20250617"),
    },
    {
        id: "rpt-2",
        plan: "Plus",
        hospital: "서울아산병원",
        type: "진료 동행",
        customerName: "김영자",
        customerAge: "78세",
        customerGender: "여성",
        serviceDate: "2025.06.16 (월)",
        code: "R20250616-0034",
        status: "pending",
        partnerName: "김서현 파트너",
        attachments: defaultAttachments("김영자", "20250616"),
    },
    {
        id: "rpt-3",
        plan: "Basic",
        hospital: "강남세브란스병원",
        type: "접수 동행",
        customerName: "박철수",
        customerAge: "74세",
        customerGender: "남성",
        serviceDate: "2025.06.16 (월)",
        code: "R20250616-0021",
        status: "pending",
        partnerName: "김서현 파트너",
        attachments: defaultAttachments("박철수", "20250616"),
    },
    {
        id: "rpt-4",
        plan: "Plus",
        hospital: "삼성서울병원",
        type: "약국 동행",
        customerName: "최순옥",
        customerAge: "81세",
        customerGender: "여성",
        serviceDate: "2025.06.14 (토)",
        code: "R20250614-0009",
        status: "done",
        partnerName: "김서현 파트너",
        attachments: defaultAttachments("최순옥", "20250614"),
    },
    {
        id: "rpt-5",
        plan: "Basic",
        hospital: "한양대학교병원",
        type: "검사 동행",
        customerName: "정만호",
        customerAge: "69세",
        customerGender: "남성",
        serviceDate: "2025.06.12 (목)",
        code: "R20250612-0040",
        status: "done",
        partnerName: "김서현 파트너",
        attachments: defaultAttachments("정만호", "20250612"),
    },
];

export function getReportItem(id: string): ReportItem | undefined {
    return REPORT_ITEMS.find((r) => r.id === id);
}
