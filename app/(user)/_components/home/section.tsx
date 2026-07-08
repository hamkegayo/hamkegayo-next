import { cn } from "@/lib/utils";

/**
 * 홈 섹션 공통 컨테이너.
 * 모든 섹션이 동일한 폭을 갖도록 폭(max-w)·좌우 여백(px)을 한 곳에서 관리한다.
 * 폭을 바꾸려면 이 파일의 max-w 값만 수정하면 전체 섹션에 반영된다.
 */
export function Section({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("mx-auto w-full max-w-7xl px-4 py-12", className)}>
      {children}
    </section>
  );
}
