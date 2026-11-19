"use client";

/**
 * 고객센터 전화 안내 모달 열림 상태 (#304).
 *
 *  install-prompt-store 의 설치 시트와 같은 구조다. 버튼은 여는 신호만 보내고
 *  모달은 root layout 의 PhoneContactModalHost 하나가 그린다.
 *
 *  - 한 화면에 전화 버튼이 여러 개여도 모달은 하나만 마운트된다.
 *  - 버튼 마크업에 닫힌 모달·전화번호 텍스트가 섞이지 않는다 — 예약 화면의
 *    "버튼에 전화번호를 노출하지 않는다" 테스트(direct-ui.test.ts)가 이를 검사한다.
 *
 *  링크(phone-contact-link)는 이 파일만 가져온다. 모달·QR 코드 모듈은
 *  호스트에만 붙어 버튼마다 번들에 끌려오지 않는다.
 */

export type PhoneContactModalState = {
    open: boolean;
    /**
     * 연 시각(ms). 상담 가능 여부는 이 값으로 계산한다 — 렌더 중에
     * `Date.now()` 를 부르면 렌더가 순수하지 않게 된다.
     */
    openedAt: number | null;
};

const CLOSED: PhoneContactModalState = { open: false, openedAt: null };
let state: PhoneContactModalState = CLOSED;
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((l) => l());
}

export function subscribePhoneContactModal(onChange: () => void): () => void {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
}

export function getPhoneContactModal(): PhoneContactModalState {
    return state;
}

/** 서버·하이드레이션 동안에는 항상 닫혀 있다 */
export function getServerPhoneContactModal(): PhoneContactModalState {
    return CLOSED;
}

export function openPhoneContactModal(): void {
    if (state.open) return;
    state = { open: true, openedAt: Date.now() };
    emit();
}

export function closePhoneContactModal(): void {
    if (!state.open) return;
    state = { ...state, open: false };
    emit();
}
