import { getPartnerQualifications } from "../../_lib/qualifications.server";
import { getMyProfilePhotoUrl } from "../../_lib/profile-photo.server";
import { getPartnerBasicInfo } from "../../_lib/basic-info.server";
import { getMyPartnerActivity } from "../../_lib/activity.server";
import { getMyIdentityCheck } from "../../_lib/identity.server";
import { PartnerProfileView } from "./profile-view";
import { getPartnerPublicProfile } from "../_actions/public-profile";
import { PublicProfileEditor } from "../../_components/public-profile-editor";
import { EvidenceRegister } from "../../_components/evidence-register";
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
    // 제목·기본 정보·활동 정보 → 경력·공개 동의 → 증빙 등록 순서 (#226)
    return (
        <>
            <PartnerProfileView
                initialQuals={initialQuals}
                initialPhotoUrl={initialPhotoUrl}
                initialBasicInfo={initialBasicInfo}
                activityLoad={activity}
                identity={identity}
            />
            <div className="mt-8">
                <PublicProfileEditor
                    initial={publicProfile}
                    evidenceEnabled={evidenceEnabled === true}
                />
            </div>
            {/* 카드끼리 붙어 보이지 않게 다른 섹션과 같은 간격을 둔다 */}
            <div className="mt-8">
                <EvidenceRegister enabled={evidenceEnabled === true} />
            </div>
        </>
    );
}
