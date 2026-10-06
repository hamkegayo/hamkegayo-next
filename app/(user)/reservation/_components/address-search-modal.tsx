"use client";

import { useState, useTransition } from "react";
import { MapPin, Search, X } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import {
    searchReservationAddress,
    type SignedAddressResult,
} from "../_actions/address";

/**
 * 도로명주소 검색 팝업 (#226). 고른 주소의 법정동코드는 파트너 활동 지역 매칭에 쓴다.
 * 결과에는 도로명·지번 주소만 보이고 승인키는 서버에만 있다.
 */
export function AddressSearchModal({
    title,
    onClose,
    onSelect,
}: {
    title: string;
    onClose: () => void;
    onSelect: (address: SignedAddressResult) => void;
}) {
    const [keyword, setKeyword] = useState("");
    const [results, setResults] = useState<SignedAddressResult[] | null>(null);
    const [total, setTotal] = useState(0);
    /** 서버가 알려 준 다음 페이지 여부 — 최대 20페이지 (#232 리뷰) */
    const [hasMore, setHasMore] = useState(false);
    const [page, setPage] = useState(1);
    const [message, setMessage] = useState("");
    const [pending, startTransition] = useTransition();

    const search = (nextPage: number) => {
        startTransition(async () => {
            const res = await searchReservationAddress(keyword, nextPage);
            if (!res.ok) {
                setResults(null);
                setMessage(res.message);
                return;
            }
            setMessage("");
            setPage(res.page);
            setTotal(res.total);
            setHasMore(res.hasMore);
            setResults((prev) =>
                nextPage === 1
                    ? res.results
                    : [...(prev ?? []), ...res.results],
            );
        });
    };

    return (
        <Modal
            open
            onClose={onClose}
            className="flex max-h-[90dvh] max-w-lg flex-col p-0 md:p-0"
        >
            <div className="border-border flex items-center justify-between border-b px-5 py-4">
                <h2 className="text-lg font-bold">{title}</h2>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="닫기"
                    className="hover:bg-muted rounded-full p-1.5"
                >
                    <X className="size-5" />
                </button>
            </div>
            {/* 예약 단계 <form> 안에 그려지므로 중첩 form 대신 Enter·버튼으로 검색한다. */}
            <div className="flex gap-2 px-5 pt-4">
                <div className="relative min-w-0 flex-1">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <input
                        type="search"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                search(1);
                            }
                        }}
                        placeholder="도로명, 건물명, 지번 (예: 올림픽로43길 88)"
                        aria-label="주소 검색어"
                        autoFocus
                        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 w-full rounded-lg border py-2.5 pr-3.5 pl-9 text-sm outline-none focus-visible:ring-[3px]"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => search(1)}
                    disabled={pending}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 shrink-0 rounded-lg px-4 text-sm font-bold disabled:opacity-50"
                >
                    검색
                </button>
            </div>
            <p className="text-muted-foreground px-5 pt-2 text-xs break-keep">
                건물명(예: 서울아산병원)이나 &ldquo;원주시 단계동&rdquo;처럼
                검색할 수도 있습니다.
            </p>
            {/* #232 리뷰 — 검색어 외부 전송 안내(사용자 결정: 화면 안내만, 2026-10-06) */}
            <p className="text-muted-foreground px-5 pt-1 text-xs break-keep">
                검색어는 주소 확인을 위해 행정안전부 도로명주소 서비스로
                전송되며, 함께가요는 검색어를 저장하지 않습니다. 동·호수는 검색
                후 주소 칸에 이어서 적어 주세요.
            </p>

            <div className="mx-5 mt-3 mb-5 min-h-32 flex-1 overflow-y-auto">
                {message ? (
                    <p role="alert" className="text-destructive py-4 text-sm">
                        {message}
                    </p>
                ) : results === null ? (
                    <p className="text-muted-foreground py-4 text-sm">
                        {pending ? "검색 중…" : "검색어를 입력해 주세요."}
                    </p>
                ) : results.length === 0 ? (
                    <p className="text-muted-foreground py-4 text-sm">
                        검색 결과가 없습니다. 도로명과 건물번호를 함께 입력해
                        보세요.
                    </p>
                ) : (
                    <ul className="border-border divide-border divide-y rounded-lg border">
                        {results.map((r) => (
                            <li key={`${r.roadAddr}-${r.zipNo}`}>
                                <button
                                    type="button"
                                    onClick={() => onSelect(r)}
                                    className="hover:bg-muted flex w-full items-start gap-2.5 px-3.5 py-3 text-left"
                                >
                                    <MapPin className="text-brand mt-0.5 size-4 shrink-0" />
                                    <span className="min-w-0 text-sm">
                                        <span className="text-foreground block font-semibold break-keep">
                                            {r.roadAddr}
                                        </span>
                                        {r.buildingName && (
                                            <span className="text-brand block text-xs font-semibold">
                                                {r.buildingName}
                                            </span>
                                        )}
                                        <span className="text-muted-foreground block text-xs break-keep">
                                            지번 {r.jibunAddr}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                        {hasMore && (
                            <li>
                                <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => search(page + 1)}
                                    className="text-brand hover:bg-muted w-full py-3 text-sm font-bold disabled:opacity-50"
                                >
                                    {pending
                                        ? "불러오는 중…"
                                        : `더 보기 (${results.length}/${total})`}
                                </button>
                            </li>
                        )}
                    </ul>
                )}
            </div>
        </Modal>
    );
}
