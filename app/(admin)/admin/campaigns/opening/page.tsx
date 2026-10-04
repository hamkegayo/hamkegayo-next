import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { OpeningEventPopup } from "@/app/(user)/_components/home/opening-event-popup";
import { EventControls } from "./event-controls";
import { kstDateTime } from "@/lib/format";
import { ClaimRestore } from "./claim-restore";
import { ExclusionControls } from "./exclusion-controls";

type EventRow = {
    id: string;
    code: string;
    customer: string;
    state: string;
    sequence: number | null;
    discount_amount: number;
    confirmed_at: string | null;
    reservation_status: string;
    identity_verified: boolean;
    restored_at: string | null;
};
type EventStatus = {
    active: boolean;
    ready: boolean;
    closed: boolean;
    capacity: number;
    used: number;
    held: number;
    rows: EventRow[];
};
export default async function OpeningCampaignPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; page?: string }>;
}) {
    const params = await searchParams;
    const page = Math.max(
        0,
        Math.min(10000, Number.parseInt(params.page ?? "0") || 0),
    );
    const q = (params.q ?? "").slice(0, 100);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_opening_event", {
        p_search: q,
        p_page: page,
    });
    if (error || !data)
        return (
            <p className="text-muted-foreground">
                이벤트 관리에는 전체 또는 정산 권한과 2단계 인증이 필요합니다.
            </p>
        );
    const event = data as unknown as EventStatus;
    const href = (index: number) =>
        `/admin/campaigns/opening?q=${encodeURIComponent(q)}&page=${index}`;
    return (
        <div>
            <h1 className="text-2xl font-extrabold">오픈 이벤트</h1>
            <p className="text-muted-foreground mt-2 text-sm">
                고객 취소·노쇼·탈퇴는 혜택을 복원하지 않습니다. 회사·파트너
                귀책은 전액 환불 확인 후 사유를 기록해 복원합니다. 이메일 HMAC은
                표시하지 않습니다.
            </p>
            {!event.ready && (
                <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                    이메일 인증·고지·혜택 환불 검증 완료 전 고객 팝업과 실제
                    할인은 비활성입니다. 아래에서 시안을 검토할 수 있습니다.
                </p>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    ["정원", event.capacity],
                    ["사용", event.used],
                    ["잔여", Math.max(event.capacity - event.used, 0)],
                    ["결제 전 확보", event.held],
                ].map(([label, value]) => (
                    <div
                        key={label}
                        className="border-border rounded-xl border p-4"
                    >
                        <p className="text-muted-foreground text-sm">{label}</p>
                        <p className="mt-2 text-2xl font-bold">{value}명</p>
                    </div>
                ))}
            </div>
            <div className="mt-5">
                <OpeningEventPopup enabled={false} preview />
            </div>
            <EventControls
                active={event.active}
                ready={event.ready}
                closed={event.closed}
            />
            {!event.closed && <ExclusionControls />}
            <form className="mt-6 flex gap-3">
                <label className="sr-only" htmlFor="campaign-search">
                    예약번호 검색
                </label>
                <input
                    id="campaign-search"
                    name="q"
                    defaultValue={q}
                    placeholder="예약번호 검색"
                    className="border-border bg-background min-w-0 flex-1 rounded-lg border p-2"
                />
                <button className="border-border rounded-lg border px-4">
                    검색
                </button>
            </form>
            <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <caption className="sr-only">이벤트 혜택 배정 이력</caption>
                    <thead>
                        <tr>
                            {[
                                "순번",
                                "회원",
                                "이메일 인증",
                                "예약번호",
                                "확정시각",
                                "혜택",
                                "배정 상태",
                                "예약 상태",
                                "귀책 복원",
                            ].map((label) => (
                                <th
                                    key={label}
                                    scope="col"
                                    className="border-border border-b p-3 whitespace-nowrap"
                                >
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {event.rows.map((row) => (
                            <tr key={row.id}>
                                <td className="p-3">{row.sequence ?? "—"}</td>
                                <td className="p-3">{row.customer}</td>
                                <td className="p-3">
                                    {row.identity_verified ? "확인" : "미확인"}
                                </td>
                                <td className="p-3">{row.code}</td>
                                <td className="p-3 whitespace-nowrap">
                                    {row.confirmed_at
                                        ? kstDateTime(row.confirmed_at)
                                        : "미확정"}
                                </td>
                                <td className="p-3">
                                    {row.discount_amount.toLocaleString()}원
                                </td>
                                <td className="p-3">{row.state}</td>
                                <td className="p-3">
                                    {row.reservation_status}
                                </td>
                                <td className="p-3">
                                    {row.restored_at ? (
                                        "복원 완료"
                                    ) : row.state === "USED" &&
                                      row.reservation_status === "CANCELLED" &&
                                      !event.closed ? (
                                        <ClaimRestore id={row.id} />
                                    ) : (
                                        "—"
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {event.rows.length === 0 && (
                    <p className="text-muted-foreground py-8 text-center">
                        배정 이력이 없습니다.
                    </p>
                )}
            </div>
            <div className="mt-5 flex gap-3">
                {page > 0 && <Link href={href(page - 1)}>이전</Link>}
                {event.rows.length === 20 && (
                    <Link href={href(page + 1)}>다음</Link>
                )}
            </div>
        </div>
    );
}
