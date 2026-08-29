import { CookieSettingsButton } from "@/components/analytics/cookie-settings-button";
import { NonMedicalNotice } from "@/components/non-medical-notice";

export function UserFooter() {
    return (
        <footer className="border-border bg-background mt-auto w-full border-t">
            <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-center gap-2 px-4 pt-6 pb-3 text-sm md:flex-row md:gap-0">
                <span className="md:px-6">© Hospital Companion Service</span>
                <span className="text-border hidden md:inline">|</span>
                <span className="md:px-6">
                    고객센터 09:00–18:00 (주말/공휴일 휴무)
                </span>
                <span className="text-border hidden md:inline">|</span>
                <span className="md:px-6">
                    FAQ · 이용약관 · 개인정보처리방침
                </span>
                <span className="text-border hidden md:inline">|</span>
                <span className="md:px-6">
                    <CookieSettingsButton />
                </span>
            </div>
            <div className="mx-auto max-w-6xl px-4 pb-6">
                <NonMedicalNotice className="text-center" />
            </div>
        </footer>
    );
}
