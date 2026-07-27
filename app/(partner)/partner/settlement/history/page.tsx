import { getPartnerSettlements } from "../../../_lib/settlement.server";
import { SettlementHistoryView } from "./settlement-history-view";

export default async function PartnerSettlementHistory() {
    const { settlements, summary } = await getPartnerSettlements();
    return (
        <SettlementHistoryView settlements={settlements} summary={summary} />
    );
}
