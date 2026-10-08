/** 기존 저장 문자열을 보존하면서 검색 기본 주소와 상세주소를 나눈다. */
export function splitSelectedAddress(address: string, selectedBase: string) {
    const base = selectedBase.trim();
    if (
        base &&
        (address.trim() === base || address.trim().startsWith(base + " "))
    )
        return { base, detail: address.trim().slice(base.length).trim() };
    return { base: address, detail: "" };
}

export function joinSelectedAddress(base: string, detail: string) {
    return [base.trim(), detail.trim()].filter(Boolean).join(" ");
}
