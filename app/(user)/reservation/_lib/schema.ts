import { z } from "zod";

const required = "필수 입력 항목입니다.";

/** STEP1 · 이용자 / 진료 정보 */
export const step1Schema = z.object({
    userName: z.string().min(1, required),
    userBirth: z.string().min(1, required),
    userGender: z.string().min(1, "성별을 선택해 주세요."),
    userPhone: z.string().min(1, required),
    guardianName: z.string().min(1, required),
    guardianPhone: z.string().min(1, required),
    relation: z.string().min(1, "관계를 선택해 주세요."),
    treatment: z.string().min(1, required),
    purpose: z.string().min(1, required),
    // 거동·인지 상태는 매칭 전 파트너에게 제공되는 민감정보다 (처리방침 제5조 ④).
    // 파트너가 수행 가능 여부를 판단하는 근거라 필수로 받는다.
    mobilityStatus: z.string().min(1, "거동 상태를 선택해 주세요."),
    cognitiveStatus: z.string().min(1, "인지 상태를 선택해 주세요."),
    cautions: z.string().optional(),
    docPrescription: z.boolean().optional(),
    docReceipt: z.boolean().optional(),
    docCertificate: z.boolean().optional(),
    otherRequests: z.string().optional(),
    // 매뉴얼 용어정의 — 통보대상은 "도착·지연·진행상황을 알릴 사람으로 지정된
    // 이용자 또는 보호자" 다. 파트너 4단계가 이 값을 보고 도착 통보를 보낸다.
    notifyTarget: z.enum(["USER", "GUARDIAN", "BOTH"], {
        message: "통보 대상을 선택해 주세요.",
    }),
    // 약관 제8조 ① — 진료내용을 보호자에게 전달할지는 이용자 의사에 따른다.
    // 매뉴얼 10단계·대응카드 16 이 이 값을 전달 근거로 삼는다.
    shareMedicalInfo: z.boolean(),
});

/** STEP2 · 병원 및 일정 정보 */
export const step2Schema = z.object({
    useDate: z.string().min(1, required),
    arriveTime: z.string().min(1, "시간을 선택해 주세요."),
    reserveTime: z.string().min(1, "시간을 선택해 주세요."),
    duration: z.string().min(1, "시간을 선택해 주세요."),
    departAddress: z.string().min(1, required),
    // 병원명은 매칭 전 파트너에게 제공되는 단계 1 항목이다 (처리방침 제5조 ②).
    // 주소는 확정 후에만 제공되므로 이름을 따로 받는다.
    hospitalName: z.string().min(1, required),
    hospitalAddress: z.string().min(1, required),

    // 매뉴얼 1장 — 이동수단·귀가수단·종료방식이 없으면 업무를 시작할 수 없다.
    // 파트너 개인차량 운송과 대리운전은 선택지 자체에 없다(매뉴얼 2장).
    transportTo: z.enum(["WALK", "PUBLIC", "TAXI", "FAMILY_CAR"], {
        message: "이동수단을 선택해 주세요.",
    }),
    transportHome: z.enum(["WALK", "PUBLIC", "TAXI", "FAMILY_CAR"], {
        message: "귀가수단을 선택해 주세요.",
    }),
    endMethod: z.enum(["ADULT_HANDOVER", "INDEPENDENT"], {
        message: "종료 방식을 선택해 주세요.",
    }),

    // 인계자는 이용자 본인이 아닌 **제3자의 개인정보**다. 성인 인계일 때만 받고
    // 확정 후(단계 2)에만 파트너에게 제공한다(처리방침 제5조 ②③).
    handoverName: z.string().optional(),
    handoverRelation: z.string().optional(),
    handoverPhone: z.string().optional(),
    backupHandoverName: z.string().optional(),
    backupHandoverRelation: z.string().optional(),
    backupHandoverPhone: z.string().optional(),
});

/**
 * 성인 인계를 고르면 인계자 정보가 필수가 된다.
 *
 *  매뉴얼 12단계는 인계자의 이름·관계·연락처를 예약정보와 **대조**하라고
 *  규정한다. 대조할 원본이 없으면 그 절차 자체가 불가능하다.
 *
 *  대체 인계자는 선택이다. 대응카드 18 이 "등록되어 있으면 순서대로 연락한다"
 *  라고 조건부로 쓰고 있어 필수로 볼 근거가 없다.
 */
function requireHandover(
    v: {
        endMethod?: string;
        handoverName?: string;
        handoverRelation?: string;
        handoverPhone?: string;
    },
    ctx: z.RefinementCtx,
) {
    if (v.endMethod !== "ADULT_HANDOVER") return;

    const fields: [keyof typeof v, string][] = [
        ["handoverName", "인계자 성함을 입력해 주세요."],
        ["handoverRelation", "인계자와의 관계를 선택해 주세요."],
        ["handoverPhone", "인계자 연락처를 입력해 주세요."],
    ];

    for (const [name, message] of fields) {
        if (!v[name]?.trim()) {
            ctx.addIssue({ code: "custom", path: [name], message });
        }
    }
}

/**
 * STEP4 는 "신청 내역 확인" 화면이라 입력 필드가 없다 (동의 체크만 로컬 상태).
 *
 *  결제 정보 스키마가 여기 있었으나 #54 에서 제거했다 —
 *  카드 정보는 PG 결제창이 직접 받고 우리는 저장하지 않는다.
 *  카드번호·유효기간을 우리 폼에서 받으면 PCI-DSS 대상이 된다.
 */

export const step2Form = step2Schema.superRefine(requireHandover);

export type Step1Values = z.infer<typeof step1Schema>;
export type Step2Values = z.infer<typeof step2Schema>;

/** 서버 예약 등록 입력 (STEP1 + STEP2 + 플랜, 성별/플랜은 enum으로 강화) */
export const reservationServerSchema = step1Schema
    .merge(step2Schema)
    .extend({
        userGender: z.enum(["female", "male"]),
        plan: z.enum(["basic", "plus"]),
    })
    // 화면을 우회해 직접 호출해도 인계자 없는 성인 인계는 막는다.
    .superRefine(requireHandover);

export type ReservationInput = z.infer<typeof reservationServerSchema>;
