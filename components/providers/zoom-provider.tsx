"use client";

import * as React from "react";

const STORAGE_KEY = "hamkegayo:zoom-enlarged";
const ENLARGED_SCALE = 1.5;

// localStorage와 동기화되는 모듈 단위 외부 스토어
const store = {
  enlarged: false,
  initialized: false,
  listeners: new Set<() => void>(),
};

function subscribe(callback: () => void) {
  // 최초 구독 시점(클라이언트)에 저장된 설정을 복원
  if (!store.initialized) {
    store.initialized = true;
    try {
      store.enlarged = localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      // localStorage 접근 불가(프라이빗 모드 등) 시 기본값 유지
    }
  }
  store.listeners.add(callback);
  return () => store.listeners.delete(callback);
}

function getSnapshot() {
  return store.enlarged;
}

function getServerSnapshot() {
  return false;
}

function setEnlarged(value: boolean) {
  store.enlarged = value;
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // 저장 실패는 무시
  }
  store.listeners.forEach((l) => l());
}

type ZoomContextValue = {
  /** 크게보기 활성화 여부 */
  enlarged: boolean;
  /** 크게보기 토글 */
  toggle: () => void;
  /** 명시적으로 설정 */
  setEnlarged: (value: boolean) => void;
};

const ZoomContext = React.createContext<ZoomContextValue | null>(null);

/**
 * 사용자 서비스 전역 "크게보기" 상태.
 * 활성화 시 감싼 영역 전체를 1.5배 확대하고, 설정을 localStorage에 유지한다.
 */
const ANIM_DURATION = 320; // ms
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function ZoomProvider({ children }: { children: React.ReactNode }) {
  const enlarged = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // 매 프레임 zoom 값을 보간해 부드러운 확대/축소(리플로우) 애니메이션 구현
  const target = enlarged ? ENLARGED_SCALE : 1;
  const [scale, setScale] = React.useState(target);
  const scaleRef = React.useRef(target);
  const firstRun = React.useRef(true);

  React.useEffect(() => {
    const to = enlarged ? ENLARGED_SCALE : 1;
    const from = scaleRef.current;

    // 최초 마운트(저장값 복원)에는 애니메이션 없이 즉시 반영
    if (firstRun.current) {
      firstRun.current = false;
      scaleRef.current = to;
      setScale(to);
      return;
    }
    if (from === to) return;

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ANIM_DURATION);
      const next = from + (to - from) * easeInOutCubic(t);
      scaleRef.current = next;
      setScale(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enlarged]);

  const value = React.useMemo<ZoomContextValue>(
    () => ({
      enlarged,
      toggle: () => setEnlarged(!store.enlarged),
      setEnlarged,
    }),
    [enlarged],
  );

  return (
    <ZoomContext.Provider value={value}>
      <div data-enlarged={enlarged} style={{ zoom: scale }}>
        {children}
      </div>
    </ZoomContext.Provider>
  );
}

export function useZoom() {
  const ctx = React.useContext(ZoomContext);
  if (!ctx) {
    throw new Error("useZoom은 ZoomProvider 내부에서만 사용할 수 있습니다.");
  }
  return ctx;
}
