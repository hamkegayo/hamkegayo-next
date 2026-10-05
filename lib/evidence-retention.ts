export function evidenceLinkTTL(
    status: {
        expiresAt: string | null;
        appealOpen: boolean;
        unavailable: boolean | null;
    } | null,
    now = Date.now(),
): number {
    if (!status || status.unavailable) return 0;
    if (!status.expiresAt || status.appealOpen) return 300;
    const remaining = Math.floor((Date.parse(status.expiresAt) - now) / 1000);
    return Number.isFinite(remaining)
        ? Math.max(0, Math.min(300, remaining))
        : 0;
}
