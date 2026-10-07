"use client";

import { X } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import {
    END_METHOD_LABEL,
    NOTIFY_TARGET_LABEL,
    REPORT_CHANNEL,
    TRANSPORT_LABEL,
    type EndMethodCode,
    type NotifyTargetCode,
    type TransportCode,
} from "@/lib/handover";
import type { PartnerServiceView } from "../../../_lib/services.server";

const MISSING = "정보 없음";

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex gap-4 py-2 text-sm">
            <span className="text-muted-foreground w-24 shrink-0 font-semibold">
                {label}
            </span>
            <span className="text-foreground min-w-0 flex-1 break-keep whitespace-pre-wrap">
                {value}
            </span>
        </div>
    );
}

/**
 * 예약/요청 정보 (읽기 전용 요약, #255-1).
 *
 * 이 화면에 들어온 데이터는 이미 열람 제한 안에 있다 — 서비스 상세는 예약 RLS
 * (partner_can_access)로 읽으므로 수행기록 제출 완료 또는 종료 후 24시간이 지나면
 * 상세 자체가 열리지 않는다(처리방침 제5조 ② [단계 2] · 제9조 ④). 별도 조회를 하지 않는다.
 */
export function RequestInfoModal({
    open,
    onClose,
    service,
}: {
    open: boolean;
    onClose: () => void;
    service: PartnerServiceView;
}) {
    const cond = service.conditions;
    const transport = (code: string | null) =>
        code ? (TRANSPORT_LABEL[code as TransportCode] ?? MISSING) : MISSING;

    return (
        <Modal open={open} onClose={onClose} className="max-w-lg">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-foreground text-lg font-extrabold">
                        예약/요청 정보
                    </h2>
                    <p className="text-muted-foreground mt-1 text-xs">
                        예약번호 {service.code || "-"} · 수행기록 제출 또는 종료
                        24시간 후에는 볼 수 없어요
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="닫기"
                    className="text-muted-foreground hover:text-foreground -m-1 p-1"
                >
                    <X className="size-5" />
                </button>
            </div>

            <div className="mt-5 max-h-[65vh] overflow-y-auto pr-1">
                <p className="text-foreground text-sm font-bold">예약 조건</p>
                <div className="divide-border mt-1 divide-y">
                    <Row
                        label="일시"
                        value={
                            `${service.dateLabel} ${service.timeLabel}`.trim() ||
                            MISSING
                        }
                    />
                    <Row label="상품" value={service.plan} />
                    <Row
                        label="이용시간"
                        value={service.durationLabel || MISSING}
                    />
                    <Row label="병원" value={service.hospital || MISSING} />
                    <Row label="진료 유형" value={service.type || MISSING} />
                    <Row
                        label="이용자"
                        value={
                            [service.customerName, service.customerAge]
                                .filter(Boolean)
                                .join(" · ") || MISSING
                        }
                    />
                </div>

                <p className="text-foreground mt-5 text-sm font-bold">
                    수행 조건
                </p>
                <div className="divide-border mt-1 divide-y">
                    <Row label="병원까지" value={transport(cond.transportTo)} />
                    <Row
                        label="귀가수단"
                        value={transport(cond.transportHome)}
                    />
                    <Row
                        label="종료 방식"
                        value={
                            cond.endMethod
                                ? (END_METHOD_LABEL[
                                      cond.endMethod as EndMethodCode
                                  ] ?? MISSING)
                                : MISSING
                        }
                    />
                    <Row
                        label="통보 대상"
                        value={
                            cond.notifyTarget
                                ? (NOTIFY_TARGET_LABEL[
                                      cond.notifyTarget as NotifyTargetCode
                                  ] ?? MISSING)
                                : MISSING
                        }
                    />
                    {/* 약관 제8조 — 동의가 없으면 보호자에게 진료 내용을 전달하지 않는다 */}
                    <Row
                        label="진료정보 전달"
                        value={
                            cond.shareMedicalInfo
                                ? "보호자에게 전달 동의"
                                : "전달 불가 (이용자 미동의)"
                        }
                    />
                    <Row label="결과보고" value={REPORT_CHANNEL} />
                </div>

                <p className="text-foreground mt-5 text-sm font-bold">
                    요청 사항
                </p>
                <div className="divide-border mt-1 divide-y">
                    <Row
                        label="요청사항"
                        value={cond.otherRequests ?? "없음"}
                    />
                    <Row label="주의사항" value={cond.cautions ?? "없음"} />
                </div>
            </div>
        </Modal>
    );
}
