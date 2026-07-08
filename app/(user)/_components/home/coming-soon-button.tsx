"use client";

import { toast } from "sonner";

/** 아직 준비되지 않은 기능용 버튼 — 클릭 시 "준비 중입니다." 안내 */
export function ComingSoonButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => toast.info("준비 중입니다.")}
      className={className}
    >
      {children}
    </button>
  );
}
