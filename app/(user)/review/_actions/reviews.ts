"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";

export type CreateReviewResult =
    { ok: true; reviewId: string } | { ok: false; message: string };

export type ReviewFormInput = {
    rating: number;
    title: string;
    content: string;
};

/** 이름 마스킹: 홍길동 → 홍O동 / 홍길 → 홍O */
function maskName(name: string): string {
    const n = name.trim();
    if (n.length <= 1) return n || "익명";
    if (n.length === 2) return `${n[0]}O`;
    return `${n[0]}${"O".repeat(n.length - 2)}${n[n.length - 1]}`;
}

/** 후기 작성 (완료·본인 서비스, 서비스당 1회) */
export async function createReview(
    serviceId: string,
    input: ReviewFormInput,
): Promise<CreateReviewResult> {
    if (input.rating < 1 || input.rating > 5) {
        return { ok: false, message: "별점을 선택해 주세요." };
    }
    if (input.title.trim().length < 2) {
        return { ok: false, message: "제목을 2자 이상 입력해 주세요." };
    }
    if (input.content.trim().length === 0) {
        return { ok: false, message: "후기 내용을 입력해 주세요." };
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    // 서비스 검증(본인 예약 + 완료) — RLS(owns_reservation)로 접근 제한됨
    const { data: service } = await supabase
        .from("services")
        .select("id, partner_id, status, reservations!inner(customer_id)")
        .eq("id", serviceId)
        .maybeSingle<{
            id: string;
            partner_id: string;
            status: string;
            reservations: { customer_id: string } | null;
        }>();

    if (
        !service ||
        service.status !== "COMPLETED" ||
        service.reservations?.customer_id !== user.id
    ) {
        return { ok: false, message: "후기를 작성할 수 없는 서비스입니다." };
    }

    const { data: prof } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();

    const { data, error } = await supabase
        .from("reviews")
        .insert({
            service_id: serviceId,
            customer_id: user.id,
            partner_id: service.partner_id,
            rating: input.rating,
            title: input.title.trim().slice(0, 40),
            content: input.content.trim().slice(0, 600),
            author_masked: maskName(prof?.name ?? "익명"),
        })
        .select("id")
        .single();

    if (error) {
        if (error.code === "23505") {
            return { ok: false, message: "이미 후기를 작성한 서비스입니다." };
        }
        return {
            ok: false,
            message: "후기 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    revalidatePath("/review");
    revalidatePath("/mypage");
    return { ok: true, reviewId: data.id };
}
