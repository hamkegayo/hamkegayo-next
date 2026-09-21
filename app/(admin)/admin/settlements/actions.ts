"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type SettlementActionResult =
    { ok: true; count: number } | { ok: false; message: string };

export type TransferBatchActionResult =
    | {
          ok: true;
          id: string;
          code: string;
          settlementCount: number;
          partnerCount: number;
          totalNet: number;
      }
    | { ok: false; message: string };

async function run(
    rpc:
        | "admin_approve_settlements"
        | "admin_hold_settlements"
        | "admin_release_settlements",
    ids: string[],
    reason: string,
): Promise<SettlementActionResult> {
    const normalized = [...new Set(ids)].slice(0, 200);
    const memo = reason.trim();
    if (normalized.length === 0)
        return { ok: false, message: "정산 건을 선택해 주세요." };
    if (memo.length < 5 || memo.length > 500)
        return { ok: false, message: "처리 사유를 5~500자로 입력해 주세요." };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(rpc, {
        p_ids: normalized,
        p_reason: memo,
    });
    if (error) {
        return {
            ok: false,
            message:
                error.code === "23514"
                    ? "현재 상태, 결제 또는 정산계좌를 확인해 주세요."
                    : "정산 상태 변경에 실패했습니다.",
        };
    }
    revalidatePath("/admin");
    revalidatePath("/admin/settlements");
    return { ok: true, count: Number(data ?? normalized.length) };
}

export async function approveSettlements(ids: string[], reason: string) {
    return run("admin_approve_settlements", ids, reason);
}

export async function holdSettlements(ids: string[], reason: string) {
    return run("admin_hold_settlements", ids, reason);
}

export async function releaseSettlements(ids: string[], reason: string) {
    return run("admin_release_settlements", ids, reason);
}

export async function createTransferBatch(
    ids: string[],
    reason: string,
): Promise<TransferBatchActionResult> {
    const normalized = [...new Set(ids)].slice(0, 200);
    const memo = reason.trim();
    if (normalized.length === 0)
        return { ok: false, message: "승인된 정산 건을 선택해 주세요." };
    if (memo.length < 5 || memo.length > 500)
        return { ok: false, message: "생성 사유를 5~500자로 입력해 주세요." };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_create_transfer_batch", {
        p_ids: normalized,
        p_reason: memo,
    });
    if (error) {
        return {
            ok: false,
            message:
                error.code === "23514"
                    ? "승인 상태, 중복 편입 여부와 파트너별 지급액을 확인해 주세요."
                    : "이체 배치를 만들지 못했습니다.",
        };
    }

    const result = data as {
        id: string;
        code: string;
        settlementCount: number;
        partnerCount: number;
        totalNet: number;
    };
    revalidatePath("/admin/settlements");
    revalidatePath("/admin/settlements/batches");
    return { ok: true, ...result };
}
