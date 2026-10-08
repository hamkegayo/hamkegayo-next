"use client";

import { X } from "lucide-react";
import { useRef, type RefObject } from "react";

import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

/**
 * #255 — 파트너 현장업무 매뉴얼 「7. 리포트 작성」·「3. 연락과 기록의 기본 원칙」·14단계.
 * 약관 제7조 ① 6호·② 2호, 제8조 — 확인한 사실만, 이용자가 동의한 전달 범위 안에서 기록한다.
 * 원문: https://www.notion.so/3cf169f76f9f819d940cfef2b3ade607
 */
export function ReportGuideModal({
    open,
    onClose,
    returnFocus,
}: {
    open: boolean;
    onClose: () => void;
    returnFocus: RefObject<HTMLButtonElement | null>;
}) {
    const closeRef = useRef<HTMLButtonElement>(null);
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent
                initialFocus={closeRef}
                finalFocus={returnFocus}
                className="max-w-lg md:p-8"
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <DialogTitle className="text-foreground text-lg font-extrabold">
                            리포트 작성 가이드
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground mt-1 text-sm">
                            현장에서 확인한 사실을 이용자의 동의 범위 안에서
                            기록해 주세요.
                        </DialogDescription>
                    </div>
                    <button
                        type="button"
                        ref={closeRef}
                        onClick={onClose}
                        aria-label="작성 가이드 닫기"
                        className="text-muted-foreground hover:text-foreground -m-1 p-1"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                <div className="mt-5 max-h-[60vh] space-y-5 overflow-y-auto pr-1 text-sm leading-relaxed">
                    <section>
                        <h3 className="text-foreground font-bold">
                            1. 실제 수행한 내용을 적어 주세요
                        </h3>
                        <p className="text-muted-foreground mt-2">
                            도착·시작·종료와 병원 접수·진료·대기 시각을
                            확인하고, 실제로 수행한 지원 항목을 선택해 주세요.
                            이동·귀가수단, 인계 또는 독립 귀가 결과와 특이사항도
                            기록합니다.
                        </p>
                        <p className="text-muted-foreground mt-2">
                            지연·연락 실패·상태 변화·시스템 오류가 있었다면
                            사실, 시각, 장소, 연락 대상과 답변, 파트너가 한
                            조치를 순서대로 적어 주세요. 확인하지 못한 내용은
                            추측해서 채우지 않습니다.
                        </p>
                    </section>
                    <section>
                        <h3 className="text-foreground font-bold">
                            2. 의료진 설명과 관찰한 사실을 구분해 주세요
                        </h3>
                        <p className="text-muted-foreground mt-2">
                            검사 진행 상황과 의료진이 안내한 다음 일정은 들은
                            범위에서 사실대로 적습니다. 검사결과의 의미, 치료
                            선택이나 복용량에 대한 판단·조언을 덧붙이거나 책임을
                            판단하지 않습니다.
                        </p>
                        <div className="bg-muted/40 mt-2 rounded-lg p-3">
                            <p className="text-foreground font-semibold">
                                작성 예시
                            </p>
                            <p className="text-muted-foreground mt-1">
                                10:20 혈액검사 접수 완료. 10:45 진료실 동행.
                                의료진이 다음 방문 일정을 안내함. 11:30 예약된
                                인계자에게 인계 완료.
                            </p>
                        </div>
                    </section>
                    <section>
                        <h3 className="text-foreground font-bold">
                            3. 전달대상과 이용자 동의를 확인해 주세요
                        </h3>
                        <p className="text-muted-foreground mt-2">
                            예약 화면에 등록된 진료정보 전달대상과 이용자가
                            동의한 범위를 확인합니다. 이용자가 원하지 않는
                            진료내용은 전달하지 않습니다. ‘보호자 리포트’라는
                            이름만으로 모든 가족에게 정보를 전달할 수 있는 것은
                            아닙니다. 등록되지 않은 사람이 요청하면 운영센터에
                            확인해 주세요.
                        </p>
                    </section>
                    <section>
                        <h3 className="text-foreground font-bold">
                            4. 첨부 자료는 필요한 범위만 올려 주세요
                        </h3>
                        <p className="text-muted-foreground mt-2">
                            사진·문서는 업무상 필요성, 이용자 동의와 수신자를
                            확인한 뒤 첨부합니다. 업무와 관계없는 개인정보,
                            계좌정보나 비밀번호를 적지 마세요. 자료를
                            단체대화방이나 공개공간에 보내지 않습니다.
                        </p>
                    </section>
                    <section>
                        <h3 className="text-foreground font-bold">
                            5. 제출 완료와 자료 정리를 확인해 주세요
                        </h3>
                        <p className="text-muted-foreground mt-2">
                            미리보기로 내용을 확인한 뒤 리포트를 생성하고,
                            목록의 ‘작성 완료’ 표시를 확인해 주세요. 임시
                            저장만으로는 제출이 완료되지 않습니다. 다음 업무를
                            시작하기 전에 제출을 마칩니다.
                        </p>
                        <p className="text-muted-foreground mt-2">
                            결과보고와 필요한 전달을 마친 뒤 개인기기에 남은
                            이용자 사진·서류·연락처 메모를 정리합니다.
                            사고·민원·분쟁·오발송 자료나 제출 오류의 임시 기록은
                            임의로 수정·삭제하지 말고, 운영센터에 알린 뒤 수신과
                            처리방법을 확인해 주세요.
                        </p>
                    </section>
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 mt-6 w-full rounded-lg px-4 py-3 text-sm font-bold transition-colors"
                >
                    확인했어요
                </button>
            </DialogContent>
        </Dialog>
    );
}
