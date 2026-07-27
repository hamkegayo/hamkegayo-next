import Link from "next/link";

import { getPartnerService } from "../../../_lib/services.server";
import { ServiceDetailView } from "./service-detail-view";

export default async function PartnerManagementDetail({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const service = await getPartnerService(id);

    if (!service) {
        return (
            <div className="border-border bg-background rounded-2xl border p-10 text-center">
                <p className="text-muted-foreground">
                    서비스를 찾을 수 없습니다.
                </p>
                <Link
                    href="/partner/management"
                    className="text-brand mt-4 inline-block text-sm font-bold"
                >
                    진행 중 목록으로
                </Link>
            </div>
        );
    }

    return <ServiceDetailView service={service} />;
}
