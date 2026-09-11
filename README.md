# 함께가요 — 병원동행 매칭·결제 플랫폼

이용자가 병원동행을 예약하면 여러 파트너가 수락하고, 이용자가 한 명을 선택해 **선결제 → 수행 → 정산**까지 진행하는 양방향 매칭 플랫폼입니다.

**2026.03 ~ 진행 중** · Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres·Auth·Storage·pg_cron) · Zustand · Zod · Tailwind CSS 4 · NICEPAY · GitHub Actions · Vercel

|        |                                                                    |
| ------ | ------------------------------------------------------------------ |
| 저장소 | https://github.com/hamkegayo/hamkegayo-next                        |
| 서비스 | 준비 중 — PG사 심사 진행 중                                        |
| 규모   | 페이지 36 · 마이그레이션 46 (테이블 25 · RPC 68) · PR 71 · 이슈 61 |

## 팀

기획·홍보 팀원과 함께 만들고 있습니다. 개발 영역은 1인이 담당합니다.

| 역할     | 담당                                                                    |
| -------- | ----------------------------------------------------------------------- |
| 기획     | 서비스 정책, 약관·개인정보처리방침·파트너 현장업무 매뉴얼 원문 (Notion) |
| 홍보     | 마케팅·홍보                                                             |
| **개발** | **설계 · UI/UX 디자인 · 프론트엔드 · 백엔드 · CI** (1인)                |

- **2026.03 ~ 06** — 기획 문서 검토, 개발 범위 확정, AI·Figma 기반 이용자·파트너 화면 디자인
- **2026.07 ~** — 개발

약관·방침 원문은 기획이 관리하고, 개발은 그 조항을 **DB 정책·테스트로 옮기는 쪽**을 맡습니다. 조항과 구현이 어긋나면 PR에서 조항 번호를 근거로 기획과 맞춥니다 — 아래 [5장](#5-약관개인정보처리방침을-db-정책으로-강제)이 그 결과입니다.

> 앞부분은 **설계 판단의 기록**이고, [실행](#실행)부터는 개발 문서입니다.

---

## 1. 전환 추적을 민감정보가 새지 않는 구조로

**문제** — 마케팅 집행에 GA4·Meta Pixel 전환 추적이 필요했지만, 이용자 입력 대부분이 진료·건강 정보라 **파라미터 하나만 잘못 실어도 민감정보가 외부 광고 플랫폼으로 나갑니다.** 게다가 Vercel은 프리뷰 배포도 `NODE_ENV=production`이라 테스트 트래픽이 운영 데이터셋을 오염시킵니다.

**선택**

- 동의 확인을 **스크립트 로드 시점과 이벤트 전송 시점에 이중으로** 배치 — 세션 중 동의 철회까지 반영
- 환경변수가 아니라 **운영 호스트명 기준**으로 스크립트를 로드 — 프리뷰·`*.vercel.app` 트래픽이 수집되지 않음
- 퍼널 이벤트(가입 → 서비스 조회 → 플랜 선택 → 결제 시작 → 예약 완료 → 문의)를 전송 함수 단위로 한 모듈에 모으고, **전송 금지 항목을 주석으로 명시**
- Pixel 이벤트마다 고유 `eventID` 발급 — Conversions API 도입 시 중복 집계 방지. 최초 로드는 GA config·Pixel init이 `page_view`를 자동 전송하므로 수동 전송은 라우트 변경에만 붙여 **첫 화면 이중 집계를 막았습니다**

**결과** — 오픈 전에 운영 데이터셋 분리와 동의 기반 수집 경로를 확보해, 오픈 첫날부터 오염 없는 퍼널 데이터를 쌓을 수 있는 상태입니다.

`components/analytics/` · `lib/analytics.ts`

## 2. 결제 승인 라우트 — 청구 지점 앞뒤의 실패를 전부 분류

**문제** — PG 승인 API를 호출하는 순간 **실제 청구가 발생**합니다. 승인 후 DB 확정이 실패하거나 서버리스 함수가 중간에 종료되면 "돈은 빠지고 예약은 미확정"인 상태가 되고, 복구할 기록조차 남지 않습니다.

**선택**

- 검증 순서 고정 — 서명 검증 → 주문 조회 → 금액 대조 → 만료·재선택 재확인 → PG 승인 → 결제·예약 확정 단일 트랜잭션 → 실패 시 망취소·포인트 복원
- **실행 시간 예산을 코드에 명시** — 승인 20초 + 복구 10초 + DB ≈ 31초, 함수 상한 60초. 상한이 어댑터 타임아웃보다 작으면 **망취소가 실행되지 않으므로** 두 값의 관계를 주석으로 고정
- 결제·환불 사고 **9개 유형**을 심각도(`CRITICAL`/`HIGH`/`MEDIUM`)·처리상태와 함께 enum으로 정의하고 담당자에게 메일 발송
    - 승인 — `CANCEL_FAILED` · `APPROVE_INDETERMINATE` · `POINT_RESTORE_FAILED` · `STATE_MISMATCH` · `AMOUNT_MISMATCH` · `UNKNOWN_ORDER` · `FINALIZE_FAILED`
    - 환불 — `REFUND_FAILED` · `REFUND_RECORD_FAILED`. 뒤쪽이 더 위험합니다 — PG 취소는 됐는데 기록이 없으니 **재시도하면 두 번 환불됩니다**
- 사고 기록 모듈은 **절대 예외를 던지지 않도록** 설계 — 보상 처리 도중 호출되므로 여기서 실패하면 이미 처리된 결제를 되돌릴 수 없습니다. 적재에 실패해도 알림은 시도합니다

`app/api/payments/confirm/route.ts` · `lib/payments/`

## 3. 실제 사고를 개인의 주의가 아니라 lint·CI 규칙으로

한 번 난 사고가 다시 나지 않게 하는 방법은 "조심하기"가 아니라 **같은 코드를 쓸 수 없게 만드는 것**이라고 봤습니다.

- **시간대 사고** — Vercel(UTC)과 개발 환경(KST) 차이로 파트너 확정 시각이 9시간 어긋나 표시되고, KST 09시 이전에 만든 예약번호에 전날 날짜가 박혔습니다. 테스트도 KST에서 돌아 재현되지 않았습니다.
  → KST 명시 포맷 함수로 통일하고, **로컬 시간대 `Date` 접근자를 ESLint `no-restricted-syntax`로 금지**했습니다. `getFullYear`·`getMonth`·`getHours` 등을 쓰면 커밋 단계에서 막힙니다.
- **알림 링크 404** — 존재하지 않는 라우트를 가리키는 알림이 타입 검사와 빌드를 모두 통과해 프로덕션에서 404가 났습니다.
  → `app/**/page.tsx`에서 **라우트 목록을 복원해** 알림 링크·`redirect()`·`router.push()` 경로를 대조하는 검사기를 만들어 CI에 넣었습니다.
- **권한 우회 방지** — RLS를 통째로 우회하는 `service_role` 클라이언트를 **관리자 영역에서 import하지 못하도록** `no-restricted-imports`로 차단했습니다. 관리자 조회는 접속기록이 남는 RPC로만 갑니다.
- **운영 DB 오염 방지** — 스테이징 도입에 맞춰 시드 스크립트 가드를 "localhost만 허용"에서 **"원격 기본 차단 + 대상 프로젝트 ref 직접 입력 + 운영 ref 차단 목록"**으로 바꿨습니다. 허용 목록은 환경이 늘 때마다 고쳐야 하지만, 차단 목록은 새 환경이 생겨도 유효합니다.

`eslint.config.mjs` · `scripts/check-links.mjs` · `scripts/_target-guard.mjs`

## 4. "무엇이 안 되는가"를 검증하는 CI

**문제** — 통합 테스트 스크립트는 있었지만 **CI에서 하나도 돌지 않았습니다.** 권한 경계가 깨져도 화면은 정상으로 보이고, 사고가 난 뒤에야 드러나는 구조였습니다.

**선택**

- GitHub Actions에서 로컬 Supabase 스택을 띄워 **매 PR마다 마이그레이션 46개를 0부터 적용** — 마이그레이션 정합성 검사를 겸합니다
- 권한·RLS·보존 경계 통합 테스트 **8종** 실행 — 파트너 개인정보 3단계, 관리자 접근통제, 정산 계좌 열람, 탈퇴 시 보존·파기, 비밀번호 재설정 후 세션 실효, 약관 재동의 등
- DB가 필요 없는 검사(요금 계산 단위 테스트, 링크 검사, 약관 버전 무결성)는 **별도 job으로 분리**해 수 초 안에 먼저 실패시킵니다

**포기한 것** — PG 샌드박스 실호출 테스트는 CI에서 제외했습니다. 외부 장애가 CI 실패로 둔갑하면 **아무도 CI 결과를 믿지 않게 됩니다.**

**트러블슈팅** — 테스트에 쓰지 않는 메일 컨테이너가 포트를 점유해 CI가 무작위로 깨졌습니다. 불필요한 서비스를 기동 대상에서 빼 해결하면서 기동 시간도 줄었고(2분 37초 → 1분 48초), CLI 버전을 고정해 업데이트 시 서비스명이 바뀌어 깨지는 경로도 막았습니다.

`.github/workflows/be-check.yml`

## 5. 약관·개인정보처리방침을 DB 정책으로 강제

문서가 공개한 약속과 코드가 어긋나면, 어긋난 쪽이 곧 사고입니다. 조항을 **화면 문구가 아니라 DB 정책과 테스트로** 옮겼습니다.

- **파트너 개인정보 3단계 노출** — 매칭 전(병원명·지역 등 최소 정보) → 선결제 확정 후(성명·연락처·상세주소) → 수행기록 제출 또는 종료 24시간 후 차단. RLS는 행 단위라 컬럼을 가릴 수 없어 **1단계는 RPC로** 필요한 열만 내보내고, 주소는 동 단위로 가공합니다. _(처리방침 제5조·제9조)_
- **Realtime 구독을 기각하고 폴링** — 파트너 대기 목록을 Realtime으로 실시간 갱신하는 안(#27)을 설계 단계에서 기각했습니다. Realtime의 권한 판정은 행(RLS)과 역할 단위라, **같은 파트너에게 매칭 전엔 가리고 확정 후엔 보여줘야 하는 열**도, **동 단위로 가공한 주소**도 표현할 수 없습니다. 위 RPC가 막은 정보가 구독 채널로 새는 경로가 생깁니다.
  → 파트너 목록은 15초, 이용자 매칭 화면은 5초 주기로 다시 조회하고 **백그라운드 탭에서는 멈춥니다.** 즉시성을 몇 초 포기하는 대신 조회 경로를 RPC 하나로 유지했습니다.
- **매칭 만료 처리** — Vercel Hobby 크론은 하루 1회가 한계라 30분 결제 기한에 맞지 않습니다. **DB pg_cron 5분 주기 + 조회 직전 lazy 폴백**으로 처리하고, 폴백은 인스턴스당 1분 스로틀을 걸어 과호출을 막았습니다.
- **상태형 알림 중복 방지** — 부분 유니크 인덱스는 `ON CONFLICT`가 인덱스 조건을 추론해야 하는데 PostgREST가 그것을 전달하지 못해 **upsert가 조용히 0건이 되는 것을 스테이징에서 확인**했습니다. 전체 유니크 인덱스 + null 키로 사건형·상태형 알림을 구분하는 방식으로 바꿨습니다.
- **개정 감지** — 약관 본문이 바뀌었는데 버전을 올리지 않으면 동의 이력이 어느 본문에 대한 것인지 식별할 수 없습니다. **버전별 본문 해시를 CI가 대조**해, 본문만 고치고 버전을 잊으면 빌드가 실패합니다.

---

# 실행

## 1. 의존성

```bash
npm install
```

Node 22.6 이상이 필요합니다. 일부 스크립트가 `--experimental-strip-types`를 씁니다.

## 2. 환경변수

`.env.example`을 복사해 `.env.local`을 만들고 값을 채웁니다.

```bash
cp .env.example .env.local
```

| 변수                             | 필수 | 용도                                                   |
| -------------------------------- | ---- | ------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`       | ✅   | Supabase 프로젝트 URL                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | ✅   | 클라이언트·SSR 공개 키 (RLS 적용)                      |
| `SUPABASE_SERVICE_ROLE_KEY`      | ✅   | 서버 전용 키 (RLS 우회)                                |
| `NEXT_PUBLIC_NICEPAY_CLIENT_KEY` | –    | 결제창 호출용 (노출 전제)                              |
| `NICEPAY_SECRET_KEY`             | –    | 승인 API 인증용                                        |
| `NEXT_PUBLIC_SITE_URL`           | –    | 결제 링크·메일의 절대 주소. 미설정 시 운영 주소로 폴백 |
| `RESEND_API_KEY`                 | –    | 미설정 시 콘솔 Mock으로 동작                           |
| `EMAIL_FROM`                     | –    | 미설정 시 기본 발신주소                                |
| `PAYMENT_ALERT_EMAIL`            | –    | 결제 사고 수신자. 미설정 시 적재만 하고 발송 안 함     |
| `CRON_SECRET`                    | –    | Vercel Cron 인증. 미설정 시 크론 엔드포인트가 거부     |
| `DATA_GO_KR_SERVICE_KEY`         | –    | 공휴일 판정(주말·공휴일 할증). 미설정 시 폴백 테이블   |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID`  | –    | GA4. 값이 없으면 로드하지 않음                         |
| `NEXT_PUBLIC_META_PIXEL_ID`      | –    | Meta Pixel. 값이 없으면 로드하지 않음                  |
| `NEXT_PUBLIC_ANALYTICS_DEBUG`    | –    | 로컬에서 DebugView·Pixel Helper로 검증할 때만 `true`   |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY`와 `NICEPAY_SECRET_KEY`에는 **절대 `NEXT_PUBLIC_` 접두사를 붙이지 마세요.** 붙이는 순간 클라이언트 번들에 박혀 누구나 DB 전체를 읽거나 결제를 승인·취소할 수 있습니다.

> 애널리틱스는 **운영 호스트 + 사용자 동의** 두 조건을 모두 만족할 때만 로드됩니다.

## 3. 스크립트

```bash
npm run dev              # 개발 서버
npm run build            # 프로덕션 빌드
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit

npm run check:links      # 알림·리다이렉트 링크가 실제 라우트를 가리키는지
npm run test:pricing     # 요금 계산 단위 테스트 (DB 불필요)
npm run test:legal       # 약관·방침 버전 무결성 (DB 불필요)

npm run seed:dev         # 로컬 테스트 계정 (사용자·파트너)
npm run seed:admin       # 최초 관리자 계정
```

DB가 필요한 통합 테스트는 `npx supabase start` 후 `npm run test:*`로 실행합니다. 전체 목록은 `package.json`을 참고하세요.

> 시드·테스트 스크립트는 대상 프로젝트를 검사합니다. 로컬은 그냥 통과하고, 원격은 `SEED_TARGET_REF`에 대상 ref를 **직접 입력**해야 열리며, 운영 ref는 입력해도 차단됩니다.

---

# 구조

## 디렉터리 (Route Groups)

```
app/
├── (user)/      # 이용자 — 예약, 마이페이지, 후기, 법무 페이지
├── (partner)/   # 파트너 — 요청 수락, 진행 관리, 리포트, 정산
├── (admin)/     # 관리자 — service_role import 금지 (lint)
├── pay/         # 결제창 복귀·링크결제
└── api/
    ├── cron/     # keepalive · reminders
    └── payments/ # prepare · confirm · status

middleware.ts        # 역할 기반 권한 필터링
lib/                 # 도메인 로직 (payments · legal · analytics · otp …)
utils/supabase/      # client / server / admin / middleware
supabase/migrations/ # 스키마 마이그레이션
scripts/             # 시드 · 통합 테스트 · 검사기
```

**폴더 규칙** — `_actions/`는 Server Action, `_lib/`의 서버 전용 조회는 `*.server.ts`, `_components/`는 해당 라우트 전용입니다.

## 권한 분리

페이지마다 검증하는 대신 루트 `middleware.ts`가 경로를 기준으로 역할(`USER`/`PARTNER`/`ADMIN`)을 가로챕니다. `role`은 **JWT 클레임**(`app_metadata.role`)으로 판별하므로 요청마다 테이블을 조회하지 않습니다. 원본은 `profiles.role`이고 `auth.users.raw_app_meta_data`에 동기화됩니다.

## 예약 매칭

`reservations`가 상태(`MATCHING`/`CONFIRMED`/`CANCELLED`/`COMPLETED`)와 확정 파트너를 갖고, 파트너별 수락·거절은 `reservation_applications`에 별도 행으로 남습니다(`unique (reservation_id, partner_id)`).

최종 선택은 `confirm_reservation_partner()` RPC가 **단일 트랜잭션**으로 처리합니다 — 예약을 `CONFIRMED`로 전이하고 나머지 `ACCEPTED` 지원건을 `NOT_SELECTED`로 일괄 정리합니다.

> 다중 선택 항목은 배열 컬럼이 아니라 **별도 테이블로 정규화**합니다.

## 파일 업로드

Supabase Storage **비공개 버킷** + signed URL. 서버에서 `service_role`로 URL을 발급하고 접근을 검증합니다. 제한은 5MB · PNG/JPG/PDF입니다.

## 정기 작업

| 위치        | 작업                                   | 주기             |
| ----------- | -------------------------------------- | ---------------- |
| Vercel Cron | `/api/cron/keepalive`                  | 매일 (UTC 03:00) |
| Vercel Cron | `/api/cron/reminders`                  | 매일 (UTC 01:00) |
| pg_cron     | `expiry-sweep` — 만료 예약·결제 정리   | 5분              |
| pg_cron     | `retention-purge` — 보유기간 만료 파기 | 매일 (KST 03:10) |

Vercel Hobby는 크론 **2개·하루 1회**가 한계입니다. 5분 주기가 필요한 작업과 HTTP 표면이 필요 없는 DB 작업은 pg_cron으로 뺐습니다 — 외부에서 호출할 엔드포인트 자체가 생기지 않습니다.

---

# 개발 규칙

## 브랜치 — GitHub Flow (3트랙)

| 브랜치      | 역할                                      | 배포 대상 |
| ----------- | ----------------------------------------- | --------- |
| `main`      | 항상 실행 가능한 상태. 릴리스 머지만 받음 | 운영      |
| `dev`       | 상시 통합 브랜치. 작업 브랜치의 base      | 스테이징  |
| 작업 브랜치 | `타입/작업명-이슈번호`                    | PR 프리뷰 |

머지 방향은 **작업 → `dev` → `main`**이고, 두 브랜치 모두 직접 푸시 금지·PR 필수·CI 통과 필수입니다.

> 작업 브랜치의 프리뷰는 배포마다 URL이 바뀝니다. 그래서 NICEPAY `returnUrl`, OAuth 리다이렉트, PWA 서비스워커(origin 단위)를 검증할 수 없습니다. `dev`에 고정 도메인을 붙여 "운영에 올려야만 알 수 있는 것"을 없앴습니다.

## 커밋 — `타입(스코프) : 메시지`

콜론 앞뒤에 공백을 둡니다. 타입은 `feat` · `fix` · `refactor` · `docs` · `chore` · `test`, 스코프는 `fe`(UI·클라이언트 상태) · `be`(스키마·Server Action·미들웨어) · `common`(공통 타입·환경변수·패키지)입니다.

```bash
git commit -m "feat(be) : 환자 정보 관리(care_recipients) CRUD 및 내 포인트 실데이터화"
git commit -m "fix(fe) : 로그인 성공 시 이동 완료까지 로딩 유지로 스피너 깜빡임 제거"
```

## 코드 품질

- **Husky + lint-staged** — 커밋 시 변경된 파일만 `eslint --fix` → `prettier --write`
- **Prettier** — 4칸 들여쓰기, 큰따옴표, 세미콜론, 후행 쉼표. `prettier-plugin-tailwindcss`로 클래스 자동 정렬
- **CI** — PR마다 두 워크플로가 병렬로 돕니다
    - `Frontend CI Check` — lint · typecheck · build (Node 20)
    - `Backend CI Check` — 순수 검사(수 초) + 로컬 Supabase 스택 위 통합 테스트 (Node 22)
