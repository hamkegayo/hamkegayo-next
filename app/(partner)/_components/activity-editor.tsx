"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
    ACTIVITY_DAYS,
    ACTIVITY_LIMITS,
    ACTIVITY_TIME_OPTIONS,
    MOBILITY_OPTIONS,
    TRANSPORT_OPTIONS,
    regionDisplayLabel,
    shortRegionLabel,
    toMinutes,
    validateActivity,
    type ActivityDay,
    type ActivityRegion,
    type PartnerActivity,
} from "@/lib/partner-activity";
import type { TransportCode } from "@/lib/handover";
import { savePartnerActivity } from "../partner/_actions/activity";

const DEFAULT_RANGE: [string, string] = ["09:00", "18:00"];

function Panel({
    title,
    hint,
    className,
    children,
}: {
    title: string;
    hint?: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <section
            className={cn(
                "border-border bg-background rounded-2xl border p-6",
                className,
            )}
        >
            <h3 className="text-foreground text-lg font-bold">{title}</h3>
            {hint && (
                <p className="text-muted-foreground mt-1 text-xs break-keep">
                    {hint}
                </p>
            )}
            <div className="mt-4">{children}</div>
        </section>
    );
}

function toggleIn<T>(list: T[], value: T): T[] {
    return list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value];
}

function sameActivity(a: PartnerActivity, b: PartnerActivity): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** 파트너 활동 정보 편집 (#226). 저장 버튼은 이 섹션만 저장한다. */
export function ActivityEditor({
    value,
    saved,
    regions,
    onChange,
    onSaved,
}: {
    value: PartnerActivity;
    saved: PartnerActivity;
    regions: ActivityRegion[];
    onChange: (next: PartnerActivity) => void;
    onSaved: (next: PartnerActivity) => void;
}) {
    const [pending, startTransition] = useTransition();
    const [query, setQuery] = useState("");
    const [hospital, setHospital] = useState("");

    const regionKeys = useMemo(
        () => new Set(regions.map((r) => r.key)),
        [regions],
    );
    const matches = useMemo(() => {
        const q = query.replace(/\s+/g, "");
        if (!q) return [];
        return regions
            .filter(
                (r) =>
                    !value.regions.includes(r.key) &&
                    (r.key.replace(/\s+/g, "").includes(q) ||
                        shortRegionLabel(r.key)
                            .replace(/\s+/g, "")
                            .includes(q)),
            )
            .slice(0, 8);
    }, [query, regions, value.regions]);

    const dirty = !sameActivity(value, saved);
    const set = (patch: Partial<PartnerActivity>) =>
        onChange({ ...value, ...patch });

    const addRegion = (key: string) => {
        if (value.regions.length >= ACTIVITY_LIMITS.regions) {
            toast.error(
                `활동 지역은 ${ACTIVITY_LIMITS.regions}곳까지 선택할 수 있습니다.`,
            );
            return;
        }
        set({ regions: [...value.regions, key] });
        setQuery("");
    };

    const setDay = (day: ActivityDay, next: [string, string] | null) =>
        set({ times: { ...value.times, [day]: next } });

    const addHospital = () => {
        const name = hospital.trim();
        if (!name) return;
        if (name.length > ACTIVITY_LIMITS.hospitalLength) {
            toast.error(
                `병원명은 ${ACTIVITY_LIMITS.hospitalLength}자까지 입력할 수 있습니다.`,
            );
            return;
        }
        if (value.hospitals.length >= ACTIVITY_LIMITS.hospitals) {
            toast.error(
                `선호 병원은 ${ACTIVITY_LIMITS.hospitals}곳까지 등록할 수 있습니다.`,
            );
            return;
        }
        if (!value.hospitals.includes(name))
            set({ hospitals: [...value.hospitals, name] });
        setHospital("");
    };

    const save = () => {
        const message = validateActivity(value, regionKeys);
        if (message) {
            toast.error(message);
            return;
        }
        startTransition(async () => {
            const result = await savePartnerActivity(value);
            if (!result.ok) {
                toast.error(result.message);
                return;
            }
            onSaved(value);
            toast.success("활동 정보를 저장했습니다.");
        });
    };

    return (
        <div className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-foreground text-xl font-extrabold">
                        활동 정보
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm break-keep">
                        조건에 맞는 동행 요청을 먼저 보여 드리는 데 씁니다. 비워
                        두면 모든 요청을 지금처럼 봅니다.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => onChange(saved)}
                        disabled={pending || !dirty}
                        className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50"
                    >
                        되돌리기
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={pending || !dirty}
                        className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-5 py-2 text-sm font-bold transition-colors disabled:opacity-50"
                    >
                        {pending ? "저장 중…" : "활동 정보 저장"}
                    </button>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
                <Panel
                    title="활동 지역"
                    hint={`전국 시·군·구에서 검색해 선택합니다. 시·도 전체도 고를 수 있습니다. (${value.regions.length}/${ACTIVITY_LIMITS.regions})`}
                >
                    <div className="relative">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && matches[0]) {
                                    e.preventDefault();
                                    addRegion(matches[0].key);
                                }
                            }}
                            placeholder="예) 강남구, 성남, 부산"
                            aria-label="활동 지역 검색"
                            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 w-full rounded-lg border py-2.5 pr-3.5 pl-9 text-sm outline-none focus-visible:ring-[3px]"
                        />
                        {matches.length > 0 && (
                            <ul
                                role="listbox"
                                aria-label="검색된 지역"
                                className="border-border bg-background absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border shadow-lg"
                            >
                                {matches.map((r) => (
                                    <li
                                        key={r.key}
                                        role="option"
                                        aria-selected={false}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => addRegion(r.key)}
                                            className="hover:bg-muted w-full px-3.5 py-2.5 text-left text-sm"
                                        >
                                            {r.sigungu ? (
                                                r.key
                                            ) : (
                                                <>
                                                    {r.key}{" "}
                                                    <span className="text-muted-foreground">
                                                        전체
                                                    </span>
                                                </>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    {value.regions.length === 0 ? (
                        <p className="text-muted-foreground mt-3 text-sm">
                            선택한 지역이 없습니다.
                        </p>
                    ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {value.regions.map((key) => (
                                <span
                                    key={key}
                                    className="bg-brand/10 text-brand inline-flex items-center gap-1.5 rounded-full py-1.5 pr-2 pl-3 text-sm font-semibold"
                                >
                                    {regionDisplayLabel(key)}
                                    <button
                                        type="button"
                                        aria-label={`${key} 삭제`}
                                        onClick={() =>
                                            set({
                                                regions: value.regions.filter(
                                                    (r) => r !== key,
                                                ),
                                            })
                                        }
                                        className="hover:bg-brand/20 rounded-full p-0.5 transition-colors"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel
                    title="활동 가능 시간"
                    hint="서비스 제공시간(07:00~19:00) 안에서 30분 단위로 고릅니다."
                >
                    <div className="space-y-3">
                        {ACTIVITY_DAYS.map((day) => {
                            const range = value.times[day.key];
                            return (
                                <div
                                    key={day.key}
                                    className="flex flex-wrap items-center gap-x-3 gap-y-2"
                                >
                                    <label className="text-foreground flex w-32 cursor-pointer items-center gap-2.5 text-sm font-semibold">
                                        <Checkbox
                                            checked={range !== null}
                                            onCheckedChange={(checked) =>
                                                setDay(
                                                    day.key,
                                                    checked
                                                        ? DEFAULT_RANGE
                                                        : null,
                                                )
                                            }
                                        />
                                        {day.label}
                                    </label>
                                    {range ? (
                                        <div className="flex items-center gap-2 text-sm">
                                            <select
                                                aria-label={`${day.label} 시작 시각`}
                                                value={range[0]}
                                                onChange={(e) => {
                                                    const start =
                                                        e.target.value;
                                                    // 시작이 종료를 넘으면 종료를 다음 칸으로 민다.
                                                    const end =
                                                        toMinutes(range[1]) >
                                                        toMinutes(start)
                                                            ? range[1]
                                                            : ACTIVITY_TIME_OPTIONS[
                                                                  ACTIVITY_TIME_OPTIONS.indexOf(
                                                                      start,
                                                                  ) + 1
                                                              ];
                                                    setDay(day.key, [
                                                        start,
                                                        end,
                                                    ]);
                                                }}
                                                className="border-input bg-background rounded-lg border px-2.5 py-2"
                                            >
                                                {ACTIVITY_TIME_OPTIONS.slice(
                                                    0,
                                                    -1,
                                                ).map((t) => (
                                                    <option key={t} value={t}>
                                                        {t}
                                                    </option>
                                                ))}
                                            </select>
                                            <span aria-hidden="true">~</span>
                                            <select
                                                aria-label={`${day.label} 종료 시각`}
                                                value={range[1]}
                                                onChange={(e) =>
                                                    setDay(day.key, [
                                                        range[0],
                                                        e.target.value,
                                                    ])
                                                }
                                                className="border-input bg-background rounded-lg border px-2.5 py-2"
                                            >
                                                {ACTIVITY_TIME_OPTIONS.filter(
                                                    (t) =>
                                                        toMinutes(t) >
                                                        toMinutes(range[0]),
                                                ).map((t) => (
                                                    <option key={t} value={t}>
                                                        {t}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <span className="text-muted-foreground text-sm">
                                            활동 안 함
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </Panel>

                <Panel
                    title="이동수단"
                    hint="함께 이동할 수 있는 수단입니다. 파트너는 차량을 운전하지 않습니다."
                >
                    <div className="space-y-3">
                        {TRANSPORT_OPTIONS.map((o) => (
                            <label
                                key={o.value}
                                className="text-foreground flex cursor-pointer items-center gap-2.5 text-sm"
                            >
                                <Checkbox
                                    checked={value.transports.includes(o.value)}
                                    onCheckedChange={() =>
                                        set({
                                            transports: toggleIn<TransportCode>(
                                                value.transports,
                                                o.value,
                                            ),
                                        })
                                    }
                                />
                                {o.label}
                            </label>
                        ))}
                    </div>
                </Panel>

                <Panel
                    title="지원 가능한 보행 상태"
                    hint="예약 시 고객이 선택하는 거동 상태와 같은 항목입니다."
                >
                    <div className="space-y-3">
                        {MOBILITY_OPTIONS.map((m) => (
                            <label
                                key={m}
                                className="text-foreground flex cursor-pointer items-center gap-2.5 text-sm"
                            >
                                <Checkbox
                                    checked={value.mobility.includes(m)}
                                    onCheckedChange={() =>
                                        set({
                                            mobility: toggleIn(
                                                value.mobility,
                                                m,
                                            ),
                                        })
                                    }
                                />
                                {m}
                            </label>
                        ))}
                    </div>
                </Panel>

                <Panel
                    title="선호 병원"
                    hint={`동행 경험이 많은 병원을 직접 입력합니다. (${value.hospitals.length}/${ACTIVITY_LIMITS.hospitals})`}
                    className="md:col-span-2"
                >
                    <div className="flex gap-2">
                        <input
                            value={hospital}
                            onChange={(e) => setHospital(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addHospital();
                                }
                            }}
                            maxLength={ACTIVITY_LIMITS.hospitalLength}
                            placeholder="예) 강북삼성병원"
                            aria-label="선호 병원 이름"
                            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 min-w-0 flex-1 rounded-lg border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                        />
                        <button
                            type="button"
                            onClick={addHospital}
                            disabled={!hospital.trim()}
                            className="border-brand bg-background text-brand hover:bg-brand/5 inline-flex shrink-0 items-center gap-1 rounded-lg border px-3.5 text-sm font-bold transition-colors disabled:opacity-50"
                        >
                            <Plus className="size-4" />
                            추가
                        </button>
                    </div>
                    {value.hospitals.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {value.hospitals.map((h) => (
                                <span
                                    key={h}
                                    className="bg-brand/10 text-brand inline-flex items-center gap-1.5 rounded-full py-1.5 pr-2 pl-3 text-sm font-semibold"
                                >
                                    {h}
                                    <button
                                        type="button"
                                        aria-label={`${h} 삭제`}
                                        onClick={() =>
                                            set({
                                                hospitals:
                                                    value.hospitals.filter(
                                                        (x) => x !== h,
                                                    ),
                                            })
                                        }
                                        className="hover:bg-brand/20 rounded-full p-0.5 transition-colors"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
}
