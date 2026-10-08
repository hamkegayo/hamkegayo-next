"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
    Award,
    Check,
    Eye,
    FileSearch,
    Headphones,
    HeartPulse,
    IdCard,
    Plus,
    ShieldCheck,
    Upload,
    X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import {
    activityTimeLabels,
    EMPTY_ACTIVITY,
    regionDisplayLabel,
    TRANSPORT_LABEL,
    type ActivityRegion,
    type PartnerActivity,
} from "@/lib/partner-activity";
import { ActivityEditor } from "../../_components/activity-editor";
import type { ActivityLoad } from "../../_lib/activity-load";
import type { IdentityCheckView } from "../../_lib/identity.server";
import { BirthDateField } from "../../_components/birth-date-field";
import {
    PARTNER_PROFILE,
    type Qualification,
    type QualificationIcon,
} from "../../_lib/profile";
import type { QualificationView } from "../../_lib/qualifications.server";
import type { PartnerBasicInfo } from "../../_lib/basic-info.server";
import {
    addQualification,
    deleteQualification,
    getMyQualifications,
} from "../_actions/qualifications";
import { changePartnerEmail } from "../_actions/basic-info";
import {
    deleteProfilePhoto,
    uploadProfilePhoto,
} from "../_actions/profile-photo";
import { ProfilePhotoModal } from "../../_components/profile-photo-modal";
import { VerifyChangeModal } from "../../_components/verify-change-modal";
import { PhoneChangeModal } from "../../_components/phone-change-modal";
import {
    QualificationAddModal,
    type QualificationInput,
} from "../../_components/qualification-add-modal";
import { ProfilePreviewModal } from "../../_components/profile-preview-modal";
import { COMPANY } from "@/lib/legal/company";
import { ConfirmModal, Modal } from "@/components/ui/modal";
import { PartnerEvidenceFiles } from "@/components/partner-evidence-files";
import { EvidenceRegister } from "../../_components/evidence-register";
import { PublicProfileEditor } from "../../_components/public-profile-editor";
import { getPartnerPublicProfile } from "../_actions/public-profile";
import { savePartnerProfile } from "../_actions/profile";
import type { PartnerPublicProfile } from "@/lib/partner-details";

const QUAL_ICON: Record<QualificationIcon, LucideIcon> = {
    license: IdCard,
    education: HeartPulse,
    insurance: ShieldCheck,
    record: FileSearch,
};

type QualItem = Qualification &
    Partial<Pick<QualificationView, "regNo" | "acquiredDate" | "issuer">> & {
        pending?: boolean;
    };

/** "20251010"·"2025-10-10" → "2025.10.10". 형식을 알 수 없으면 입력값 그대로. */
function qualDate(value: string): string {
    const d = value.replace(/\D/g, "");
    return d.length === 8
        ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`
        : value;
}

/* ---------- 재사용 UI ---------- */

function Card({
    title,
    hint,
    action,
    children,
    className,
}: {
    title: string;
    hint?: React.ReactNode;
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section
            className={cn(
                "border-border bg-background rounded-2xl border p-6",
                className,
            )}
        >
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <h2 className="text-foreground flex min-w-0 items-center gap-1.5 text-lg font-bold">
                    <span className="truncate">{title}</span>
                    {hint && (
                        <span className="text-muted-foreground shrink-0 text-sm font-normal">
                            {hint}
                        </span>
                    )}
                </h2>
                {action}
            </div>
            <div className="mt-4">{children}</div>
        </section>
    );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="border-brand bg-background text-brand hover:bg-brand/5 inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors"
        >
            <Plus className="size-4" />
            {label}
        </button>
    );
}

/* ---------- 페이지 ---------- */

export function PartnerProfileView({
    initialQuals,
    initialPhotoUrl,
    initialBasicInfo,
    activityLoad,
    identity,
    publicProfile,
    evidenceEnabled,
}: {
    initialQuals: QualificationView[];
    initialPhotoUrl: string | null;
    initialBasicInfo: PartnerBasicInfo;
    activityLoad: ActivityLoad;
    identity: IdentityCheckView;
    publicProfile: PartnerPublicProfile | null;
    evidenceEnabled: boolean;
}) {
    const [publicInfo, setPublicInfo] = useState(publicProfile);
    const [evidenceRevision, setEvidenceRevision] = useState(0);
    const [saveMessage, setSaveMessage] = useState("");
    /** 저장·되돌리기 완료 안내. 확인하면 저장된 값으로 새로고침한다. */
    const [doneNotice, setDoneNotice] = useState<string | null>(null);
    const [withdrawTarget, setWithdrawTarget] = useState<QualItem | null>(null);
    const [email, setEmail] = useState(initialBasicInfo.email);
    const [phone, setPhone] = useState(initialBasicInfo.phone);
    const [phoneOpen, setPhoneOpen] = useState(false);
    const [intro, setIntro] = useState(initialBasicInfo.intro);
    const [savedIntro, setSavedIntro] = useState(initialBasicInfo.intro);
    const [basicInfoPending, startBasicInfoTransition] = useTransition();

    // 불러오기 실패면 편집기를 열지 않는다. 빈 값으로 보이면 저장 때 기존 값을 지운다 (#231 리뷰).
    const initialActivity = activityLoad.ok
        ? activityLoad.activity
        : EMPTY_ACTIVITY;
    const activityRegions = activityLoad.ok ? activityLoad.regions : [];
    const [activity, setActivity] = useState<PartnerActivity>(initialActivity);
    const [savedActivity, setSavedActivity] =
        useState<PartnerActivity>(initialActivity);
    const [regionInfo, setRegionInfo] = useState<
        Record<string, ActivityRegion>
    >(() => Object.fromEntries(activityRegions.map((r) => [r.code, r])));
    const addRegionInfo = (rows: ActivityRegion[]) =>
        setRegionInfo((prev) => ({
            ...prev,
            ...Object.fromEntries(rows.map((r) => [r.code, r])),
        }));
    const [quals, setQuals] = useState<QualItem[]>(initialQuals);
    const [qualPending, startQualTransition] = useTransition();

    const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl);
    const [photoPending, startPhotoTransition] = useTransition();

    // 모달 상태
    const [emailOpen, setEmailOpen] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [photoOpen, setPhotoOpen] = useState(false);
    const [qualAddOpen, setQualAddOpen] = useState(false);

    const addQual = (v: QualificationInput, file: File) => {
        const fd = new FormData();
        fd.append("type", v.type);
        fd.append("regNo", v.regNo);
        fd.append("date", v.date);
        fd.append("issuer", v.issuer);
        fd.append("file", file);
        startQualTransition(async () => {
            const res = await addQualification(fd);
            if (res.ok) {
                setQuals((prev) => [res.qualification, ...prev]);
                setQualAddOpen(false);
                toast.info("추가한 자격은 관리자 심사 후 인증됩니다.");
            } else {
                toast.error(res.message);
            }
        });
    };

    const removeQual = (id: string) => {
        setWithdrawTarget(null);
        startQualTransition(async () => {
            try {
                const res = await deleteQualification(id);
                if (res.ok) {
                    setQuals((prev) => prev.filter((q) => q.id !== id));
                    toast.success("등록을 취소하고 첨부 증빙을 삭제했습니다.");
                } else {
                    toast.error(res.message);
                }
            } catch {
                toast.error(
                    "등록 취소 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.",
                );
            }
        });
    };

    const savePhoto = (file: File) => {
        const fd = new FormData();
        fd.append("file", file);
        startPhotoTransition(async () => {
            const res = await uploadProfilePhoto(fd);
            if (res.ok) {
                setPhotoUrl(res.url || null);
                setPhotoOpen(false);
                toast.success("프로필 사진이 변경되었습니다.");
            } else {
                toast.error(res.message);
            }
        });
    };

    const removePhoto = () => {
        startPhotoTransition(async () => {
            const res = await deleteProfilePhoto();
            if (res.ok) {
                setPhotoUrl(null);
                setPhotoOpen(false);
                toast.success("프로필 사진을 삭제했습니다.");
            } else {
                toast.error(res.message);
            }
        });
    };

    const profileDirty =
        intro !== savedIntro ||
        JSON.stringify(activity) !== JSON.stringify(savedActivity);
    const saveProfile = () => {
        const snapshot = { intro, activity };
        setSaveMessage("");
        startBasicInfoTransition(async () => {
            try {
                const result = await savePartnerProfile(
                    snapshot.intro,
                    activityLoad.ok ? snapshot.activity : null,
                );
                if (!result.ok) {
                    setSaveMessage(result.message);
                    toast.error(result.message);
                    return;
                }
                setSavedIntro(snapshot.intro);
                if (activityLoad.ok) setSavedActivity(snapshot.activity);
                setSaveMessage("프로필을 저장했습니다.");
                setDoneNotice("프로필을 저장했습니다.");
            } catch {
                const message =
                    "저장 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다. 다시 저장해 주세요.";
                setSaveMessage(message);
                toast.error(message);
            }
        });
    };
    const refreshEvidence = async () => {
        const [nextQuals, nextPublic] = await Promise.all([
            getMyQualifications(),
            getPartnerPublicProfile(),
        ]);
        setQuals(nextQuals);
        setPublicInfo(nextPublic);
        setEvidenceRevision((n) => n + 1);
    };

    const saveVerifiedEmail = async (nextEmail: string) => {
        const result = await changePartnerEmail(nextEmail);
        if (result.ok) setEmail(nextEmail.trim().toLowerCase());
        return result;
    };

    const roleLine = "병원 동행 파트너";

    return (
        <div>
            {/* 헤더 */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                        My 프로필
                    </h1>
                    <p className="text-description-foreground mt-2 leading-relaxed">
                        파트너 정보를 관리할 수 있습니다.
                    </p>
                </div>
                <div className="flex shrink-0 gap-2">
                    <button
                        type="button"
                        onClick={() => setPreviewOpen(true)}
                        className="border-border bg-background text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-bold transition-colors"
                    >
                        <Eye className="size-4" />
                        미리보기
                    </button>
                </div>
            </div>

            {/* 상단: 프로필 사진 / 기본 정보 */}
            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
                {/* 프로필 사진 + 고객센터 */}
                <div className="space-y-5 lg:col-span-3">
                    <Card title="프로필 사진">
                        <div className="flex flex-col items-center">
                            <Avatar
                                src={photoUrl}
                                alt="내 프로필 사진"
                                className="bg-muted size-32"
                                iconClassName="text-muted-foreground"
                            />
                            <button
                                type="button"
                                onClick={() => setPhotoOpen(true)}
                                className="border-border bg-background text-foreground hover:bg-muted mt-4 inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-bold transition-colors"
                            >
                                <Upload className="size-4" />
                                사진 변경
                            </button>
                            <p className="text-description-foreground mt-2 text-sm leading-relaxed">
                                JPG, PNG (최대 2MB)
                            </p>
                        </div>
                    </Card>

                    <div className="border-border bg-background rounded-2xl border p-5">
                        <p className="text-foreground flex items-center gap-2 leading-relaxed font-bold">
                            <Headphones className="text-brand size-4" />
                            파트너 고객센터
                        </p>
                        <p className="text-foreground mt-3 text-xl leading-relaxed font-extrabold">
                            {COMPANY.tel}
                        </p>
                        <p className="text-description-foreground mt-1 text-sm leading-relaxed">
                            {COMPANY.hours}
                        </p>
                        <Link
                            href="/partner"
                            className="text-brand mt-3 inline-flex items-center gap-1 text-sm font-bold"
                        >
                            FAQ 바로가기 →
                        </Link>
                    </div>
                </div>

                {/* 기본 정보 */}
                <div className="lg:col-span-9">
                    <Card
                        title="기본 정보"
                        hint="(수정 가능)"
                        className="h-full"
                    >
                        <dl className="mb-4 space-y-4 text-sm">
                            <div>
                                <dt className="text-muted-foreground">이름</dt>
                                <dd className="mt-1 font-bold">
                                    {initialBasicInfo.name ||
                                        "등록된 정보 없음"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">
                                    생년월일
                                </dt>
                                <dd className="mt-1.5">
                                    <BirthDateField initial={identity} />
                                </dd>
                            </div>
                        </dl>
                        <label className="text-foreground text-sm font-bold">
                            연락처 <span className="text-destructive">*</span>
                        </label>
                        <div className="mt-1.5 flex gap-2">
                            <input
                                type="tel"
                                value={phone}
                                readOnly
                                className="border-input bg-muted text-muted-foreground min-w-0 flex-1 rounded-lg border px-3.5 py-2.5 text-sm outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setPhoneOpen(true)}
                                className="border-brand bg-background text-brand hover:bg-brand/5 shrink-0 rounded-lg border px-3.5 text-sm font-bold transition-colors"
                            >
                                이메일 인증 변경
                            </button>
                        </div>
                        <p className="text-description-foreground mt-1.5 text-sm leading-relaxed font-medium">
                            등록된 연락용 이메일 인증 후 변경합니다. 휴대폰 소유
                            인증은 아닙니다.
                        </p>

                        <label className="text-foreground mt-4 block text-sm font-bold">
                            이메일 <span className="text-destructive">*</span>
                        </label>
                        <div className="mt-1.5 flex gap-2">
                            <input
                                type="email"
                                value={email}
                                readOnly
                                className="border-input bg-background min-w-0 flex-1 rounded-lg border px-3.5 py-2.5 text-sm outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setEmailOpen(true)}
                                className="border-brand bg-background text-brand hover:bg-brand/5 shrink-0 rounded-lg border px-3.5 text-sm font-bold transition-colors"
                            >
                                인증 변경
                            </button>
                        </div>
                        <p className="text-brand mt-1.5 text-sm leading-relaxed font-medium">
                            변경 시 인증이 필요합니다.
                        </p>

                        <label
                            htmlFor="partnerIntro"
                            className="text-foreground mt-4 block text-sm font-bold"
                        >
                            자기소개
                        </label>
                        <textarea
                            id="partnerIntro"
                            aria-label="자기소개"
                            disabled={basicInfoPending}
                            value={intro}
                            onChange={(e) =>
                                setIntro(e.target.value.slice(0, 300))
                            }
                            maxLength={300}
                            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 mt-1.5 min-h-28 w-full resize-y rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                        />
                        <div className="mt-1 flex items-center justify-between gap-3">
                            <p className="text-description-foreground text-sm leading-relaxed">
                                {intro.length} / 300
                            </p>
                        </div>
                    </Card>
                </div>
            </div>

            {activityLoad.ok ? (
                <ActivityEditor
                    value={activity}
                    regionInfo={regionInfo}
                    regionsUnavailable={
                        activityLoad.ok && activityLoad.regionsUnavailable
                    }
                    onRegionInfo={addRegionInfo}
                    onChange={setActivity}
                    disabled={basicInfoPending}
                />
            ) : (
                <div
                    role="alert"
                    className="border-border bg-background mt-8 rounded-2xl border p-6"
                >
                    <h2 className="text-foreground text-xl font-extrabold">
                        활동 정보
                    </h2>
                    <p className="text-destructive mt-2 text-sm leading-relaxed break-keep">
                        활동 정보를 불러오지 못했습니다. 저장된 정보를 지키기
                        위해 수정을 잠시 막았습니다. 새로고침 후 다시 시도해
                        주세요.
                    </p>
                </div>
            )}

            <div className="mt-8">
                <EvidenceRegister
                    enabled={evidenceEnabled}
                    onRegistered={refreshEvidence}
                />
            </div>
            <div className="mt-8">
                {/* 자격 및 보유 사항 */}
                <Card
                    title="자격 및 보유 사항"
                    hint="(인증 정보)"
                    action={
                        !evidenceEnabled && (
                            <AddButton
                                label="추가"
                                onClick={() => setQualAddOpen(true)}
                            />
                        )
                    }
                >
                    <p className="text-sm leading-relaxed">
                        심사 전 등록은 취소할 수 있습니다. 심사·결과 통지된
                        자료는 보유기간과 이의신청 처리를 위해 직접 삭제할 수
                        없습니다. 수정·삭제 요청은 아래 보유기간·이의신청 메뉴
                        또는 고객센터로 문의해 주세요.
                    </p>
                    {quals.length === 0 && (
                        <p className="mt-4 text-sm leading-relaxed">
                            등록된 자격 없음
                        </p>
                    )}
                    <ul className="mt-4 space-y-3">
                        {quals.map((q) => {
                            const Icon = QUAL_ICON[q.icon] ?? Award;
                            const fields = [
                                ["자격·면허번호", q.regNo],
                                [
                                    "취득일",
                                    q.acquiredDate && qualDate(q.acquiredDate),
                                ],
                                ["발급기관", q.issuer],
                            ] as const;
                            return (
                                <li
                                    key={q.id}
                                    className="border-border overflow-hidden rounded-xl border"
                                >
                                    <div className="flex items-start gap-3 p-4 sm:p-5">
                                        <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-lg">
                                            <Icon className="size-5" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-foreground text-base leading-snug font-bold break-keep">
                                                    {q.title}
                                                </p>
                                                {q.pending ? (
                                                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-sm font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                                                        인증 대기
                                                    </span>
                                                ) : (
                                                    <VerifiedBadge />
                                                )}
                                            </div>
                                            {q.regNo === undefined ? (
                                                <p className="text-foreground mt-2 text-sm leading-relaxed break-words">
                                                    {q.detail}
                                                </p>
                                            ) : (
                                                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-3">
                                                    {fields.map(
                                                        ([label, value]) => (
                                                            <div
                                                                key={label}
                                                                className="flex gap-3 sm:block"
                                                            >
                                                                <dt className="text-muted-foreground w-24 shrink-0 text-sm sm:w-auto">
                                                                    {label}
                                                                </dt>
                                                                <dd
                                                                    className={cn(
                                                                        "min-w-0 text-sm break-words sm:mt-0.5",
                                                                        value
                                                                            ? "text-foreground font-semibold"
                                                                            : "text-muted-foreground",
                                                                    )}
                                                                >
                                                                    {value ||
                                                                        "미입력"}
                                                                </dd>
                                                            </div>
                                                        ),
                                                    )}
                                                </dl>
                                            )}
                                        </div>
                                    </div>
                                    <div className="border-border bg-muted/30 border-t px-4 pt-1 pb-4 sm:px-5">
                                        <PartnerEvidenceFiles
                                            id={q.id}
                                            kind="QUALIFICATION"
                                        />
                                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                                            {q.pending ? (
                                                <button
                                                    type="button"
                                                    aria-label={`${q.title} 등록 취소·증빙 삭제`}
                                                    disabled={qualPending}
                                                    onClick={() =>
                                                        setWithdrawTarget(q)
                                                    }
                                                    className="border-destructive/40 bg-background text-destructive hover:bg-destructive/5 inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <X className="size-4" />
                                                    등록 취소·증빙 삭제
                                                </button>
                                            ) : (
                                                <Link
                                                    href="/partner-evidence-notice"
                                                    className="border-border bg-background text-foreground hover:bg-muted inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors"
                                                >
                                                    수정·삭제 절차
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </Card>
            </div>

            {/* 모달 */}
            <PhoneChangeModal
                open={phoneOpen}
                onClose={() => setPhoneOpen(false)}
                onChanged={setPhone}
            />
            <VerifyChangeModal
                open={emailOpen}
                onClose={() => setEmailOpen(false)}
                onVerified={saveVerifiedEmail}
            />
            <QualificationAddModal
                pending={qualPending}
                open={qualAddOpen}
                onClose={() => setQualAddOpen(false)}
                onAdd={addQual}
                types={PARTNER_PROFILE.qualificationTypes}
            />
            <div className="mt-8">
                <PublicProfileEditor
                    key={evidenceRevision}
                    initial={publicInfo}
                    evidenceEnabled={evidenceEnabled}
                />
            </div>
            <div className="border-border bg-background mt-8 rounded-2xl border p-6">
                <p className="text-sm leading-relaxed">
                    자기소개와 활동 정보를 함께 저장합니다. 연락처 인증,
                    본인확인, 사진·증빙 등록과 공개 동의는 각 항목의 버튼으로
                    처리합니다.
                </p>
                <div className="mt-4 flex flex-wrap justify-end gap-3">
                    <button
                        type="button"
                        disabled={basicInfoPending || !profileDirty}
                        onClick={() => {
                            setIntro(savedIntro);
                            setActivity(savedActivity);
                            setSaveMessage("변경사항을 되돌렸습니다.");
                            setDoneNotice("변경사항을 되돌렸습니다.");
                        }}
                        className="border-border bg-background text-foreground hover:bg-muted cursor-pointer rounded-lg border px-5 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        변경사항 되돌리기
                    </button>
                    <button
                        type="button"
                        disabled={basicInfoPending || !profileDirty}
                        onClick={saveProfile}
                        className="bg-brand text-brand-foreground hover:bg-brand/90 cursor-pointer rounded-lg px-6 py-3 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {basicInfoPending ? "저장 중…" : "프로필 저장"}
                    </button>
                </div>
                <p
                    role="status"
                    aria-live="polite"
                    className="mt-3 text-sm leading-relaxed"
                >
                    {basicInfoPending
                        ? "프로필을 저장하고 있습니다."
                        : saveMessage}
                </p>
            </div>

            <ConfirmModal
                open={withdrawTarget !== null}
                onClose={() => setWithdrawTarget(null)}
                onConfirm={() =>
                    withdrawTarget && removeQual(withdrawTarget.id)
                }
                title="등록을 취소할까요?"
                description={
                    <>
                        {withdrawTarget?.title} 등록을 취소하고 첨부한 증빙
                        파일을 삭제합니다. 취소 후에는 되돌릴 수 없습니다.
                    </>
                }
                cancelLabel="돌아가기"
                confirmLabel="등록 취소"
                tone="destructive"
                confirmDisabled={qualPending}
            />
            {/* 저장·되돌리기 완료 안내. 확인하면 서버에 저장된 값으로 새로고침한다. */}
            <Modal
                open={doneNotice !== null}
                onClose={() => window.location.reload()}
                className="max-w-sm"
            >
                <p
                    role="alert"
                    className="text-foreground text-center text-lg font-extrabold"
                >
                    {doneNotice}
                </p>
                <button
                    type="button"
                    autoFocus
                    onClick={() => window.location.reload()}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 mt-6 w-full cursor-pointer rounded-lg px-4 py-3 text-sm font-bold transition-colors"
                >
                    확인
                </button>
            </Modal>
            <ProfilePhotoModal
                open={photoOpen}
                onClose={() => setPhotoOpen(false)}
                currentUrl={photoUrl}
                pending={photoPending}
                onSave={savePhoto}
                onDelete={removePhoto}
            />
            <ProfilePreviewModal
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                photoUrl={photoUrl}
                name={initialBasicInfo.name}
                roleLine={roleLine}
                intro={intro}
                regions={activity.regions.flatMap((code) => {
                    const r = regionInfo[code];
                    return r ? [regionDisplayLabel(r.fullName, r.level)] : [];
                })}
                transports={activity.transports.map((t) => TRANSPORT_LABEL[t])}
                mobility={activity.mobility}
                times={activityTimeLabels(activity.times)}
                preferredHospitals={activity.hospitals}
            />
        </div>
    );
}

function VerifiedBadge() {
    return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-sm font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            <Check className="size-3" strokeWidth={3} />
            인증 완료
        </span>
    );
}
