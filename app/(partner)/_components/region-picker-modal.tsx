"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/checkbox";
import {
    ACTIVITY_LIMITS,
    addRegionSelection,
    coveredBySelection,
    regionDisplayLabel,
    type ActivityRegion,
} from "@/lib/partner-activity";
import {
    listActivityRegions,
    searchActivityRegions,
} from "../partner/_actions/activity";

/**
 * 활동 지역 계층 선택 (#226). 시·도 → 시·군·구 → (일반구) → 읍·면·동 순으로 내려가며 고른다.
 * 각 단계 맨 위의 "○○ 전체" 는 하위 전체를 뜻하고, 고르면 이미 고른 하위 지역은 빠진다.
 */
export function RegionPickerModal({
    initial,
    onClose,
    onApply,
}: {
    initial: ActivityRegion[];
    onClose: () => void;
    onApply: (selected: ActivityRegion[]) => void;
}) {
    // 열릴 때만 마운트된다(부모가 open 일 때만 그림). 그래서 초기값을 그대로 쓴다.
    const [draft, setDraft] = useState<ActivityRegion[]>(initial);
    const [path, setPath] = useState<ActivityRegion[]>([]);
    /** 상위 코드("" 는 전국) → 바로 아래 지역 */
    const [children, setChildren] = useState<Record<string, ActivityRegion[]>>(
        {},
    );
    const [query, setQuery] = useState("");
    const [found, setFound] = useState<{
        keyword: string;
        rows: ActivityRegion[];
    } | null>(null);

    const current = path.at(-1) ?? null;
    const parentKey = current?.code ?? "";
    const items = children[parentKey];
    const keyword = query.trim();
    const searching = keyword.replace(/\s/g, "").length >= 2;
    const results = searching && found?.keyword === keyword ? found.rows : null;

    useEffect(() => {
        if (children[parentKey]) return;
        let alive = true;
        listActivityRegions(current?.code ?? null).then((rows) => {
            if (alive) setChildren((prev) => ({ ...prev, [parentKey]: rows }));
        });
        return () => {
            alive = false;
        };
    }, [children, current, parentKey]);

    useEffect(() => {
        if (!searching) return;
        let alive = true;
        const timer = setTimeout(() => {
            searchActivityRegions(keyword).then((rows) => {
                if (alive) setFound({ keyword, rows });
            });
        }, 250);
        return () => {
            alive = false;
            clearTimeout(timer);
        };
    }, [keyword, searching]);

    const toggle = (region: ActivityRegion) => {
        if (draft.some((d) => d.code === region.code)) {
            setDraft(draft.filter((d) => d.code !== region.code));
            return;
        }
        const next = addRegionSelection(draft, region);
        if (next.length > ACTIVITY_LIMITS.regions) {
            toast.error(
                `활동 지역은 ${ACTIVITY_LIMITS.regions}곳까지 선택할 수 있습니다. 넓은 지역 "전체"로 묶어 보세요.`,
            );
            return;
        }
        setDraft(next);
    };

    const row = (region: ActivityRegion, label: string, drill: boolean) => {
        const checked = draft.some((d) => d.code === region.code);
        const covered = !checked && coveredBySelection(draft, region);
        return (
            <li
                key={`${label}-${region.code}`}
                className="border-border flex items-center border-b last:border-b-0"
            >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3 py-3 text-sm">
                    <Checkbox
                        checked={checked || covered}
                        disabled={covered}
                        onCheckedChange={() => toggle(region)}
                    />
                    <span className="min-w-0 flex-1 break-keep">
                        {label}
                        {covered && (
                            <span className="text-muted-foreground ml-1.5 text-xs">
                                (상위 지역 전체에 포함)
                            </span>
                        )}
                    </span>
                </label>
                {drill && (
                    <button
                        type="button"
                        onClick={() => {
                            setQuery("");
                            setPath([...path, region]);
                        }}
                        aria-label={`${region.name} 하위 지역 보기`}
                        className="text-muted-foreground hover:bg-muted flex shrink-0 items-center gap-0.5 px-3 py-3 text-xs font-semibold"
                    >
                        하위
                        <ChevronRight className="size-4" />
                    </button>
                )}
            </li>
        );
    };

    return (
        <Modal
            open
            onClose={onClose}
            className="flex max-h-[90dvh] max-w-lg flex-col p-0 md:p-0"
        >
            <div className="border-border flex items-center justify-between border-b px-5 py-4">
                <h2 className="text-lg font-bold">활동 지역 선택</h2>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="닫기"
                    className="hover:bg-muted rounded-full p-1.5"
                >
                    <X className="size-5" />
                </button>
            </div>

            <div className="px-5 pt-4">
                <div className="relative">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="동·읍·면이나 시·군·구 이름으로 검색 (예: 원주 단계)"
                        aria-label="활동 지역 검색"
                        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 w-full rounded-lg border py-2.5 pr-3.5 pl-9 text-sm outline-none focus-visible:ring-[3px]"
                    />
                </div>
                {!searching && (
                    <nav
                        aria-label="지역 단계"
                        className="mt-3 flex flex-wrap items-center gap-1 text-sm"
                    >
                        <button
                            type="button"
                            onClick={() => setPath([])}
                            className={
                                current
                                    ? "text-brand font-semibold"
                                    : "font-bold"
                            }
                        >
                            전국
                        </button>
                        {path.map((p, i) => (
                            <span
                                key={p.code}
                                className="flex items-center gap-1"
                            >
                                <ChevronRight className="text-muted-foreground size-3.5" />
                                <button
                                    type="button"
                                    onClick={() =>
                                        setPath(path.slice(0, i + 1))
                                    }
                                    className={
                                        i === path.length - 1
                                            ? "font-bold"
                                            : "text-brand font-semibold"
                                    }
                                >
                                    {p.name}
                                </button>
                            </span>
                        ))}
                    </nav>
                )}
            </div>

            <ul className="border-border mx-5 mt-3 min-h-40 flex-1 overflow-y-auto rounded-lg border">
                {searching ? (
                    results === null ? (
                        <li className="text-muted-foreground p-4 text-sm">
                            검색 중…
                        </li>
                    ) : results.length === 0 ? (
                        <li className="text-muted-foreground p-4 text-sm">
                            검색된 지역이 없습니다.
                        </li>
                    ) : (
                        results.map((r) =>
                            row(
                                r,
                                regionDisplayLabel(r.fullName, r.level),
                                false,
                            ),
                        )
                    )
                ) : items === undefined ? (
                    <li className="text-muted-foreground p-4 text-sm">
                        불러오는 중…
                    </li>
                ) : (
                    <>
                        {current && row(current, `${current.name} 전체`, false)}
                        {items.map((r) => row(r, r.name, r.level < 4))}
                    </>
                )}
            </ul>

            <div className="border-border mt-4 border-t px-5 py-4">
                <p className="text-muted-foreground text-xs">
                    선택 {draft.length}/{ACTIVITY_LIMITS.regions}
                </p>
                {draft.length > 0 && (
                    <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                        {draft.map((d) => (
                            <span
                                key={d.code}
                                className="bg-brand/10 text-brand inline-flex items-center gap-1 rounded-full py-1 pr-1.5 pl-2.5 text-xs font-semibold"
                            >
                                {regionDisplayLabel(d.fullName, d.level)}
                                <button
                                    type="button"
                                    aria-label={`${d.fullName} 선택 해제`}
                                    onClick={() => toggle(d)}
                                    className="hover:bg-brand/20 rounded-full p-0.5"
                                >
                                    <X className="size-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="mt-3 flex gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="border-border bg-background hover:bg-muted rounded-lg border px-4 py-2.5 text-sm font-bold"
                    >
                        취소
                    </button>
                    <button
                        type="button"
                        onClick={() => onApply(draft)}
                        className="bg-brand text-brand-foreground hover:bg-brand/90 flex-1 rounded-lg px-4 py-2.5 text-sm font-bold"
                    >
                        선택 완료
                    </button>
                </div>
            </div>
        </Modal>
    );
}
