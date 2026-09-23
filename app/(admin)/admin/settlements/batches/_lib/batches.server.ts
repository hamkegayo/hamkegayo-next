import { createClient } from "@/utils/supabase/server";

export type TransferBatch = {
    id: string;
    code: string;
    status: "DRAFT" | "FILE_ISSUED" | "COMPLETED" | "CANCELLED";
    reason: string;
    settlementCount: number;
    partnerCount: number;
    totalNet: number;
    createdByName: string;
    createdAt: string;
};

export type TransferBatchItem = {
    id: string;
    partnerId: string;
    partnerName: string;
    amount: number;
    settlementCount: number;
    bankName: string;
    accountLast4: string;
    holderName: string;
};

export async function getTransferBatches(selectedId: string | null) {
    const supabase = await createClient();
    const { data: allowed } = await supabase.rpc("can_manage_settlements");
    if (allowed !== true)
        return { allowed: false as const, batches: [], items: [] };

    const batchesResult = await supabase.rpc("admin_list_transfer_batches", {
        p_limit: 100,
    });
    if (batchesResult.error) throw batchesResult.error;
    const batches = (
        (batchesResult.data ?? []) as Record<string, unknown>[]
    ).map((row) => ({
        id: row.id as string,
        code: row.code as string,
        status: row.status as TransferBatch["status"],
        reason: row.reason as string,
        settlementCount: row.settlement_count as number,
        partnerCount: row.partner_count as number,
        totalNet: row.total_net as number,
        createdByName: row.created_by_name as string,
        createdAt: row.created_at as string,
    }));
    const batchId = selectedId ?? batches[0]?.id ?? null;
    if (!batchId)
        return { allowed: true as const, batches, items: [], batchId: null };

    const itemsResult = await supabase.rpc("admin_list_transfer_batch_items", {
        p_batch_id: batchId,
    });
    if (itemsResult.error) throw itemsResult.error;
    const items = ((itemsResult.data ?? []) as Record<string, unknown>[]).map(
        (row) => ({
            id: row.id as string,
            partnerId: row.partner_id as string,
            partnerName: row.partner_name as string,
            amount: row.amount as number,
            settlementCount: row.settlement_count as number,
            bankName: row.bank_name as string,
            accountLast4: row.account_last4 as string,
            holderName: row.holder_name as string,
        }),
    );
    return { allowed: true as const, batches, items, batchId };
}
