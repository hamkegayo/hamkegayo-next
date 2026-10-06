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
    regionDisplayLabel,
    TRANSPORT_LABEL,
    type ActivityRegion,
    type PartnerActivity,
} from "@/lib/partner-activity";
import { ActivityEditor } from "../../_components/activity-editor";
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
} from "../_actions/qualifications";
import {
    changePartnerEmail,
    updatePartnerBasicInfo,
} from "../_actions/basic-info";
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
import { PartnerEvidenceFiles } from "@/components/partner-evidence-files";

const QUAL_ICON: Record<QualificationIcon, LucideIcon> = {
    license: IdCard,
    education: HeartPulse,
    insurance: ShieldCheck,
    record: FileSearch,
};

type QualItem = Qualification & { pending?: boolean };

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
    initialActivity,
    activityRegions,
}: {
    initialQuals: QualificationView[];
    initialPhotoUrl: string | null;
    initialBasicInfo: PartnerBasicInfo;
    initialActivity: PartnerActivity;
    activityRegions: ActivityRegion[];
}) {
    const [email, setEmail] = useState(initialBasicInfo.email);
    const [phone, setPhone] = useState(initialBasicInfo.phone);
    const [phoneOpen, setPhoneOpen] = useState(false);
    const [intro, setIntro] = useState(initialBasicInfo.intro);
    const [savedIntro, setSavedIntro] = useState(initialBasicInfo.intro);
    const [basicInfoPending, startBasicInfoTransition] = useTransition();

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
        startQualTransition(async () => {
            const res = await deleteQualification(id);
            if (res.ok) {
                setQuals((prev) => prev.filter((q) => q.id !== id));
            } else {
                toast.error(res.message);
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

    const saveBasicInfo = () => {
        startBasicInfoTransition(async () => {
            const result = await updatePartnerBasicInfo(intro);
            if (!result.ok) {
                toast.error(result.message);
                return;
            }
            setSavedIntro(intro);
            toast.success("자기소개가 저장되었습니다.");
        });
    };

    const cancelBasicInfo = () => {
        setIntro(savedIntro);
        toast.info("자기소개 변경을 취소했습니다.");
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
                    <p className="text-muted-foreground mt-2">
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
                            <p className="text-muted-foreground mt-2 text-xs">
                                JPG, PNG (최대 2MB)
                            </p>
                        </div>
                    </Card>

                    <div className="border-border bg-background rounded-2xl border p-5">
                        <p className="text-foreground flex items-center gap-2 font-bold">
                            <Headphones className="text-brand size-4" />
                            파트너 고객센터
                        </p>
                        <p className="text-foreground mt-3 text-xl font-extrabold">
                            {COMPANY.tel}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
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
                        <dl className="mb-4 space-y-2 text-sm">
                            <div>
                                <dt className="text-muted-foreground">이름</dt>
                                <dd className="font-bold">
                                    {initialBasicInfo.name ||
                                        "등록된 정보 없음"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">
                                    생년월일
                                </dt>
                                <dd>등록된 정보 없음</dd>
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
                        <p className="text-muted-foreground mt-1.5 text-xs font-medium">
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
                        <p className="text-brand mt-1.5 text-xs font-medium">
                            변경 시 인증이 필요합니다.
                        </p>

                        <label className="text-foreground mt-4 block text-sm font-bold">
                            자기소개
                        </label>
                        <textarea
                            value={intro}
                            onChange={(e) =>
                                setIntro(e.target.value.slice(0, 300))
                            }
                            maxLength={300}
                            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 mt-1.5 min-h-28 w-full resize-y rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                        />
                        <div className="mt-1 flex items-center justify-between gap-3">
                            <p className="text-muted-foreground text-xs">
                                {intro.length} / 300
                            </p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={cancelBasicInfo}
                                    disabled={
                                        basicInfoPending || intro === savedIntro
                                    }
                                    className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50"
                                >
                                    되돌리기
                                </button>
                                <button
                                    type="button"
                                    onClick={saveBasicInfo}
                                    disabled={
                                        basicInfoPending || intro === savedIntro
                                    }
                                    className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-5 py-2 text-sm font-bold transition-colors disabled:opacity-50"
                                >
                                    {basicInfoPending
                                        ? "저장 중…"
                                        : "자기소개 저장"}
                                </button>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            <ActivityEditor
                value={activity}
                saved={savedActivity}
                regionInfo={regionInfo}
                onRegionInfo={addRegionInfo}
                onChange={setActivity}
                onSaved={setSavedActivity}
            />

            <div className="mt-8">
                {/* 자격 및 보유 사항 */}
                <Card
                    title="자격 및 보유 사항"
                    hint="(인증 정보)"
                    action={
                        <AddButton
                            label="추가"
                            onClick={() => setQualAddOpen(true)}
                        />
                    }
                >
                    <ul className="space-y-3">
                        {quals.map((q) => {
                            const Icon = QUAL_ICON[q.icon] ?? Award;
                            return (
                                <li
                                    key={q.id}
                                    className="border-border flex items-center gap-3 rounded-xl border p-4"
                                >
                                    <span className="bg-brand/10 text-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
                                        <Icon className="size-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-foreground font-bold">
                                            {q.title}
                                        </p>
                                        <p className="text-muted-foreground truncate text-xs">
                                            {q.detail}
                                        </p>
                                        <PartnerEvidenceFiles
                                            id={q.id}
                                            kind="QUALIFICATION"
                                        />
                                    </div>
                                    {q.pending ? (
                                        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-600 dark:bg-amber-500/15">
                                            인증 대기
                                        </span>
                                    ) : (
                                        <VerifiedBadge />
                                    )}
                                    {q.pending && (
                                        <button
                                            type="button"
                                            aria-label="자격 삭제"
                                            disabled={qualPending}
                                            onClick={() => removeQual(q.id)}
                                            className="text-muted-foreground hover:bg-muted flex size-7 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50"
                                        >
                                            <X className="size-4" />
                                        </button>
                                    )}
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
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:bg-emerald-500/15">
            <Check className="size-3" strokeWidth={3} />
            인증 완료
        </span>
    );
}
