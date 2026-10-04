/** 팝업 시안 공개는 스테이징 Preview에만 허용하며 실제 할인 플래그와 분리한다. */
export function openingEventPopupPreviewEnabled(environment: {
    vercelEnv?: string;
    supabaseUrl?: string;
    popupPreview?: string;
}): boolean {
    if (
        environment.vercelEnv !== "preview" ||
        environment.popupPreview !== "true"
    ) {
        return false;
    }
    try {
        const url = new URL(environment.supabaseUrl ?? "");
        return (
            url.protocol === "https:" &&
            url.hostname === "aryrlfprkxntfkpgyayc.supabase.co"
        );
    } catch {
        return false;
    }
}
