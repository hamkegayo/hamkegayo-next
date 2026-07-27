import { getSessionProfile } from "../_lib/profile";
import { getCareRecipients } from "../_lib/care.server";
import { MemberInfo } from "./_components/member-info";

export default async function MypageProfile() {
    const [{ user, profile }, recipients] = await Promise.all([
        getSessionProfile(),
        getCareRecipients(),
    ]);

    return (
        <MemberInfo
            basic={{
                name: profile?.name ?? "-",
                email: user.email ?? "-",
                phone: profile?.phone ?? "-",
                phoneVerified: !!profile?.phone_verified_at,
            }}
            recipients={recipients}
        />
    );
}
