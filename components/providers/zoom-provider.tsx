"use client";

import * as React from "react";

const STORAGE_KEY = "hamkegayo:zoom-enlarged";
// 화면 폭에 따른 크게보기 배율 (좁은 화면일수록 레이아웃 여유가 없어 작게 확대)
const ENLARGED_SCALE_MOBILE = 1.2;
const ENLARGED_SCALE_DESKTOP = 1.4;
const DESKTOP_QUERY = "(min-width: 768px)"; // Tailwind md 기준

/** 현재 화면 폭에 맞는 크게보기 배율 */
function getEnlargedScale() {
    if (typeof window === "undefined") return ENLARGED_SCALE_DESKTOP;
    return window.matchMedia(DESKTOP_QUERY).matches
        ? ENLARGED_SCALE_DESKTOP
        : ENLARGED_SCALE_MOBILE;
}

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
 * 활성화 시 감싼 영역 전체를 확대하고, 설정을 localStorage에 유지한다.
 */
// zoom(=reflow)은 프레임마다 애니메이션하면 버벅이므로, 배율은 "한 번만" 즉시
// 바꾸고 그 순간을 opacity 크로스페이드로 감싼다. opacity는 Composite-only라
// GPU에서 부드럽게 처리되어 재배치(pop)가 눈에 잘 띄지 않는다.
const FADE_MS = 150; // 크로스페이드 한 방향 시간
const DIM_OPACITY = 0.15; // 전환 순간 흐려지는 정도

export function ZoomProvider({ children }: { children: React.ReactNode }) {
    const enlarged = React.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot,
    );

    // 화면 폭에 따라 달라지는 크게보기 배율 (리사이즈/브레이크포인트 전환 시 갱신)
    const [enlargedScale, setEnlargedScale] = React.useState(getEnlargedScale);

    React.useEffect(() => {
        const mq = window.matchMedia(DESKTOP_QUERY);
        const update = () => setEnlargedScale(getEnlargedScale());
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, []);

    const target = enlarged ? enlargedScale : 1;

    // 실제 적용되는 zoom 값과 흐림(dim) 상태. 전환 시: 흐려짐 → 배율 교체(reflow)
    // → 또렷해짐 순으로 진행해 리플로우가 흐려진 순간에 일어나게 한다.
    const [zoom, setZoom] = React.useState(target);
    const [dim, setDim] = React.useState(false);
    const zoomRef = React.useRef(target);
    const firstRun = React.useRef(true);

    React.useEffect(() => {
        // 최초 마운트(저장값 복원)에는 페이드 없이 즉시 반영
        if (firstRun.current) {
            firstRun.current = false;
            zoomRef.current = target;
            setZoom(target);
            return;
        }
        if (zoomRef.current === target) return;

        setDim(true); // 흐려지기 시작
        const t = setTimeout(() => {
            // 충분히 흐려진 순간에 배율(=reflow)을 한 번만 적용하고 다시 또렷하게
            zoomRef.current = target;
            setZoom(target);
            setDim(false);
        }, FADE_MS);
        return () => clearTimeout(t);
    }, [target]);

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
            <div
                data-enlarged={enlarged}
                style={{
                    zoom,
                    opacity: dim ? DIM_OPACITY : 1,
                    transition: `opacity ${FADE_MS}ms ease`,
                    willChange: "opacity",
                }}
            >
                {children}
            </div>
        </ZoomContext.Provider>
    );
}

export function useZoom() {
    const ctx = React.useContext(ZoomContext);
    if (!ctx) {
        throw new Error(
            "useZoom은 ZoomProvider 내부에서만 사용할 수 있습니다.",
        );
    }
    return ctx;
}
