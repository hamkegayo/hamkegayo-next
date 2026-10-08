import { getPartnerQualifications } from "../../_lib/qualifications.server";
import { getMyProfilePhotoUrl } from "../../_lib/profile-photo.server";
import { getPartnerBasicInfo } from "../../_lib/basic-info.server";
import { getMyPartnerActivity } from "../../_lib/activity.server";
import { getMyIdentityCheck } from "../../_lib/identity.server";
import { PartnerProfileView } from "./profile-view";
import { getPartnerPublicProfile } from "../_actions/public-profile";
import { createClient } from "@/utils/supabase/server";

export default async function PartnerProfile() {
    const [
        initialQuals,
        initialPhotoUrl,
        initialBasicInfo,
        activity,
        identity,
    ] = await Promise.all([
        getPartnerQualifications(),
        getMyProfilePhotoUrl(),
        getPartnerBasicInfo(),
        getMyPartnerActivity(),
        getMyIdentityCheck(),
    ]);
    const publicProfile = await getPartnerPublicProfile();
    const { data: evidenceEnabled } = await (
        await createClient()
    ).rpc("partner_evidence_enabled");
    // #278: 기본·활동 정보 → 증빙 등록 → 자격·경력 목록 → 통합 저장
    return (
        <>
            <PartnerProfileView
                initialQuals={initialQuals}
                initialPhotoUrl={initialPhotoUrl}
                initialBasicInfo={initialBasicInfo}
                activityLoad={activity}
                identity={identity}
                publicProfile={publicProfile}
                evidenceEnabled={evidenceEnabled === true}
            />
        </>
    );
}
