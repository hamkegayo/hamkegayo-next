"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";

export type QualificationInput = {
    type: string;
    regNo: string;
    date: string;
    issuer: string;
    proof: string;
};

const inputCls =
    "mt-1.5 w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

export function QualificationAddModal({
    open,
    onClose,
    onAdd,
    types,
}: {
    open: boolean;
    onClose: () => void;
    onAdd: (v: QualificationInput) => void;
    types: string[];
}) {
    const [type, setType] = useState(types[0] ?? "");
    const [regNo, setRegNo] = useState("");
    const [date, setDate] = useState("");
    const [issuer, setIssuer] = useState("");
    const [proof, setProof] = useState("");

    const close = () => {
        setType(types[0] ?? "");
        setRegNo("");
        setDate("");
        setIssuer("");
        setProof("");
        onClose();
    };

    const submit = () => {
        if (!type) return;
        onAdd({ type, regNo, date, issuer, proof });
        toast.info("추가한 자격은 관리자 심사 후 인증됩니다.");
        close();
    };

    return (
        <Modal open={open} onClose={close} className="max-w-md">
            <div className="flex items-start justify-between">
                <h3 className="text-foreground text-lg font-extrabold">
                    자격 / 보유 사항 추가
                </h3>
                <button
                    type="button"
                    onClick={close}
                    aria-label="닫기"
                    className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-full transition-colors"
                >
                    <X className="size-5" />
                </button>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
                추가한 자격은 관리자 심사 후 인증됩니다. 심사 전에는 &lsquo;인증
                대기&rsquo;로 표시됩니다.
            </p>

            <div className="mt-5">
                <label className="text-foreground text-sm font-bold">
                    자격 종류
                </label>
                <div className="relative mt-1.5">
                    <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 w-full appearance-none rounded-lg border px-3.5 py-2.5 pr-10 text-sm outline-none focus-visible:ring-[3px]"
                    >
                        {types.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2" />
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                    <label className="text-foreground text-sm font-bold">
                        등록번호
                    </label>
                    <input
                        type="text"
                        value={regNo}
                        onChange={(e) => setRegNo(e.target.value)}
                        placeholder="예) RN-2025-0000"
                        className={inputCls}
                    />
                </div>
                <div>
                    <label className="text-foreground text-sm font-bold">
                        취득일
                    </label>
                    <input
                        type="text"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        placeholder="YYYY.MM.DD"
                        className={inputCls}
                    />
                </div>
            </div>

            <div className="mt-4">
                <label className="text-foreground text-sm font-bold">
                    발급 기관
                </label>
                <input
                    type="text"
                    value={issuer}
                    onChange={(e) => setIssuer(e.target.value)}
                    placeholder="예) 한국보건의료인국가시험원"
                    className={inputCls}
                />
            </div>

            <div className="mt-4">
                <label className="text-foreground text-sm font-bold">
                    증빙 자료
                </label>
                <input
                    type="text"
                    value={proof}
                    onChange={(e) => setProof(e.target.value)}
                    placeholder="증빙 서류명 또는 발급번호를 입력하세요"
                    className={inputCls}
                />
            </div>

            <div className="mt-6 flex gap-3">
                <button
                    type="button"
                    onClick={close}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={submit}
                    className={cn(
                        "flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors",
                        type
                            ? "bg-brand text-brand-foreground hover:bg-brand/90"
                            : "bg-muted text-muted-foreground cursor-not-allowed",
                    )}
                >
                    추가하기
                </button>
            </div>
        </Modal>
    );
}
