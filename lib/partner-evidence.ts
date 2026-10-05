export const EVIDENCE_MAX_SIZE = 5 * 1024 * 1024;
export const EVIDENCE_MAX_FILES = 5;
export type EvidenceUpload = { path: string; filename: string };
export function evidenceFileType(bytes: Uint8Array): string | null {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return "image/jpeg";
    if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n))
        return "image/png";
    if ([37, 80, 68, 70, 45].every((n, i) => bytes[i] === n))
        return "application/pdf";
    return null;
}
