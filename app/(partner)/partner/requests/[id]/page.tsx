import Link from "next/link";

import { getPartnerRequestDetail } from "../../../_lib/requests.server";
import { RequestDetailView } from "./request-detail-view";

export default async function PartnerRequestDetail({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const detail = await getPartnerRequestDetail(id);

    if (!detail) {
        return (
            <div className="border-border bg-background rounded-2xl border p-10 text-center">
                <p className="text-muted-foreground">
                    요청을 찾을 수 없습니다.
                </p>
                <Link
                    href="/partner/requests"
                    className="text-brand mt-4 inline-block text-sm font-bold"
                >
                    수락 대기 목록으로
                </Link>
            </div>
        );
    }

    return <RequestDetailView r={detail} />;
}
