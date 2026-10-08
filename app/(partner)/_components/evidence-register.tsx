"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { EVIDENCE_MAX_SIZE, type EvidenceUpload } from "@/lib/partner-evidence";
import { submitPartnerEvidence } from "../partner/_actions/evidence";

const initial = {
    type: "",
    regNo: "",
    date: "",
    issuer: "",
    hospital: "",
    department: "",
    duties: "",
    startedOn: "",
    endedOn: "",
    currentJob: false,
};
export function EvidenceRegister({
    enabled,
    onRegistered,
}: {
    enabled: boolean;
    onRegistered?: () => Promise<void>;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [kind, setKind] = useState("QUALIFICATION");
    const [input, setInput] = useState(initial);
    const [files, setFiles] = useState<File[]>([]);
    const [pending, setPending] = useState(false);
    const [fileKey, setFileKey] = useState(0);
    const router = useRouter();
    const submit = async () => {
        if (pending || !enabled) return;
        if (
            !files.length ||
            files.length > 5 ||
            files.some(
                (f) =>
                    f.size < 1 ||
                    f.size > EVIDENCE_MAX_SIZE ||
                    !["image/jpeg", "image/png", "application/pdf"].includes(
                        f.type,
                    ),
            )
        ) {
            toast.error(
                "JPG·PNG·PDF를 1~5개, 파일당 최대 5MB로 첨부해 주세요.",
            );
            return;
        }
        setPending(true);
        const client = createClient();
        const uploads: EvidenceUpload[] = [];
        let saved = false;
        let uncertain = false;
        try {
            const {
                data: { user },
            } = await client.auth.getUser();
            if (!user) {
                toast.error("로그인이 필요합니다.");
                return;
            }
            for (const file of files) {
                const ext = {
                    "image/jpeg": "jpg",
                    "image/png": "png",
                    "application/pdf": "pdf",
                }[file.type];
                const path = `${user.id}/evidence/${crypto.randomUUID()}.${ext}`;
                const uploaded = await client.storage
                    .from("partner-qualifications")
                    .upload(path, file, {
                        contentType: file.type,
                        upsert: false,
                    });
                if (uploaded.error) throw new Error("upload_failed");
                uploads.push({ path, filename: file.name });
            }
            // Vercel 요청 본문에는 파일 원문을 싣지 않는다. 서버가 비공개 객체를 다시 검증한다.
            uncertain = true;
            const result = await submitPartnerEvidence(kind, input, uploads);
            uncertain = false;
            if (!result.ok) {
                toast.error(result.message);
                return;
            }
            saved = true;
            setInput(initial);
            setFiles([]);
            setFileKey((k) => k + 1);
            toast.success(
                "증빙을 등록했습니다. 관리자 심사 전에는 인증 대기로 표시됩니다.",
            );
            if (onRegistered) await onRegistered();
            else router.refresh();
        } catch {
            toast.error(
                "등록 결과를 확인하지 못했습니다. 새로고침하여 등록 여부를 확인해 주세요.",
            );
        } finally {
            // 통신 오류로 저장 여부가 불명확한 경우 실제 등록된 파일을 지우지 않는다.
            if (!saved && !uncertain && uploads.length)
                await client.storage
                    .from("partner-qualifications")
                    .remove(uploads.map((f) => f.path));
            setPending(false);
        }
    };
    const field = (
        key: Exclude<keyof typeof initial, "currentJob">,
        label: string,
        type = "text",
        max = 100,
    ) => (
        <label className="block text-sm font-semibold" key={key}>
            {label}
            <input
                type={type}
                required={!["regNo", "issuer"].includes(key)}
                maxLength={max}
                value={input[key]}
                disabled={pending || !enabled}
                onChange={(e) => setInput({ ...input, [key]: e.target.value })}
                className="mt-1 w-full rounded-lg border p-3 font-normal"
            />
        </label>
    );
    return (
        <section className="bg-background rounded-2xl border p-6">
            <h2 className="text-lg font-bold">자격·경력 증빙 등록</h2>
            <p className="mt-3 text-sm leading-relaxed">
                증빙 원본은 최초 심사 결과 통지 후 30일간 보관합니다. 기간 내
                이의신청은 처리 종료까지 파기를 보류합니다.{" "}
                <Link href="/partner-evidence-notice" className="underline">
                    수집·보유·파기 안내
                </Link>
                를 확인해 주세요.
            </p>
            {!enabled && (
                <p role="status" className="text-muted-foreground mt-3 text-sm">
                    추가 증빙 등록은 수집 고지 확인 후 제공됩니다. 기존 등록
                    자료와 심사 상태는 유지됩니다.
                </p>
            )}
            <p className="text-description-foreground mt-3 text-sm leading-relaxed">
                주민등록번호 뒷자리·주소 등 불필요한 개인정보를 가려 주세요.
                환자·이용자 정보는 제출하지 마세요. 원본은 본인과 권한 있는 심사
                담당자만 확인합니다.
            </p>
            <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                }}
            >
                <label className="block text-sm font-semibold">
                    등록 유형
                    <select
                        value={kind}
                        disabled={pending || !enabled}
                        onChange={(e) => setKind(e.target.value)}
                        className="mt-1 w-full rounded-lg border p-3"
                    >
                        <option value="QUALIFICATION">자격</option>
                        <option value="MEDICAL">의료기관 근무 경력</option>
                        <option value="COMPANION">병원동행 경력</option>
                    </select>
                </label>
                {kind === "QUALIFICATION" ? (
                    <>
                        {field("type", "자격 종류")}
                        {field("regNo", "자격·면허번호")}
                        {field("date", "취득일", "date")}
                        {field("issuer", "발급기관")}
                    </>
                ) : (
                    <>
                        {field("hospital", "근무기관")}
                        {field("department", "직무")}
                        {field("duties", "담당 업무", "text", 300)}
                        {field("startedOn", "시작일", "date")}
                        <label className="flex gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={input.currentJob}
                                disabled={pending || !enabled}
                                onChange={(e) =>
                                    setInput({
                                        ...input,
                                        currentJob: e.target.checked,
                                        endedOn: "",
                                    })
                                }
                            />
                            현재 재직 중
                        </label>
                        {!input.currentJob &&
                            field("endedOn", "종료일", "date")}
                    </>
                )}
                <label className="block text-sm font-semibold">
                    증빙 파일 (1~5개, 파일당 최대 5MB)
                    <input
                        ref={fileRef}
                        key={fileKey}
                        type="file"
                        multiple
                        disabled={pending || !enabled}
                        accept="image/jpeg,image/png,application/pdf"
                        onChange={(e) =>
                            setFiles(Array.from(e.target.files ?? []))
                        }
                        className="sr-only"
                    />
                </label>
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={pending || !enabled}
                    className="rounded-lg border px-5 py-3 text-sm font-bold disabled:opacity-50"
                >
                    파일 선택{files.length ? "·다시 선택" : ""}
                </button>
                <ul className="text-muted-foreground text-sm">
                    {files.map((f, i) => (
                        <li
                            key={`${f.name}-${i}`}
                            className="mt-2 flex items-start justify-between gap-3 rounded-lg border p-3"
                        >
                            <span className="min-w-0 break-all">{f.name}</span>
                            <button
                                type="button"
                                disabled={pending}
                                aria-label={`${f.name} 선택 제거`}
                                onClick={() => {
                                    setFiles((previous) =>
                                        previous.filter(
                                            (_, index) => index !== i,
                                        ),
                                    );
                                    setFileKey((k) => k + 1);
                                }}
                                className="text-destructive shrink-0 underline disabled:opacity-50"
                            >
                                선택 제거
                            </button>
                        </li>
                    ))}
                </ul>
                <p className="text-sm leading-relaxed">
                    선택 제거는 등록 전 파일만 제외합니다. 등록 후에는 아래
                    내역에서 미심사 등록 취소·증빙 삭제를 이용합니다. 심사·결과
                    통지된 자료는 보유기간·이의신청 절차 또는 고객센터로
                    수정·삭제를 요청해 주세요.
                </p>
                <button
                    type="submit"
                    disabled={pending || !enabled}
                    className="bg-brand text-brand-foreground cursor-pointer rounded-lg px-5 py-3 font-bold disabled:opacity-50"
                >
                    {pending ? "등록 중…" : "증빙 등록"}
                </button>
            </form>
        </section>
    );
}
