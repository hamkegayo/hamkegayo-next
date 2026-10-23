import { getNaverUserinfo } from "@/lib/auth/naver-userinfo";

export const dynamic = "force-dynamic";

// Next 는 핸들러의 두 번째 인자로 컨텍스트 객체를 넘긴다. getNaverUserinfo 를 그대로 연결하면
// 그 객체가 enabled 로 들어가 켜짐으로 읽히므로 요청만 넘기도록 감싼다.
export const GET = (request: Request) => getNaverUserinfo(request);
