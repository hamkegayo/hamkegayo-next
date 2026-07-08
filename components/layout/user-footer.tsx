export function UserFooter() {
  return (
    <footer className="mt-auto w-full border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground md:flex-row md:gap-0">
        <span className="md:px-6">© Hospital Companion Service</span>
        <span className="hidden text-border md:inline">|</span>
        <span className="md:px-6">고객센터 09:00–18:00 (주말/공휴일 휴무)</span>
        <span className="hidden text-border md:inline">|</span>
        <span className="md:px-6">FAQ · 이용약관 · 개인정보처리방침</span>
      </div>
    </footer>
  );
}
