import { getPartnerQualifications } from "../../_lib/qualifications.server";
import { getMyProfilePhotoUrl } from "../../_lib/profile-photo.server";
import { getPartnerBasicInfo } from "../../_lib/basic-info.server";
import { PartnerProfileView } from "./profile-view";

export default async function PartnerProfile() {
    const [initialQuals, initialPhotoUrl, initialBasicInfo] = await Promise.all(
        [
            getPartnerQualifications(),
            getMyProfilePhotoUrl(),
            getPartnerBasicInfo(),
        ],
    );
    return (
        <PartnerProfileView
            initialQuals={initialQuals}
            initialPhotoUrl={initialPhotoUrl}
            initialBasicInfo={initialBasicInfo}
        />
    );
}
