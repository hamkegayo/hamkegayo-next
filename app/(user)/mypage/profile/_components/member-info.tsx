"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ui/modal";
import { updateProfileName } from "../../_actions/profile";
import { reconsentAll } from "../../_actions/agreements";
import { deleteCareRecipient } from "../../_actions/care";
import type { CareRecipient } from "../../_lib/care.server";
import type { AgreementView } from "../../_lib/agreements.server";
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

export function MemberInfo({
    basic,
    recipients,
    agreements,
}: {
    basic: Basic;
    recipients: CareRecipient[];
    agreements: AgreementView[];
}) {
    const router = useRouter();
    const [editingName, setEditingName] = useState(false);
    const [reconsenting, startReconsent] = useTransition();
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
                    {/*
                     * 이력이 없는 항목이 있을 때만 안내한다.
                     * 동의 이력 원장(#58)은 2026-09 에 신설됐고, 그 이전 가입자는
                     * 받은 동의가 남아 있지 않다. 설명 없이 "기록 없음" 만 보이면
                     * 동의를 안 한 것으로 오해한다.
                     */}
                    {/*
                     * 개정본 재동의 — 대상이 있을 때만 띄운다.
                     * 항목마다 버튼을 두지 않는 이유: 처리방침이 개정되면
                     * PRIVACY·PERSONAL·SENSITIVE 세 항목이 함께 밀린다.
                     * 같은 개정에 세 번 누르게 할 이유가 없다.
                     */}
                    {agreements.some((a) => a.agreedLabel && !a.isCurrent) && (
                        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3.5 dark:bg-amber-950/30">
                            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                                개정된 문서가 있습니다.
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                                변경된 내용을 확인하신 뒤 다시 동의해 주세요.
                                기존 동의 기록은 그대로 보관됩니다.
                            </p>
                            <button
                                type="button"
                                disabled={reconsenting}
                                aria-busy={reconsenting}
                                onClick={() =>
                                    startReconsent(async () => {
                                        const res = await reconsentAll();
                                        if (res.ok) {
                                            toast.success(
                                                "재동의가 완료되었습니다.",
                                            );
                                            router.refresh();
                                        } else {
                                            toast.error(res.message);
                                        }
                                    })
                                }
                                className="mt-3 rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
                            >
                                {reconsenting ? "처리 중…" : "다시 동의하기"}
                            </button>
                        </div>
                    )}

                    {agreements.some((a) => !a.agreedLabel) && (
                        <p className="bg-muted/40 text-muted-foreground mb-4 rounded-lg px-4 py-3 text-xs leading-relaxed">
                            동의 이력 저장 기능이 도입된 2026년 9월 이전에
                            가입하신 경우 &lsquo;기록 없음&rsquo; 으로
                            표시됩니다.
                        </p>
                    )}
                    <div className="divide-border divide-y">
                        {agreements.map((a) => (
                            <div
                                key={a.type}
                                className="flex items-center justify-between gap-3 py-3.5"
                            >
                                <div className="min-w-0">
                                    <span className="text-foreground text-sm font-medium">
                                        {a.label}
                                    </span>
                                    {a.agreedLabel && (
                                        <p className="text-muted-foreground text-xs">
                                            {a.agreedLabel} 동의
                                            {!a.isCurrent &&
                                                " · 개정본 재동의 필요"}
                                        </p>
                                    )}
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                    <span
                                        className={cn(
                                            "text-sm font-semibold",
                                            a.agreedLabel
                                                ? a.isCurrent
                                                    ? "text-emerald-600"
                                                    : "text-amber-600"
                                                : "text-muted-foreground",
                                        )}
                                    >
                                        {a.agreedLabel
                                            ? a.isCurrent
                                                ? "동의 완료"
                                                : "재동의 필요"
                                            : "기록 없음"}
                                    </span>
                                    <Link
                                        href={a.href}
                                        className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-3.5 py-2 text-sm font-bold transition-colors"
                                    >
                                        약관 보기
                                    </Link>
                                </div>
                            </div>
                        ))}
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
