"use client";

import { useEffect, useRef, useState } from "react";
import { Info, Upload, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import {
    PROFILE_PHOTO_ALLOWED_TYPES,
    PROFILE_PHOTO_MAX_SIZE,
    PROFILE_PHOTO_SIZE,
    PROFILE_PHOTO_SIZE_MESSAGE,
    PROFILE_PHOTO_TYPE_MESSAGE,
} from "@/lib/profile-photo";

/** 원본 비율을 유지한 채 가운데를 정사각으로 잘라 그릴 좌표 */
function centerSquare(width: number, height: number) {
    const side = Math.min(width, height);
    return { sx: (width - side) / 2, sy: (height - side) / 2, side };
}

/**
 * EXIF 방향(회전)을 반영해 이미지를 읽는다.
 * createImageBitmap 의 imageOrientation 을 못 쓰는 환경에서는 <img> 로 폴백하는데,
 * 최신 브라우저는 <img> 렌더링에도 EXIF 방향을 기본 적용한다.
 */
async function loadImage(file: File): Promise<HTMLImageElement | ImageBitmap> {
    if (typeof createImageBitmap === "function") {
        try {
            return await createImageBitmap(file, {
                imageOrientation: "from-image",
            });
        } catch {
            // 폴백으로 진행
        }
    }
    const url = URL.createObjectURL(file);
    try {
        return await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
            img.src = url;
        });
    } finally {
        // 로드 완료 후에는 해제해도 canvas 그리기에 영향이 없다.
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
}

function sizeOf(source: HTMLImageElement | ImageBitmap) {
    return source instanceof HTMLImageElement
        ? { width: source.naturalWidth, height: source.naturalHeight }
        : { width: source.width, height: source.height };
}

/**
 * 512×512 정사각 JPEG 으로 재인코딩한다.
 * canvas 로 다시 그려 내보내므로 원본의 EXIF(촬영 위치·기기 정보 등)는 결과 파일에 남지 않는다.
 */
async function toSquareJpeg(file: File): Promise<File> {
    const source = await loadImage(file);
    const { width, height } = sizeOf(source);
    if (!width || !height) throw new Error("이미지를 읽을 수 없습니다.");

    const canvas = document.createElement("canvas");
    canvas.width = PROFILE_PHOTO_SIZE;
    canvas.height = PROFILE_PHOTO_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이미지를 처리할 수 없습니다.");

    const { sx, sy, side } = centerSquare(width, height);
    ctx.drawImage(
        source,
        sx,
        sy,
        side,
        side,
        0,
        0,
        PROFILE_PHOTO_SIZE,
        PROFILE_PHOTO_SIZE,
    );
    if (!(source instanceof HTMLImageElement)) source.close();

    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) throw new Error("이미지를 처리할 수 없습니다.");

    return new File([blob], "profile.jpg", { type: "image/jpeg" });
}

export function ProfilePhotoModal({
    open,
    onClose,
    currentUrl,
    pending = false,
    onSave,
    onDelete,
}: {
    open: boolean;
    onClose: () => void;
    /** 현재 등록된 사진 URL (없으면 null) */
    currentUrl: string | null;
    pending?: boolean;
    /** 512×512 JPEG 로 변환된 파일 */
    onSave: (file: File) => void;
    onDelete: () => void;
}) {
    // 선택한 파일과 그 미리보기 URL 은 항상 함께 교체된다.
    // (따로 두고 effect 로 동기화하면 URL 해제 시점이 렌더에 끌려다닌다)
    const [picked, setPicked] = useState<{ file: File; url: string } | null>(
        null,
    );
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const previewUrlRef = useRef<string | null>(null);

    /** 이전 미리보기 URL 을 해제하고 새 선택으로 교체 */
    const replacePicked = (next: { file: File; url: string } | null) => {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = next?.url ?? null;
        setPicked(next);
    };

    // 언마운트 시 남아 있는 미리보기 URL 정리
    useEffect(
        () => () => {
            if (previewUrlRef.current)
                URL.revokeObjectURL(previewUrlRef.current);
        },
        [],
    );

    const reset = () => {
        replacePicked(null);
        setError(null);
        setProcessing(false);
        if (fileRef.current) fileRef.current.value = "";
    };

    const close = () => {
        reset();
        onClose();
    };

    const pick = async (original: File | null) => {
        setError(null);
        if (!original) return;

        if (!PROFILE_PHOTO_ALLOWED_TYPES.includes(original.type)) {
            setError(PROFILE_PHOTO_TYPE_MESSAGE);
            return;
        }
        if (original.size > PROFILE_PHOTO_MAX_SIZE) {
            setError(PROFILE_PHOTO_SIZE_MESSAGE);
            return;
        }

        setProcessing(true);
        try {
            const resized = await toSquareJpeg(original);
            replacePicked({
                file: resized,
                url: URL.createObjectURL(resized),
            });
        } catch {
            setError("이미지를 처리할 수 없습니다. 다른 사진을 선택해 주세요.");
            replacePicked(null);
        } finally {
            setProcessing(false);
        }
    };

    const busy = pending || processing;
    const shownUrl = picked?.url ?? currentUrl;

    return (
        <Modal open={open} onClose={close} className="max-w-md">
            <div className="flex items-start justify-between">
                <h3 className="text-foreground text-lg font-extrabold">
                    프로필 사진 변경
                </h3>
                <button
                    type="button"
                    onClick={close}
                    aria-label="닫기"
                    className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-full transition-colors"
                >
                    <X className="size-5" />
                </button>
            </div>

            <div className="mt-5 flex flex-col items-center">
                <Avatar
                    src={shownUrl}
                    alt="프로필 사진 미리보기"
                    className="bg-muted size-32"
                    iconClassName="text-muted-foreground"
                />
                <input
                    ref={fileRef}
                    type="file"
                    accept={PROFILE_PHOTO_ALLOWED_TYPES.join(",")}
                    onChange={(e) => pick(e.target.files?.[0] ?? null)}
                    className="hidden"
                />
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="border-border bg-background text-foreground hover:bg-muted mt-4 inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60"
                >
                    <Upload className="size-4" />
                    {processing ? "처리 중..." : "사진 선택"}
                </button>
                <p className="text-muted-foreground mt-2 text-xs">
                    JPG, PNG (최대 2MB) · 가운데를 정사각형으로 잘라 저장합니다
                </p>
                {error && (
                    <p className="text-destructive mt-2 text-center text-xs font-medium">
                        {error}
                    </p>
                )}
            </div>

            <div className="bg-muted/50 text-muted-foreground mt-5 flex gap-2 rounded-xl p-4 text-xs leading-relaxed">
                <Info className="mt-0.5 size-4 shrink-0" />
                <div>
                    <p className="text-foreground font-bold">
                        수집·이용 및 공개 범위 안내
                    </p>
                    <p className="mt-1">
                        프로필 사진은 파트너 본인 확인을 돕기 위해 수집되며,
                        회원님이 수락한 예약의{" "}
                        <span className="font-semibold">
                            해당 고객이 파트너를 선택하는 화면
                        </span>
                        에만 표시됩니다. 사진에 담긴 위치정보 등(EXIF)은 업로드
                        과정에서 제거되며, 등록한 사진은 언제든지 삭제할 수
                        있습니다.
                    </p>
                </div>
            </div>

            <div className="mt-6 flex gap-3">
                {currentUrl && (
                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={busy}
                        className="border-destructive/40 bg-background text-destructive hover:bg-destructive/5 rounded-lg border px-4 py-3 text-sm font-bold transition-colors disabled:opacity-60"
                    >
                        삭제
                    </button>
                )}
                <button
                    type="button"
                    onClick={close}
                    className="border-border bg-background text-foreground hover:bg-muted flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors"
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={() => picked && onSave(picked.file)}
                    disabled={!picked || busy}
                    className={cn(
                        "flex-1 rounded-lg px-4 py-3 text-sm font-bold transition-colors",
                        picked && !busy
                            ? "bg-brand text-brand-foreground hover:bg-brand/90"
                            : "bg-muted text-muted-foreground cursor-not-allowed",
                    )}
                >
                    저장
                </button>
            </div>
        </Modal>
    );
}
