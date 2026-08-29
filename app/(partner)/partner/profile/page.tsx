import { getPartnerQualifications } from "../../_lib/qualifications.server";
import { getMyProfilePhotoUrl } from "../../_lib/profile-photo.server";
import { PartnerProfileView } from "./profile-view";

export default async function PartnerProfile() {
    const [initialQuals, initialPhotoUrl] = await Promise.all([
        getPartnerQualifications(),
        getMyProfilePhotoUrl(),
    ]);
    return (
        <PartnerProfileView
            initialQuals={initialQuals}
            initialPhotoUrl={initialPhotoUrl}
        />
    );
}
