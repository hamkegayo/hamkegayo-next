"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import {
    PROFILE_PHOTO_ALLOWED_TYPES,
    PROFILE_PHOTO_BUCKET,
    PROFILE_PHOTO_MAX_SIZE,
    PROFILE_PHOTO_SIZE_MESSAGE,
    PROFILE_PHOTO_TYPE_MESSAGE,
    PROFILE_PHOTO_URL_TTL,
} from "@/lib/profile-photo";

export type UploadProfilePhotoResult =
    { ok: true; url: string } | { ok: false; message: string };

export type DeleteProfilePhotoResult =
    { ok: true } | { ok: false; message: string };

const EXT_BY_TYPE: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
};

/**
 * 프로필 사진 업로드(교체 포함).
 *  - 파일은 항상 새 경로로 올리고, DB 갱신에 성공한 뒤 이전 파일을 지운다.
 *    (DB 갱신이 실패하면 방금 올린 파일을 되돌려 스토리지 누수를 막는다)
 *  - 성공 시 즉시 화면에 반영할 수 있도록 signed URL 을 함께 돌려준다.
 */
export async function uploadProfilePhoto(
    formData: FormData,
): Promise<UploadProfilePhotoResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const file = formData.get("file");
    if (!(file instanceof File)) {
        return { ok: false, message: "사진을 선택해 주세요." };
    }
    if (file.size > PROFILE_PHOTO_MAX_SIZE) {
        return { ok: false, message: PROFILE_PHOTO_SIZE_MESSAGE };
    }
    if (!PROFILE_PHOTO_ALLOWED_TYPES.includes(file.type)) {
        return { ok: false, message: PROFILE_PHOTO_TYPE_MESSAGE };
    }

    const { data: prev } = await supabase
        .from("profiles")
        .select("avatar_path")
        .eq("id", user.id)
        .maybeSingle<{ avatar_path: string | null }>();
    const prevPath = prev?.avatar_path ?? null;

    const ext = EXT_BY_TYPE[file.type] ?? "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
        .from(PROFILE_PHOTO_BUCKET)
        .upload(path, file, { contentType: file.type });
    if (upErr) {
        return {
            ok: false,
            message: "업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        };
    }

    const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_path: path })
        .eq("id", user.id);
    if (dbErr) {
        // 롤백: 방금 올린 파일 제거
        await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([path]);
        return { ok: false, message: "사진 저장에 실패했습니다." };
    }

    // 교체 성공 후 이전 파일 정리 (실패해도 사용자 흐름은 막지 않는다)
    if (prevPath && prevPath !== path) {
        await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([prevPath]);
    }

    const { data: signed } = await supabase.storage
        .from(PROFILE_PHOTO_BUCKET)
        .createSignedUrl(path, PROFILE_PHOTO_URL_TTL);

    revalidatePath("/partner/profile");
    return { ok: true, url: signed?.signedUrl ?? "" };
}

/**
 * 프로필 사진 삭제.
 * DB 를 먼저 비운 뒤 파일을 지운다 — 순서가 반대면 파일만 사라지고
 * avatar_path 는 남아 깨진 이미지를 가리키게 된다.
 */
export async function deleteProfilePhoto(): Promise<DeleteProfilePhotoResult> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };

    const { data: row } = await supabase
        .from("profiles")
        .select("avatar_path")
        .eq("id", user.id)
        .maybeSingle<{ avatar_path: string | null }>();

    const path = row?.avatar_path ?? null;
    if (!path) {
        revalidatePath("/partner/profile");
        return { ok: true };
    }

    const { error } = await supabase
        .from("profiles")
        .update({ avatar_path: null })
        .eq("id", user.id);
    if (error) return { ok: false, message: "삭제에 실패했습니다." };

    await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([path]);

    revalidatePath("/partner/profile");
    return { ok: true };
}
