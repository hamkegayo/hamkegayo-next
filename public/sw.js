// 함께가요 서비스워커 (#116) — **아무것도 캐싱하지 않는다.**
//
//  이 파일이 하는 일은 "설치 가능한 앱" 판정의 기반이 되는 것뿐이다.
//
//  ⚠️ fetch 리스너를 두지 않는다. 캐싱을 붙이는 순간 위험해진다.
//
//   · 세션 쿠키 + middleware 세션 갱신 + Server Actions 조합에서 인증된
//     응답이 캐시되면 **A 사용자 화면이 B 에게 보일 수 있다**
//   · /pay/[token] · /pay/result 가 stale 응답을 받으면 **돈이 어긋난다**
//
//  빈 fetch 리스너("통과만 시키는")도 두지 않는다. 모든 요청이 SW 를 한 번
//  거쳐 가 느려지기만 하고, Chrome 은 no-op 핸들러를 경고한다.
//  오프라인 캐싱이 필요해지면 화이트리스트(정적 자산·랜딩) 방식으로 별도 이슈.
//
//  ── 잘못 배포했을 때 ──────────────────────────────────────────
//
//  NEXT_PUBLIC_SW_KILL=1 로 재배포하면 등록 컴포넌트가 등록 대신 해제한다
//  (components/pwa/service-worker-register.tsx). 이 파일은 Cache-Control:
//  no-cache 로 나가므로(next.config.ts) 수정본도 바로 반영된다.

self.addEventListener("install", () => {
    // 새 버전이 대기하지 않고 바로 활성화되게 한다 — 되돌릴 때 빨리 퍼진다.
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});
