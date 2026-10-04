import { createClient } from "@/utils/supabase/server";
import { OpeningEventPopup } from "./opening-event-popup";

export async function OpeningEvent() {
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
