/**
 * PWA 설치 유도 — 재노출 정책 (#117).
 *
 *  ## 닫기는 거절이 아니라 미루기다
 *
 *  실수로 닫은 사용자를 잃지 않되, 무한 반복은 막는다.
 *
 *  | 닫은 횟수 | 다음 노출 |
 *  | --------- | --------- |
 *  | 1회       | 14일 뒤   |
 *  | 2회       | 60일 뒤   |
 *  | 3회       | 영구 중단 |
 *
 *  X · ESC · 배경 클릭 · "나중에" · 네이티브 설치창 취소 — **모든 닫기 경로를
 *  같은 한 번으로 센다.** 영구 거부 버튼은 두지 않는다. 3회면 의사표시가
 *  충분하다. 설치(`appinstalled`)하면 영구 중단.
 *
 *  ## 저장소를 못 쓰면 띄우지 않는다
 *
 *  시크릿 모드·저장소 차단 브라우저는 `localStorage` 접근 자체가 throw 한다.
 *  그때 띄우면 닫아도 기록이 안 남아 **들어올 때마다 뜬다.** 그래서 읽기
 *  실패는 "안 띄움" 으로 폴백한다(`loadState` 가 null).
 *
 *  이 파일은 브라우저 API 를 직접 만지지 않는다 — 저장소를 인자로 받는다.
 *  그래야 CI 에서 시간·저장소 실패를 재현할 수 있다(scripts/test-pwa-prompt.mjs).
 */

/** `hamkegayo:` 접두사 — components/providers/zoom-provider.tsx 규약 */
export const STORAGE_KEY = "hamkegayo:pwa-prompt";

/** n 번째 닫기 뒤 기다리는 날수 (index = 닫은 횟수 - 1) */
export const REMIND_AFTER_DAYS = [14, 60] as const;

/** 이만큼 닫으면 다시 묻지 않는다 */
export const MAX_DISMISSALS = 3;

const DAY_MS = 86_400_000;

export type PromptState = {
    /** 닫은 횟수 */
    count: number;
    /** 마지막으로 닫은 시각 (epoch ms) */
    dismissedAt: number | null;
    /** 설치 확인됨 — 영구 중단 */
    installed?: boolean;
};

export const INITIAL_STATE: PromptState = { count: 0, dismissedAt: null };

/**
 * 저장된 문자열을 상태로. 형식이 깨졌으면 처음 상태로 본다.
 *
 *  깨진 값은 저장소 자체는 동작한다는 뜻이라 "안 띄움" 폴백 대상이 아니다.
 *  처음부터 다시 세도 최악은 한 번 더 묻는 것이다.
 */
export function parseState(raw: string | null): PromptState {
    if (!raw) return INITIAL_STATE;
    try {
        const v = JSON.parse(raw) as Partial<PromptState>;
        const count =
            typeof v.count === "number" && Number.isFinite(v.count)
                ? Math.max(0, Math.floor(v.count))
                : 0;
        const dismissedAt =
            typeof v.dismissedAt === "number" && Number.isFinite(v.dismissedAt)
                ? v.dismissedAt
                : null;
        return { count, dismissedAt, installed: v.installed === true };
    } catch {
        return INITIAL_STATE;
    }
}

/** 지금 띄워도 되는가 */
export function isEligible(state: PromptState, now: number): boolean {
    if (state.installed) return false;
    if (state.count >= MAX_DISMISSALS) return false;
    if (state.count === 0 || state.dismissedAt === null) return true;

    const waitDays = REMIND_AFTER_DAYS[state.count - 1];
    return now - state.dismissedAt >= waitDays * DAY_MS;
}

/** 한 번 닫은 뒤의 상태 */
export function afterDismiss(state: PromptState, now: number): PromptState {
    return { ...state, count: state.count + 1, dismissedAt: now };
}

/** 설치한 뒤의 상태 */
export function afterInstall(state: PromptState): PromptState {
    return { ...state, installed: true };
}

type Readable = Pick<Storage, "getItem">;
type Writable = Pick<Storage, "setItem">;

/**
 * 저장소에서 읽는다. **접근이 실패하면 null** — 호출부는 띄우지 않는다.
 */
export function loadState(storage: Readable | null): PromptState | null {
    if (!storage) return null;
    try {
        return parseState(storage.getItem(STORAGE_KEY));
    } catch {
        return null;
    }
}

/** 저장한다. 실패하면 false (기록을 못 남겼다는 뜻) */
export function saveState(
    storage: Writable | null,
    state: PromptState,
): boolean {
    if (!storage) return false;
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch {
        return false;
    }
}
