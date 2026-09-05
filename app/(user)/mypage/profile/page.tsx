import { getSessionProfile } from "../_lib/profile";
import { getCareRecipients } from "../_lib/care.server";
import { MemberInfo } from "./_components/member-info";
import { WithdrawSection } from "./_components/withdraw-section";

export default async function MypageProfile() {
    const [{ user, profile }, recipients] = await Promise.all([
        getSessionProfile(),
        getCareRecipients(),
    ]);

    return (
        <>
            <MemberInfo
                basic={{
                    name: profile?.name ?? "-",
                    email: user.email ?? "-",
                    phone: profile?.phone ?? "-",
                    phoneVerified: !!profile?.phone_verified_at,
                }}
                recipients={recipients}
            />
            {/* 회원 정보 카드들과 같은 간격으로 이어 붙인다 */}
            <div className="mt-5">
                <WithdrawSection />
            </div>
        </>
    );
}
