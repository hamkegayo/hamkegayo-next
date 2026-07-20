import { Construction } from "lucide-react";

/** 준비 중 탭용 플레이스홀더 */
export function ComingSoonPanel({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <div>
            <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                {title}
            </h1>
            <div className="border-border bg-muted/20 mt-8 flex flex-col items-center justify-center rounded-2xl border px-6 py-20 text-center">
                <div className="bg-brand/10 text-brand flex size-14 items-center justify-center rounded-2xl">
                    <Construction className="size-7" />
                </div>
                <p className="text-foreground mt-4 text-lg font-bold">
                    준비 중인 기능입니다
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                    {description}
                </p>
            </div>
        </div>
    );
}
