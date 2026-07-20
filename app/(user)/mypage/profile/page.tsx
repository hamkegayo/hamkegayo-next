import { getSessionProfile } from "../_lib/profile";
import { MemberInfo } from "./_components/member-info";

export default async function MypageProfile() {
    const { user, profile } = await getSessionProfile();

    return (
        <MemberInfo
            basic={{
                name: profile?.name ?? "-",
                email: user.email ?? "-",
                phone: profile?.phone ?? "-",
                phoneVerified: !!profile?.phone_verified_at,
            }}
        />
    );
}
