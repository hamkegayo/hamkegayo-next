"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, UserRound } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ui/modal";
import { updateProfileName } from "../../_actions/profile";
import { deleteCareRecipient } from "../../_actions/care";
import type { CareRecipient } from "../../_lib/care.server";
import { CareRecipientModal } from "./care-recipient-modal";

type Basic = {
    name: string;
    email: string;
    phone: string;
    phoneVerified: boolean;
};

const notReady = () => toast.info("준비 중인 기능입니다.");

function Card({
    title,
    action,
    children,
}: {
    title: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
            <div className="mb-5 flex items-center justify-between">
                <h2 className="text-foreground text-lg font-bold">{title}</h2>
                {action}
            </div>
            {children}
        </div>
    );
}

function OutlineButton({
    children,
    onClick,
}: {
    children: React.ReactNode;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick ?? notReady}
            className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-3.5 py-2 text-sm font-bold transition-colors"
        >
            {children}
        </button>
    );
}

const AGREEMENTS = [
    { label: "서비스 이용 약관 동의", required: true },
    { label: "개인정보 수집 및 이용 동의", required: true },
    { label: "결제 이용 동의", required: true },
];

export function MemberInfo({
    basic,
    recipients,
}: {
    basic: Basic;
    recipients: CareRecipient[];
}) {
    const router = useRouter();
    const [marketing, setMarketing] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [nameInput, setNameInput] = useState(basic.name);
    const [pending, startTransition] = useTransition();

    // 환자 정보 관리 상태
    const [careOpen, setCareOpen] = useState(false);
    const [editingCare, setEditingCare] = useState<CareRecipient | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<CareRecipient | null>(
        null,
    );
    const [careDeleting, startCareDelete] = useTransition();

    const openAddCare = () => {
        setEditingCare(null);
        setCareOpen(true);
    };
    const openEditCare = (r: CareRecipient) => {
        setEditingCare(r);
        setCareOpen(true);
    };
    const onDeleteCare = () => {
        if (!deleteTarget) return;
        const id = deleteTarget.id;
        startCareDelete(async () => {
            const res = await deleteCareRecipient(id);
            setDeleteTarget(null);
            if (res.ok) {
                toast.success("환자 정보를 삭제했습니다.");
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    };

    const onSaveName = () => {
        startTransition(async () => {
            const res = await updateProfileName(nameInput);
            if (res.ok) {
                setEditingName(false);
                toast.success("이름이 수정되었습니다.");
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    };

    const onCancelName = () => {
        setNameInput(basic.name);
        setEditingName(false);
    };

    const infoRows = [
        { label: "이메일", value: basic.email },
        { label: "휴대폰번호", value: basic.phone, phone: true },
        { label: "비밀번호", value: "**********" },
    ];

    return (
        <div>
            <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                회원 정보
            </h1>

            <div className="mt-6 space-y-5">
                {/* 기본 정보 */}
                <Card
                    title="기본 정보"
                    action={
                        editingName ? (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={onSaveName}
                                    disabled={pending}
                                    className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-3.5 py-2 text-sm font-bold transition-colors disabled:opacity-60"
                                >
                                    저장
                                </button>
                                <OutlineButton onClick={onCancelName}>
                                    취소
                                </OutlineButton>
                            </div>
                        ) : (
                            <OutlineButton
                                onClick={() => {
                                    setNameInput(basic.name);
                                    setEditingName(true);
                                }}
                            >
                                수정하기
                            </OutlineButton>
                        )
                    }
                >
                    <dl className="space-y-3">
                        {/* 이름 (편집 가능) */}
                        <div className="flex items-center gap-4 text-sm">
                            <dt className="text-muted-foreground w-24 shrink-0 font-semibold">
                                이름
                            </dt>
                            <dd className="text-foreground flex-1 font-medium">
                                {editingName ? (
                                    <input
                                        type="text"
                                        value={nameInput}
                                        onChange={(e) =>
                                            setNameInput(e.target.value)
                                        }
                                        maxLength={20}
                                        autoFocus
                                        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 w-full max-w-xs rounded-lg border px-3 py-1.5 text-sm outline-none focus-visible:ring-[3px]"
                                    />
                                ) : (
                                    basic.name
                                )}
                            </dd>
                        </div>
                        {infoRows.map((r) => (
                            <div
                                key={r.label}
                                className="flex items-center gap-4 text-sm"
                            >
                                <dt className="text-muted-foreground w-24 shrink-0 font-semibold">
                                    {r.label}
                                </dt>
                                <dd className="text-foreground flex items-center gap-2 font-medium">
                                    {r.value}
                                    {r.phone &&
                                        (basic.phoneVerified ? (
                                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/15">
                                                인증 완료
                                            </span>
                                        ) : (
                                            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                                                미인증
                                            </span>
                                        ))}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </Card>

                {/* 결제 수단 관리 */}
                <Card
                    title="결제 수단 관리"
                    action={<OutlineButton>카드 추가하기</OutlineButton>}
                >
                    <p className="text-muted-foreground text-sm font-semibold">
                        등록된 카드
                    </p>
                    <div className="bg-muted/40 mt-3 flex items-center gap-4 rounded-xl p-4">
                        <div className="bg-brand/10 text-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
                            <CreditCard className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-foreground font-bold">
                                신한카드
                            </p>
                            <p className="text-muted-foreground text-xs">
                                유효기간 08/27
                            </p>
                        </div>
                        <p className="text-foreground hidden text-sm font-semibold tracking-wider sm:block">
                            **** **** **** 1234
                        </p>
                        <span className="bg-background text-muted-foreground shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold">
                            기본 카드
                        </span>
                    </div>
                </Card>

                {/* 환자 정보 관리 */}
                <Card
                    title="환자 정보 관리"
                    action={
                        <OutlineButton onClick={openAddCare}>
                            환자 추가하기
                        </OutlineButton>
                    }
                >
                    {recipients.length === 0 ? (
                        <div className="text-muted-foreground rounded-xl border border-dashed px-6 py-10 text-center text-sm">
                            등록된 환자가 없어요. &lsquo;환자 추가하기&rsquo;로
                            자주 동행하는 분을 저장해 두세요.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {recipients.map((r) => {
                                const detail = [
                                    r.relation,
                                    r.ageLabel,
                                    r.genderLabel,
                                ]
                                    .filter(Boolean)
                                    .join(" | ");
                                return (
                                    <div
                                        key={r.id}
                                        className="bg-muted/40 flex items-center gap-3 rounded-xl p-4"
                                    >
                                        <div className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-full">
                                            <UserRound className="size-5" />
                                        </div>
                                        <div className="min-w-0 flex-1 text-sm">
                                            <span className="text-foreground font-bold">
                                                {r.name}
                                            </span>
                                            {detail && (
                                                <span className="text-muted-foreground">
                                                    {" "}
                                                    &nbsp;|&nbsp; {detail}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 gap-2">
                                            <OutlineButton
                                                onClick={() => openEditCare(r)}
                                            >
                                                수정
                                            </OutlineButton>
                                            <OutlineButton
                                                onClick={() =>
                                                    setDeleteTarget(r)
                                                }
                                            >
                                                삭제
                                            </OutlineButton>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>

                {/* 약관 동의 관리 */}
                <Card title="약관 동의 관리">
                    <div className="divide-border divide-y">
                        {AGREEMENTS.map((a) => (
                            <div
                                key={a.label}
                                className="flex items-center justify-between gap-3 py-3.5"
                            >
                                <span className="text-foreground text-sm font-medium">
                                    {a.label}
                                </span>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-semibold text-emerald-600">
                                        동의 완료
                                    </span>
                                    <OutlineButton>약관 보기</OutlineButton>
                                </div>
                            </div>
                        ))}

                        {/* 마케팅 (토글) */}
                        <div className="flex items-center justify-between gap-3 py-3.5">
                            <span className="text-foreground text-sm font-medium">
                                마케팅 정보 수신 동의 (선택)
                            </span>
                            <div className="flex items-center gap-3">
                                <span
                                    className={cn(
                                        "text-sm font-semibold",
                                        marketing
                                            ? "text-emerald-600"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {marketing ? "동의 완료" : "미동의"}
                                </span>
                                <OutlineButton>약관 보기</OutlineButton>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMarketing((v) => !v);
                                        toast.success(
                                            marketing
                                                ? "마케팅 수신 동의를 철회했습니다."
                                                : "마케팅 수신에 동의했습니다.",
                                        );
                                    }}
                                    className={cn(
                                        "rounded-lg px-3.5 py-2 text-sm font-bold transition-colors",
                                        marketing
                                            ? "border-border bg-background text-foreground hover:bg-muted border"
                                            : "bg-brand text-brand-foreground hover:bg-brand/90",
                                    )}
                                >
                                    {marketing ? "철회하기" : "동의하기"}
                                </button>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* 환자 추가/수정 모달 (열 때마다 새로 마운트 → 프리필 초기화) */}
            {careOpen && (
                <CareRecipientModal
                    open
                    onClose={() => setCareOpen(false)}
                    editing={editingCare}
                />
            )}

            {/* 환자 삭제 확인 */}
            <ConfirmModal
                open={deleteTarget !== null}
                onClose={() => setDeleteTarget(null)}
                onConfirm={onDeleteCare}
                title="환자 정보를 삭제할까요?"
                cancelLabel="취소"
                confirmLabel="삭제"
                confirmDisabled={careDeleting}
            >
                <p className="text-muted-foreground mt-3 text-left text-sm leading-relaxed">
                    <span className="text-foreground font-bold">
                        {deleteTarget?.name}
                    </span>{" "}
                    님의 정보를 삭제합니다. 되돌릴 수 없습니다.
                </p>
            </ConfirmModal>
        </div>
    );
}
