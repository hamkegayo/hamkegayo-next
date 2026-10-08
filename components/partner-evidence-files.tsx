"use client";
import { useState } from "react";
import { toast } from "sonner";
import { openPartnerEvidence } from "@/app/(partner)/partner/_actions/evidence";
import { EvidenceRetentionControls } from "@/components/evidence-retention-controls";

export function PartnerEvidenceFiles({
    id,
    kind,
    admin = false,
}: {
    id: string;
    kind: "QUALIFICATION" | "HISTORY";
    admin?: boolean;
}) {
    const [reason, setReason] = useState("");
    const [pending, setPending] = useState(false);
    const [links, setLinks] = useState<{ filename: string; url: string }[]>([]);
    const [expiresAt, setExpiresAt] = useState(0);
    return (
        <div className="mt-3 space-y-2">
            <EvidenceRetentionControls id={id} kind={kind} admin={admin} />
            {admin && (
                <label className="block text-sm">
                    증빙 열람 사유
                    <input
                        value={reason}
                        maxLength={500}
                        onChange={(e) => setReason(e.target.value)}
                        className="mt-1 block w-full rounded-lg border p-2"
                    />
                </label>
            )}
            <button
                type="button"
                disabled={pending || (admin && reason.trim().length < 5)}
                onClick={async () => {
                    setPending(true);
                    setLinks([]);
                    try {
                        const result = await openPartnerEvidence(
                            id,
                            kind,
                            reason,
                        );
                        if (!result.ok) {
                            toast.error(result.message);
                            return;
                        }
                        setLinks(result.links);
                        setExpiresAt(Date.now() + result.expiresIn * 1000);
                        if (!result.links.length)
                            toast.info(
                                "열람할 증빙이 없습니다. 보유기간 종료 또는 기존 별도 제출 여부를 확인해 주세요.",
                            );
                    } catch {
                        toast.error("증빙 조회에 실패했습니다.");
                    } finally {
                        setPending(false);
                    }
                }}
                className="text-brand cursor-pointer text-sm underline disabled:opacity-50"
            >
                {pending ? "확인 중…" : "증빙 확인"}
            </button>
            <ul className="space-y-1 text-sm">
                {links.map((file) => (
                    <li key={file.url}>
                        <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                                if (Date.now() >= expiresAt) {
                                    e.preventDefault();
                                    setLinks([]);
                                    toast.info(
                                        "열람 링크가 만료되었습니다. 다시 확인해 주세요.",
                                    );
                                }
                            }}
                            className="text-brand break-all underline"
                        >
                            {file.filename}
                        </a>
                    </li>
                ))}
            </ul>
            {links.length > 0 && (
                <p className="text-description-foreground text-sm leading-relaxed">
                    링크는 5분간 유효합니다. 원본은 고객에게 공개하지 않습니다.
                </p>
            )}
        </div>
    );
}
