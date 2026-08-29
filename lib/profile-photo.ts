/**
 * 프로필 사진 공통 상수 — #57
 * 서버(액션·signed URL 발급)와 클라이언트(업로드 전 검증) 양쪽에서 쓰므로
 * "use server" 가 붙지 않은 평범한 모듈로 둔다.
 */

export const PROFILE_PHOTO_BUCKET = "profile-photos";

/** 업로드 허용 용량 (버킷 file_size_limit 과 동일하게 유지) */
export const PROFILE_PHOTO_MAX_SIZE = 2 * 1024 * 1024;

/** 업로드 허용 형식 (버킷 allowed_mime_types 과 동일하게 유지) */
export const PROFILE_PHOTO_ALLOWED_TYPES = ["image/jpeg", "image/png"];

/** 클라이언트에서 리사이즈할 정사각 한 변 길이(px) */
export const PROFILE_PHOTO_SIZE = 512;

/** signed URL 유효 시간(초). 페이지 렌더 시점에 발급되므로 1시간이면 충분. */
export const PROFILE_PHOTO_URL_TTL = 60 * 60;

export const PROFILE_PHOTO_SIZE_MESSAGE =
    "사진은 최대 2MB까지 업로드할 수 있습니다.";
export const PROFILE_PHOTO_TYPE_MESSAGE =
    "JPG, PNG 파일만 업로드할 수 있습니다.";
