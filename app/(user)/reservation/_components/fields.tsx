import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/** Input 컴포넌트와 동일한 외형 기준 클래스 (select·textarea 공용) */
export const fieldBase =
    "w-full min-w-0 rounded-lg border border-input bg-background px-3.5 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:bg-destructive/5";

/** 라벨 (필수 항목은 앞에 파란 * 표시) */
export function FieldLabel({
    htmlFor,
    required,
    children,
}: {
    htmlFor?: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <label
            htmlFor={htmlFor}
            className="text-foreground mb-2 block text-sm font-semibold"
        >
            {required && <span className="text-brand mr-0.5">*</span>}
            {children}
        </label>
    );
}

/** 네이티브 select (우측 셰브론) */
export const NativeSelect = React.forwardRef<
    HTMLSelectElement,
    React.ComponentProps<"select">
>(function NativeSelect({ className, children, ...props }, ref) {
    return (
        <div className="relative">
            <select
                ref={ref}
                className={cn(
                    fieldBase,
                    "h-11 cursor-pointer appearance-none pr-9",
                    className,
                )}
                {...props}
            >
                {children}
            </select>
            <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2" />
        </div>
    );
});

/** 멀티라인 textarea */
export const Textarea = React.forwardRef<
    HTMLTextAreaElement,
    React.ComponentProps<"textarea">
>(function Textarea({ className, ...props }, ref) {
    return (
        <textarea
            ref={ref}
            className={cn(fieldBase, "min-h-24 resize-y py-2.5", className)}
            {...props}
        />
    );
});

/** 필드 하단 에러 메시지 */
export function FieldError({ children }: { children?: React.ReactNode }) {
    if (!children) return null;
    return <p className="text-destructive mt-1.5 text-sm">{children}</p>;
}
