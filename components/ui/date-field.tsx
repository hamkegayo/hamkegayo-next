"use client";

import { useRef } from "react";
import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * 날짜 입력 — 키보드 입력과 달력 선택을 분리한다.
 *
 *  `<input type="date">` 하나만 쓰면 클릭할 때마다 달력이 떠서 키보드로 치기가 어렵다.
 *  생년월일처럼 과거 연도를 넣어야 하는 값은 달력으로 고르는 편이 오히려 느리다.
 *
 *  그래서 보이는 입력은 **텍스트**로 두고(자유 입력, YYYY-MM-DD 로 자동 정렬),
 *  달력은 오른쪽 아이콘을 눌렀을 때만 연다. 달력 자체는 브라우저 기본 위젯을 쓴다 —
 *  직접 만들면 접근성·모바일 동작을 다시 구현해야 한다.
 */

/** 숫자만 남겨 "1950-01-01" 꼴로 정렬한다. 입력 중간 상태도 자연스럽게 이어진다. */
export function formatDateInput(value: string): string {
    const d = value.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 4) return d;
    if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

/** 완성된 날짜인지 (달력 위젯에 넘길 수 있는 값인지) */
function isCompleteDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function DateField({
    id,
    value,
    onChange,
    min,
    max,
    invalid,
    disabled,
    placeholder = "YYYY-MM-DD",
    className,
}: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    min?: string;
    max?: string;
    invalid?: boolean;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
}) {
    const pickerRef = useRef<HTMLInputElement>(null);

    const openPicker = () => {
        const el = pickerRef.current;
        if (!el) return;
        try {
            // showPicker() 는 사용자 제스처가 있어야 하고 요소가 display:none 이면 던진다.
            // 아래 숨김 input 은 크기만 0 이고 렌더는 되어 있어 호출할 수 있다.
            el.showPicker();
        } catch {
            // 미지원 브라우저 — 포커스만 주면 사용자가 직접 열 수 있다.
            el.focus();
        }
    };

    return (
        <div className={cn("relative", className)}>
            <Input
                id={id}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder={placeholder}
                maxLength={10}
                value={value}
                disabled={disabled}
                aria-invalid={invalid}
                onChange={(e) => onChange(formatDateInput(e.target.value))}
                className="pr-11"
            />

            <button
                type="button"
                onClick={openPicker}
                disabled={disabled}
                aria-label="달력에서 날짜 선택"
                className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring/40 absolute top-5.5 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md transition-colors focus-visible:ring-[3px] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
                <CalendarDays className="size-4" />
            </button>

            {/*
              달력 위젯 전용 숨김 input.
              display:none 이면 showPicker() 가 던지므로 크기만 0 으로 둔다.
              탭 이동과 스크린리더에서는 제외한다 — 위 텍스트 입력이 본체다.
            */}
            <input
                ref={pickerRef}
                type="date"
                tabIndex={-1}
                aria-hidden
                min={min}
                max={max}
                value={isCompleteDate(value) ? value : ""}
                onChange={(e) => onChange(e.target.value)}
                className="pointer-events-none absolute right-3 bottom-0 size-0 opacity-0"
            />
        </div>
    );
}
