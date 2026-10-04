import { createClient } from "@/utils/supabase/server";
import { OpeningEventPopup } from "./opening-event-popup";
import { openingEventPopupPreviewEnabled } from "@/lib/opening-event-popup-preview";

export async function OpeningEvent() {
    if (
        openingEventPopupPreviewEnabled({
            vercelEnv: process.env.VERCEL_ENV,
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
            popupPreview: process.env.OPENING_EVENT_POPUP_PREVIEW,
        })
    ) {
        return <OpeningEventPopup enabled={false} preview previewAutoOpen />;
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("opening_event_status");
    const status = (data as unknown as { enabled: boolean }[] | null)?.[0];
    if (error || !status?.enabled) return null;
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return (
        <OpeningEventPopup
            enabled
            reservationHref={
                user ? "/reservation" : "/login?next=%2Freservation"
            }
        />
    );
}
