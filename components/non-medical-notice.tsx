import { cn } from "@/lib/utils";

/**
 * 비의료 고지 문구.
 * 함께가요는 통신판매중개 플랫폼이며 파트너는 의료행위를 수행하지 않는다.
 * 의료 서비스로 오인되지 않도록 메인·서비스 소개·푸터에서 공통으로 노출한다.
 */
export const NON_MEDICAL_NOTICE =
    "함께가요는 의료 행위, 의료 상담, 진단, 간병을 제공하지 않으며, 병원 방문 시 이동과 행정 절차를 돕는 동행 지원 서비스입니다.";

export function NonMedicalNotice({ className }: { className?: string }) {
    return (
        <p
            className={cn(
                "text-muted-foreground text-xs leading-relaxed",
                className,
            )}
        >
            {NON_MEDICAL_NOTICE}
        </p>
    );
}
