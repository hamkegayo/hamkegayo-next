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
    Lock,
    Plus,
    ShieldCheck,
    Upload,
    X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar } from "@/components/ui/avatar";
import {
    PARTNER_PROFILE,
    type Qualification,
    type QualificationIcon,
} from "../../_lib/profile";
import type { QualificationView } from "../../_lib/qualifications.server";
import {
    addQualification,
    deleteQualification,
} from "../_actions/qualifications";
import {
    deleteProfilePhoto,
    uploadProfilePhoto,
} from "../_actions/profile-photo";
import { ProfilePhotoModal } from "../../_components/profile-photo-modal";
import { SimpleAddModal } from "../../_components/simple-add-modal";
import { VerifyChangeModal } from "../../_components/verify-change-modal";
import {
    QualificationAddModal,
    type QualificationInput,
} from "../../_components/qualification-add-modal";
import { ProfilePreviewModal } from "../../_components/profile-preview-modal";

const QUAL_ICON: Record<QualificationIcon, LucideIcon> = {
    license: IdCard,
    education: HeartPulse,
    insurance: ShieldCheck,
    record: FileSearch,
};

type CheckItem = { label: string; checked: boolean };
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

function CheckList({
    items,
    onToggle,
}: {
    items: CheckItem[];
    onToggle: (idx: number) => void;
}) {
    return (
        <div className="space-y-3">
            {items.map((it, idx) => (
                <label
                    key={it.label}
                    className="text-foreground flex cursor-pointer items-center gap-2.5 text-sm"
                >
                    <Checkbox
                        checked={it.checked}
                        onCheckedChange={() => onToggle(idx)}
                    />
                    {it.label}
                </label>
            ))}
        </div>
    );
}

/* ---------- 페이지 ---------- */

export function PartnerProfileView({
    initialQuals,
    initialPhotoUrl,
}: {
    initialQuals: QualificationView[];
    initialPhotoUrl: string | null;
}) {
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [intro, setIntro] = useState(PARTNER_PROFILE.intro);

    const [regions, setRegions] = useState<CheckItem[]>(
        PARTNER_PROFILE.regions,
    );
    const [times, setTimes] = useState<CheckItem[]>(PARTNER_PROFILE.times);
    const [transports, setTransports] = useState<CheckItem[]>(
        PARTNER_PROFILE.transports,
    );
    const [mobility, setMobility] = useState<CheckItem[]>(
        PARTNER_PROFILE.mobilityAssist,
    );
    const [hospitals, setHospitals] = useState<string[]>(
        PARTNER_PROFILE.preferredHospitals,
    );
    const [quals, setQuals] = useState<QualItem[]>(initialQuals);
    const [qualPending, startQualTransition] = useTransition();

    const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl);
    const [photoPending, startPhotoTransition] = useTransition();

    // 모달 상태
    const [contactOpen, setContactOpen] = useState(false);
    const [emailOpen, setEmailOpen] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [photoOpen, setPhotoOpen] = useState(false);
    const [regionAddOpen, setRegionAddOpen] = useState(false);
    const [timeAddOpen, setTimeAddOpen] = useState(false);
    const [hospitalAddOpen, setHospitalAddOpen] = useState(false);
    const [qualAddOpen, setQualAddOpen] = useState(false);

    const toggle =
        (setter: React.Dispatch<React.SetStateAction<CheckItem[]>>) =>
        (idx: number) =>
            setter((prev) =>
                prev.map((it, i) =>
                    i === idx ? { ...it, checked: !it.checked } : it,
                ),
            );

    const addChecked =
        (setter: React.Dispatch<React.SetStateAction<CheckItem[]>>) =>
        (label: string) =>
            setter((prev) =>
                prev.some((it) => it.label === label)
                    ? prev
                    : [...prev, { label, checked: true }],
            );

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

    const roleLine = `${PARTNER_PROFILE.role} · 병원 동행 경력 ${PARTNER_PROFILE.companionYears}년`;

    return (
        <div className="pb-24">
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
                    <button
                        type="button"
                        onClick={() =>
                            toast.success("프로필이 저장되었습니다.")
                        }
                        className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-5 py-2 text-sm font-bold transition-colors"
                    >
                        저장
                    </button>
                </div>
            </div>

            {/* 상단: 프로필 사진 / 기본 정보 / 인증 정보 */}
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
                            02-1234-5678
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                            평일 09:00 ~ 18:00
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
                <div className="lg:col-span-5">
                    <Card
                        title="기본 정보"
                        hint="(수정 가능)"
                        className="h-full"
                    >
                        <label className="text-foreground text-sm font-bold">
                            연락처 <span className="text-destructive">*</span>
                        </label>
                        <div className="mt-1.5 flex gap-2">
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 min-w-0 flex-1 rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                            />
                            <button
                                type="button"
                                onClick={() => setContactOpen(true)}
                                className="border-brand bg-background text-brand hover:bg-brand/5 shrink-0 rounded-lg border px-3.5 text-sm font-bold transition-colors"
                            >
                                인증 변경
                            </button>
                        </div>
                        <p className="text-brand mt-1.5 text-xs font-medium">
                            변경 시 인증이 필요합니다.
                        </p>

                        <label className="text-foreground mt-4 block text-sm font-bold">
                            이메일 <span className="text-destructive">*</span>
                        </label>
                        <div className="mt-1.5 flex gap-2">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 min-w-0 flex-1 rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
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
                        <p className="text-muted-foreground mt-1 text-right text-xs">
                            {intro.length} / 300
                        </p>
                    </Card>
                </div>

                {/* 인증 정보 */}
                <div className="lg:col-span-4">
                    <Card
                        title="인증 정보"
                        hint={
                            <span className="inline-flex items-center gap-1">
                                (수정 불가)
                                <Lock className="size-3.5" />
                            </span>
                        }
                        className="h-full"
                    >
                        <dl className="divide-border divide-y">
                            {PARTNER_PROFILE.verification.map((row) => (
                                <div
                                    key={row.label}
                                    className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                                >
                                    <dt className="text-muted-foreground shrink-0 text-sm">
                                        {row.label}
                                    </dt>
                                    <dd className="flex min-w-0 items-center gap-2">
                                        <span className="text-foreground font-bold break-keep">
                                            {row.value}
                                        </span>
                                        <VerifiedBadge />
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </Card>
                </div>
            </div>

            {/* 활동 정보 */}
            <h2 className="text-foreground mt-8 text-xl font-extrabold">
                활동 정보
            </h2>

            <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3">
                <Card
                    title="활동 지역"
                    hint="(수정 가능)"
                    action={
                        <AddButton
                            label="지역 추가"
                            onClick={() => setRegionAddOpen(true)}
                        />
                    }
                >
                    <CheckList items={regions} onToggle={toggle(setRegions)} />
                </Card>

                <Card
                    title="활동 가능 시간"
                    hint="(수정 가능)"
                    action={
                        <AddButton
                            label="시간 추가"
                            onClick={() => setTimeAddOpen(true)}
                        />
                    }
                >
                    <CheckList items={times} onToggle={toggle(setTimes)} />
                </Card>

                <Card title="활동 가능 이동수단" hint="(수정 가능)">
                    <CheckList
                        items={transports}
                        onToggle={toggle(setTransports)}
                    />
                </Card>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
                <Card title="휠체어/보행 보조 가능 여부" hint="(수정 가능)">
                    <CheckList
                        items={mobility}
                        onToggle={toggle(setMobility)}
                    />
                </Card>

                <Card
                    title="선호 병원"
                    hint="(수정 가능)"
                    className="md:col-span-2"
                >
                    <div className="flex flex-wrap items-center gap-2">
                        {hospitals.map((h) => (
                            <span
                                key={h}
                                className="bg-brand/10 text-brand inline-flex items-center gap-1.5 rounded-full py-1.5 pr-2 pl-3 text-sm font-semibold"
                            >
                                {h}
                                <button
                                    type="button"
                                    aria-label={`${h} 삭제`}
                                    onClick={() =>
                                        setHospitals((prev) =>
                                            prev.filter((x) => x !== h),
                                        )
                                    }
                                    className="hover:bg-brand/20 rounded-full p-0.5 transition-colors"
                                >
                                    <X className="size-3.5" />
                                </button>
                            </span>
                        ))}
                        <button
                            type="button"
                            onClick={() => setHospitalAddOpen(true)}
                            className="border-brand text-brand hover:bg-brand/5 inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-sm font-bold transition-colors"
                        >
                            <Plus className="size-3.5" />
                            병원 추가
                        </button>
                    </div>
                    <p className="text-muted-foreground mt-3 text-xs">
                        * 해당 병원에서의 동행 경험이 많아 더 빠르고 편안한
                        서비스를 제공할 수 있습니다.
                    </p>
                </Card>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                {/* 근무했던 병원 리스트 */}
                <Card title="근무했던 병원 리스트" hint="(인증 정보)">
                    <ul className="space-y-3">
                        {PARTNER_PROFILE.workHistory.map((w) => (
                            <li
                                key={w.hospital}
                                className="border-border rounded-xl border p-4"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-foreground font-bold">
                                        {w.hospital}
                                    </p>
                                    <Lock className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                                </div>
                                <dl className="mt-2 space-y-1 text-xs">
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground shrink-0">
                                            근무 기간
                                        </dt>
                                        <dd className="text-foreground text-right font-semibold">
                                            {w.period} ({w.duration})
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground shrink-0">
                                            부서
                                        </dt>
                                        <dd className="text-foreground text-right">
                                            {w.dept}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground shrink-0">
                                            담당 업무
                                        </dt>
                                        <dd className="text-foreground text-right">
                                            {w.role}
                                        </dd>
                                    </div>
                                </dl>
                            </li>
                        ))}
                    </ul>
                    <p className="text-muted-foreground mt-3 text-xs">
                        * 인증된 정보는 수정이 불가합니다.
                    </p>
                </Card>

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

            {/* 하단 액션 */}
            <div className="mt-8 flex gap-3">
                <button
                    type="button"
                    onClick={() => toast.info("변경 사항을 취소했습니다.")}
                    className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-10 py-3.5 text-sm font-bold transition-colors"
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={() => toast.success("프로필이 저장되었습니다.")}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 flex-1 rounded-lg px-4 py-3.5 text-sm font-bold transition-colors"
                >
                    저장
                </button>
            </div>

            {/* 모달 */}
            <VerifyChangeModal
                open={contactOpen}
                onClose={() => setContactOpen(false)}
                kind="연락처"
            />
            <VerifyChangeModal
                open={emailOpen}
                onClose={() => setEmailOpen(false)}
                kind="이메일"
            />
            <SimpleAddModal
                open={regionAddOpen}
                onClose={() => setRegionAddOpen(false)}
                onAdd={addChecked(setRegions)}
                title="활동 지역 추가"
                description="새로 추가할 항목을 입력해주세요."
                label="활동 지역"
                placeholder="예) 용인시 수지구"
            />
            <SimpleAddModal
                open={timeAddOpen}
                onClose={() => setTimeAddOpen(false)}
                onAdd={addChecked(setTimes)}
                title="활동 가능 시간 추가"
                description="새로 추가할 항목을 입력해주세요."
                label="활동 가능 시간"
                placeholder="예) 평일 새벽 (06:00 ~ 09:00)"
            />
            <SimpleAddModal
                open={hospitalAddOpen}
                onClose={() => setHospitalAddOpen(false)}
                onAdd={(v) =>
                    setHospitals((prev) =>
                        prev.includes(v) ? prev : [...prev, v],
                    )
                }
                title="선호 병원 추가"
                description="동행 경험이 많은 병원을 추가해주세요."
                label="병원명"
                placeholder="예) 강북삼성병원"
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
                name={PARTNER_PROFILE.name}
                roleLine={roleLine}
                intro={intro}
                regions={regions.filter((r) => r.checked).map((r) => r.label)}
                times={times.filter((t) => t.checked).map((t) => t.label)}
                preferredHospitals={hospitals}
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
