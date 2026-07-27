import { getPartnerSettlements } from "../../_lib/settlement.server";
import { SettlementDashboardView } from "./settlement-dashboard-view";

export default async function PartnerSettlement() {
    const { settlements, summary } = await getPartnerSettlements();
    return (
        <SettlementDashboardView settlements={settlements} summary={summary} />
    );
}
