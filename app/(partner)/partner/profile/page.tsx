import { getPartnerQualifications } from "../../_lib/qualifications.server";
import { getMyProfilePhotoUrl } from "../../_lib/profile-photo.server";
import { getPartnerBasicInfo } from "../../_lib/basic-info.server";
import { PartnerProfileView } from "./profile-view";
import { getPartnerPublicProfile } from "../_actions/public-profile";
import { PublicProfileEditor } from "../../_components/public-profile-editor";

export default async function PartnerProfile() {
    const [initialQuals, initialPhotoUrl, initialBasicInfo] = await Promise.all(
        [
            getPartnerQualifications(),
            getMyProfilePhotoUrl(),
            getPartnerBasicInfo(),
        ],
    );
    const publicProfile = await getPartnerPublicProfile();
    return (
        <>
            <div className="mb-6">
                <PublicProfileEditor initial={publicProfile} />
            </div>
            <PartnerProfileView
                initialQuals={initialQuals}
                initialPhotoUrl={initialPhotoUrl}
                initialBasicInfo={initialBasicInfo}
            />
        </>
    );
}
