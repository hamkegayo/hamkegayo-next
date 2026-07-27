"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
    addCareRecipient,
    updateCareRecipient,
    type CareInput,
} from "../../_actions/care";
import type { CareRecipient } from "../../_lib/care.server";

const EMPTY: CareInput = {
    name: "",
    relation: "",
    gender: "",
    birth: "",
    phone: "",
};

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="text-muted-foreground text-sm font-semibold">
                {label}
            </span>
            <div className="mt-1.5">{children}</div>
        </label>
    );
}

const inputCls =
    "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-[3px]";

export function CareRecipientModal({
    open,
    onClose,
    editing,
}: {
    open: boolean;
    onClose: () => void;
    /** 수정 대상(없으면 추가 모드) */
    editing: CareRecipient | null;
}) {
    const router = useRouter();
    // 열릴 때마다 새로 마운트되므로 lazy 초기화로 프리필(수정)/빈값(추가) 세팅
    const [form, setForm] = useState<CareInput>(() =>
        editing
            ? {
                  name: editing.name,
                  relation: editing.relation,
                  gender: editing.gender,
                  birth: editing.birth,
                  phone: editing.phone,
              }
            : EMPTY,
    );
    const [pending, startTransition] = useTransition();

    const set = (patch: Partial<CareInput>) =>
        setForm((f) => ({ ...f, ...patch }));

    const onSubmit = () => {
        if (!form.name.trim()) {
            toast.error("이름을 입력해 주세요.");
            return;
        }
        startTransition(async () => {
            const res = editing
                ? await updateCareRecipient(editing.id, form)
                : await addCareRecipient(form);
            if (res.ok) {
                toast.success(
                    editing
                        ? "환자 정보를 수정했습니다."
                        : "환자를 추가했습니다.",
                );
                onClose();
                router.refresh();
            } else {
                toast.error(res.message);
            }
        });
    };

    return (
        <Modal open={open} onClose={onClose} className="max-w-md">
            <h3 className="text-foreground text-lg font-extrabold">
                {editing ? "환자 정보 수정" : "환자 추가"}
            </h3>

            <div className="mt-5 space-y-4">
                <Field label="이름">
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => set({ name: e.target.value })}
                        maxLength={20}
                        placeholder="이름"
                        className={inputCls}
                    />
                </Field>
                <Field label="관계">
                    <input
                        type="text"
                        value={form.relation}
                        onChange={(e) => set({ relation: e.target.value })}
                        maxLength={20}
                        placeholder="예: 어머니, 배우자"
                        className={inputCls}
                    />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="생년월일">
                        <input
                            type="date"
                            value={form.birth}
                            onChange={(e) => set({ birth: e.target.value })}
                            className={inputCls}
                        />
                    </Field>
                    <Field label="성별">
                        <div className="flex gap-2">
                            {(
                                [
                                    { key: "female", label: "여성" },
                                    { key: "male", label: "남성" },
                                ] as const
                            ).map((g) => (
                                <button
                                    key={g.key}
                                    type="button"
                                    onClick={() => set({ gender: g.key })}
                                    className={cn(
                                        "flex-1 rounded-lg border py-2 text-sm font-bold transition-colors",
                                        form.gender === g.key
                                            ? "border-brand bg-brand/10 text-brand"
                                            : "border-border bg-background text-muted-foreground hover:bg-muted",
                                    )}
                                >
                                    {g.label}
                                </button>
                            ))}
                        </div>
                    </Field>
                </div>
                <Field label="연락처 (선택)">
                    <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => set({ phone: e.target.value })}
                        maxLength={20}
                        placeholder="010-0000-0000"
                        className={inputCls}
                    />
                </Field>
            </div>

            <div className="mt-6 flex gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={pending}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors disabled:opacity-60"
                >
                    {editing ? "수정" : "추가"}
                </button>
            </div>
        </Modal>
    );
}
