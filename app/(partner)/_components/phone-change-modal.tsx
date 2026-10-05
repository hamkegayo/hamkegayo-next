"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import {
    requestPartnerPhoneCode,
    verifyPartnerPhoneCode,
} from "../partner/_actions/phone-change";

export function PhoneChangeModal({
    open,
    onClose,
    onChanged,
}: {
    open: boolean;
    onClose: () => void;
    onChanged: (phone: string) => void;
}) {
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [requestId, setRequestId] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [retryAt, setRetryAt] = useState(0);
    const close = () => {
        if (pending) return;
        setPhone("");
        setCode("");
        setRequestId(null);
        onClose();
    };
    const request = async () => {
        if (pending) return;
        if (Date.now() < retryAt) {
            toast.error("발송 후 60초가 지나면 다시 요청할 수 있습니다.");
            return;
        }
        setPending(true);
        try {
            const result = await requestPartnerPhoneCode(phone);
            if (!result.ok) {
                toast.error(result.message);
                return;
            }
            setRequestId(result.id!);
            setCode("");
            setRetryAt(Date.now() + 60000);
            toast.success("등록된 연락용 이메일로 인증번호를 보냈습니다.");
        } catch {
            toast.error("인증번호 발송에 실패했습니다.");
        } finally {
            setPending(false);
        }
    };
    const verify = async () => {
        if (pending || !requestId) return;
        setPending(true);
        try {
            const result = await verifyPartnerPhoneCode(requestId, phone, code);
            if (!result.ok) {
                toast.error(result.message);
                return;
            }
            onChanged(phone.replace(/\D/g, ""));
            setPhone("");
            setCode("");
            setRequestId(null);
            onClose();
            toast.success("연락처가 변경되었습니다.");
        } catch {
            toast.error("변경에 실패했습니다. 다시 확인해 주세요.");
        } finally {
            setPending(false);
        }
    };
    return (
        <Modal open={open} onClose={close} className="max-w-sm">
            <h3 className="text-lg font-bold">이메일 인증 후 연락처 변경</h3>
            <p className="text-muted-foreground mt-2 text-sm">
                등록하고 인증한 연락용 이메일로 인증번호를 보냅니다. 이메일이
                없다면 먼저 이메일을 인증해 주세요. 휴대폰 소유 인증은 아닙니다.
            </p>
            <label className="mt-4 block text-sm">
                새 휴대폰 번호
                <input
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    disabled={pending}
                    onChange={(e) => {
                        setPhone(e.target.value);
                        setRequestId(null);
                        setCode("");
                    }}
                    className="border-input mt-2 w-full rounded-lg border p-3"
                />
            </label>
            <button
                type="button"
                disabled={pending}
                onClick={request}
                className="border-border mt-3 w-full cursor-pointer rounded-lg border p-3 disabled:opacity-50"
            >
                인증번호 발송 / 재발송
            </button>
            <label className="mt-4 block text-sm">
                인증번호 (5분간 유효)
                <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    disabled={pending || !requestId}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="border-input mt-2 w-full rounded-lg border p-3"
                />
            </label>
            <div className="mt-5 flex gap-3">
                <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    className="border-border flex-1 rounded-lg border p-3"
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={verify}
                    disabled={pending || !requestId || code.length !== 6}
                    className="bg-brand text-brand-foreground flex-1 cursor-pointer rounded-lg p-3 disabled:opacity-50"
                >
                    {pending ? "처리 중…" : "인증 후 변경"}
                </button>
            </div>
        </Modal>
    );
}
