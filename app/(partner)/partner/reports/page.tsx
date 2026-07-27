import { getPartnerReports } from "../../_lib/reports.server";
import { ReportsListView } from "./reports-list-view";

export default async function PartnerReports() {
    const items = await getPartnerReports();
    return <ReportsListView items={items} />;
}
