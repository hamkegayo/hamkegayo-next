import { UserFooter } from "@/components/layout/user-footer";
import { cn } from "@/lib/utils";

/**
 * 결제 화면 공용 셸 (#52).
 *
 *  `app/pay/**` 는 `(user)` 레이아웃 밖이라 푸터가 붙지 않는다. 그래서
 *  **결제가 일어나는 화면에 사업자정보도, 취소·환불 정책 링크도 없었다.**
 *
 *  전자상거래법 제10조의 표시 의무 자체는 사이버몰 초기 화면으로 충족되지만,
 *  이 링크는 메일로 전달되어 **받는 사람이 홈페이지를 거치지 않고 바로
 *  열린다.** 결제 직전 화면에서 누구와 거래하는지, 취소하면 어떻게 되는지
 *  확인할 수 없는 상태였다. PG 심사도 결제 화면 기준으로 본다.
 *
 *  사용자 화면과 같은 푸터를 쓴다 — 따로 만들면 사업자정보가 두 벌이 되고,
 *  값이 바뀔 때 한쪽만 고쳐진다.
 */
export function PayShell({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className="flex min-h-screen flex-col">
            <main className="flex flex-1 items-center justify-center px-4 py-16">
                <div
                    className={cn(
                        "border-border bg-background w-full max-w-md rounded-2xl border p-7 md:p-8",
                        className,
                    )}
                >
                    {children}
                </div>
            </main>
            <UserFooter />
        </div>
    );
}
