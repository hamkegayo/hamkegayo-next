import Link from "next/link";

import { getReportContext } from "../../../_lib/reports.server";
import { ReportWriteView } from "./report-write-view";

export default async function PartnerReportWrite({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const context = await getReportContext(id);

    if (!context) {
        return (
            <div className="border-border bg-background rounded-2xl border p-10 text-center">
                <p className="text-muted-foreground">
                    리포트를 작성할 수 없습니다. (완료된 서비스가 아니거나
                    권한이 없습니다)
                </p>
                <Link
                    href="/partner/reports"
                    className="text-brand mt-4 inline-block text-sm font-bold"
                >
                    리포트 목록으로
                </Link>
            </div>
        );
    }

    return <ReportWriteView context={context} />;
}
