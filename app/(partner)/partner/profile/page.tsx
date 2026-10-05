import { getPartnerQualifications } from "../../_lib/qualifications.server";
import { getMyProfilePhotoUrl } from "../../_lib/profile-photo.server";
import { getPartnerBasicInfo } from "../../_lib/basic-info.server";
import { PartnerProfileView } from "./profile-view";
import { getPartnerPublicProfile } from "../_actions/public-profile";
import { PublicProfileEditor } from "../../_components/public-profile-editor";
import { EvidenceRegister } from "../../_components/evidence-register";
import { createClient } from "@/utils/supabase/server";

export default async function PartnerProfile() {
    const [initialQuals, initialPhotoUrl, initialBasicInfo] = await Promise.all(
        [
            getPartnerQualifications(),
            getMyProfilePhotoUrl(),
            getPartnerBasicInfo(),
        ],
    );
    const publicProfile = await getPartnerPublicProfile();
    const { data: evidenceEnabled } = await (
        await createClient()
    ).rpc("partner_evidence_enabled");
    return (
        <>
            <div className="mb-6">
                <PublicProfileEditor
                    initial={publicProfile}
                    evidenceEnabled={evidenceEnabled === true}
                />
            </div>
            <PartnerProfileView
                initialQuals={initialQuals}
                initialPhotoUrl={initialPhotoUrl}
                initialBasicInfo={initialBasicInfo}
            />
            <EvidenceRegister enabled={evidenceEnabled === true} />
        </>
    );
}
