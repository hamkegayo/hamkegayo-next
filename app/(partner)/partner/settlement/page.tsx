import { getPartnerSettlements } from "../../_lib/settlement.server";
import { getMyPayoutAccount } from "../_actions/payout-account";
import { SettlementDashboardView } from "./settlement-dashboard-view";

export default async function PartnerSettlement() {
    const [{ settlements, summary }, account] = await Promise.all([
        getPartnerSettlements(),
        getMyPayoutAccount(),
    ]);

    return (
        <SettlementDashboardView
            settlements={settlements}
            summary={summary}
            account={account}
        />
    );
}
