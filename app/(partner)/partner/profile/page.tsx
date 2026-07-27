import { getPartnerQualifications } from "../../_lib/qualifications.server";
import { PartnerProfileView } from "./profile-view";

export default async function PartnerProfile() {
    const initialQuals = await getPartnerQualifications();
    return <PartnerProfileView initialQuals={initialQuals} />;
}
