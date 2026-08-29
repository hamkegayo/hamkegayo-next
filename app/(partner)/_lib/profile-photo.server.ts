import { createClient } from "@/utils/supabase/server";
import {
    PROFILE_PHOTO_BUCKET,
    PROFILE_PHOTO_URL_TTL,
} from "@/lib/profile-photo";

/**
 * 로그인한 본인의 프로필 사진 signed URL.
 * 버킷이 비공개이므로 경로만으로는 표시할 수 없어 매 렌더마다 발급한다.
 * 미등록·발급 실패 시 null → 화면은 기본 아이콘으로 폴백한다.
 */
export async function getMyProfilePhotoUrl(): Promise<string | null> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return null;

        const { data } = await supabase
            .from("profiles")
            .select("avatar_path")
            .eq("id", user.id)
            .maybeSingle<{ avatar_path: string | null }>();

        const path = data?.avatar_path;
        if (!path) return null;

        const { data: signed } = await supabase.storage
            .from(PROFILE_PHOTO_BUCKET)
            .createSignedUrl(path, PROFILE_PHOTO_URL_TTL);

        return signed?.signedUrl ?? null;
    } catch {
        return null;
    }
}
