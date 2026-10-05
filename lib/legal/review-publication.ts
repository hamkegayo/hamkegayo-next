/** 사용자 확정 기준. 서비스 제공 동의 및 노션 방침 정본과 별도인 공개 동의 양식. */
export const REVIEW_PUBLICATION = {
    version: "review-publication-2026-10-04-v1",
    purpose:
        "함께가요 웹사이트에서 동행 경험을 안내하고 이용자가 파트너 선택에 참고하도록 후기를 공개합니다.",
    scope: "로그인하지 않은 방문자를 포함한 웹사이트 이용자에게 후기 목록·상세, 메인 후기 카드 및 예약 단계의 파트너 상세에서 공개됩니다. 공개 정보는 검색·복사될 수 있습니다.",
    period: "동의한 날부터 3년간 공개하며, 기간이 끝나면 공개를 중단합니다. 계속 공개하려면 별도로 다시 동의해야 합니다. 그 전에 철회하면 즉시 공개를 중단합니다.",
    subject:
        "실제 서비스 이용자가 별도로 동의해야 합니다. 예약자가 다른 경우 예약자의 동의만으로 공개하지 않으며, 실제 이용자 본인의 동의 또는 확인된 대리권과 대리 동의를 확인합니다.",
    items: "공개할 후기 제목·본문·마스킹된 작성자명·별점·상품명·게시일과, 동의서에 구체적으로 기재하고 선택한 진료·검사 종류만 공개합니다. 다른 진료 내용, 질환명, 실명, 연락처와 동의 증빙은 공개하지 않습니다.",
    withdrawal:
        "후기 식별번호를 적어 개인정보 보호책임자에게 이메일 또는 카카오톡으로 철회를 요청할 수 있습니다. 본인 또는 대리권 확인 후 해당 공개를 중단합니다. 이미 외부에서 복사한 내용이나 검색 서비스의 캐시는 직접 삭제를 보장할 수 없어 필요한 삭제 요청을 안내합니다.",
    optional:
        "후기 공개 동의와 진료·검사 정보 공개 동의는 선택 사항이며 서비스 제공 동의와 별도로 받습니다. 동의하지 않거나 철회해도 예약·결제·동행 서비스 이용에 불이익이 없습니다.",
} as const;

export const REVIEW_PUBLICATION_WORDING = [
    REVIEW_PUBLICATION.purpose,
    REVIEW_PUBLICATION.subject,
    REVIEW_PUBLICATION.items,
    REVIEW_PUBLICATION.scope,
    REVIEW_PUBLICATION.period,
    REVIEW_PUBLICATION.withdrawal,
    REVIEW_PUBLICATION.optional,
].join("\n\n");
