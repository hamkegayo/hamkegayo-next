import { Section } from "@/app/(user)/_components/home/section";

/** FAQ 페이지 상단 타이틀 + 우측 장식 배지 */
export function FaqHero() {
    return (
        <Section className="pb-0 md:py-12 md:pb-0">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-foreground text-4xl font-extrabold md:text-5xl">
                        FAQ
                    </h1>
                    <p className="text-foreground mt-4 text-lg font-bold">
                        자주 묻는 질문을 확인해보세요.
                    </p>
                    <p className="text-muted-foreground mt-1">
                        궁금한 내용을 검색하거나 아래 목록에서 찾아보실 수
                        있습니다.
                    </p>
                </div>

                {/* 장식용 배지 — 파란 "?" + 회색 "!" (살짝 어긋난 배치) */}
                <div className="flex shrink-0 items-start gap-3" aria-hidden>
                    <span className="bg-brand/10 text-brand flex size-16 items-center justify-center rounded-2xl text-3xl font-extrabold md:size-20 md:text-4xl">
                        ?
                    </span>
                    <span className="bg-muted text-muted-foreground mt-4 flex size-14 items-center justify-center rounded-2xl text-2xl font-extrabold md:size-16 md:text-3xl">
                        !
                    </span>
                </div>
            </div>
        </Section>
    );
}
