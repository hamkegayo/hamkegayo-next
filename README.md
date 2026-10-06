# 함께가요 — 병원동행 매칭·결제 플랫폼

![병원 대기실에서 어르신과 동행 파트너가 이야기를 나누는 모습](public/user/main-hero.png)

**함께가요**는 혼자 병원에 가기 어려운 분을 위해 검증된 동행 파트너가 병원 방문의 이동과 접수·수납 등 행정 절차를 함께하는 **병원동행 서비스**입니다. 의료 행위나 간병은 제공하지 않습니다.

이용자가 동행을 예약하면 여러 파트너가 수락하고, 이용자가 파트너의 정보를 확인해 한 명을 선택한 뒤 **선결제 → 동행 수행 → 리포트 → 정산**까지 한 곳에서 진행합니다.

|        |                                                                                            |
| ------ | ------------------------------------------------------------------------------------------ |
| 서비스 | https://www.hamkegayo.kr                                                                   |
| 저장소 | https://github.com/hamkegayo/hamkegayo-next                                                |
| 기술   | Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres·Auth·Storage·pg_cron) |
|        | Zustand · Zod · Tailwind CSS 4 · NICEPAY · Resend · GitHub Actions · Vercel                |

## 주요 기능

- **이용자** — 동행 예약, 지원한 파트너의 검증된 자격·경력 확인 및 선택, 선결제·추가결제, 진행 상황과 동행 리포트 확인, 후기 작성
- **파트너** — 요청 수락, 동행 시작·종료 기록과 리포트 제출, 자격·경력 증빙 등록, 정산 계좌 관리
- **관리자** — 자격·경력 심사, 결제·환불·예외 종료 처리, 정산 승인·이체, 후기 공개 관리 (MFA·접속기록 필수)

## 팀

기획·홍보 팀원과 함께 만들고 있으며, 개발 영역은 1인이 담당합니다.

| 역할     | 담당                                                                    |
| -------- | ----------------------------------------------------------------------- |
| 기획     | 서비스 정책, 약관·개인정보처리방침·파트너 현장업무 매뉴얼 원문 (Notion) |
| 홍보     | 마케팅·홍보                                                             |
| **개발** | **설계 · UI/UX 디자인 · 프론트엔드 · 백엔드 · CI**                      |

약관·방침 원문은 기획이 관리하고, 개발은 그 조항을 **DB 정책과 테스트로 옮기는 쪽**을 맡습니다. 조항과 구현이 어긋나면 PR에서 조항 번호를 근거로 기획과 맞춥니다.

## 설계 판단

주요 설계 판단과 근거는 [docs/design-decisions.md](docs/design-decisions.md)에 기록합니다.

1. [전환 추적을 민감정보가 새지 않는 구조로](docs/design-decisions.md#1-전환-추적을-민감정보가-새지-않는-구조로) — 동의 이중 확인, 운영 호스트 기준 로드
2. [결제 승인 라우트](docs/design-decisions.md#2-결제-승인-라우트--청구-지점-앞뒤의-실패를-전부-분류) — 청구 지점 앞뒤의 실패를 사고 유형으로 분류하고 망취소
3. [실제 사고를 lint·CI 규칙으로](docs/design-decisions.md#3-실제-사고를-개인의-주의가-아니라-lintci-규칙으로) — 시간대·링크 404·권한 우회를 코드 단계에서 차단
4. ["무엇이 안 되는가"를 검증하는 CI](docs/design-decisions.md#4-무엇이-안-되는가를-검증하는-ci) — 로컬 Supabase 위 RLS·권한 경계 테스트
5. [약관·개인정보처리방침을 DB 정책으로 강제](docs/design-decisions.md#5-약관개인정보처리방침을-db-정책으로-강제) — 개인정보 단계별 노출, 개정 감지

---

# 시작하기

## 사전 준비

- **Node.js 22.6 이상** — 일부 스크립트가 `--experimental-strip-types`를 씁니다. CI도 Node 22로 실행합니다.
- **Docker + Supabase CLI** — 로컬 DB와 DB 통합 테스트에 필요합니다 (`npx supabase`로 실행 가능).

## 로컬 실행

```bash
npm install
cp .env.example .env.local     # 아래 환경 변수 표를 보고 값을 채웁니다

npx supabase start             # 로컬 Supabase 기동, 마이그레이션 적용
npx supabase status -o env     # API_URL·ANON_KEY·SERVICE_ROLE_KEY를 .env.local에 넣습니다
npm run seed:dev               # 로컬 테스트 계정 (사용자·파트너)
npm run seed:admin             # 최초 관리자 계정

npm run dev                    # http://localhost:3000
```

결제·메일 키가 없어도 화면 개발은 가능합니다. 메일은 `RESEND_API_KEY`가 없으면 콘솔 Mock으로 동작합니다.

## 환경 변수

`.env.example`에 전체 목록과 설명이 있습니다. 실제 값은 `.env.local`과 Vercel 환경 변수에만 넣습니다.

| 변수                                                          | 필수    | 용도                                                                              |
| ------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                    | ✅      | Supabase 프로젝트 URL                                                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                               | ✅      | 클라이언트·SSR 공개 키 (RLS 적용)                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`                                   | ✅      | 서버 전용 키 (RLS 우회)                                                           |
| `POLICY_RELEASE_EFFECTIVE_DATE`                               | 운영 ✅ | 약관·방침 시행일 (`YYYY-MM-DD`). **Production에서 없으면 /terms·/privacy가 오류** |
| `NEXT_PUBLIC_NICEPAY_CLIENT_KEY`                              | –       | 결제창 호출용 (노출 전제)                                                         |
| `NICEPAY_SECRET_KEY`                                          | –       | 승인 API 인증용                                                                   |
| `NEXT_PUBLIC_SITE_URL`                                        | –       | 결제 링크·메일의 절대 주소. 미설정 시 운영 주소로 폴백                            |
| `RESEND_API_KEY` · `EMAIL_FROM`                               | –       | 메일 발송. 미설정 시 콘솔 Mock·기본 발신주소                                      |
| `PAYMENT_ALERT_EMAIL`                                         | –       | 결제 사고 수신자. 미설정 시 적재만 하고 발송 안 함                                |
| `CRON_SECRET`                                                 | –       | Vercel Cron 인증. 미설정 시 크론 엔드포인트가 거부                                |
| `DATA_GO_KR_SERVICE_KEY`                                      | –       | 공휴일 판정. 미설정 시 폴백 테이블                                                |
| `OPENING_EVENT_EMAIL_HMAC_KEY`                                | –       | 첫 1시간 이벤트 중복 참여 방지 키. 환경별로 다르게, 행사 중 교체 금지             |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` · `NEXT_PUBLIC_META_PIXEL_ID` | –       | 애널리틱스. 운영 호스트 + 사용자 동의일 때만 로드                                 |
| `NEXT_PUBLIC_SW_KILL`                                         | –       | `1`이면 서비스워커를 해제 (비상 되돌리기)                                         |
| `SEED_TARGET_REF`                                             | –       | 원격 시드·테스트 대상 ref. 운영 ref는 입력해도 차단                               |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY`, `NICEPAY_SECRET_KEY`, `OPENING_EVENT_EMAIL_HMAC_KEY`에는 **절대 `NEXT_PUBLIC_` 접두사를 붙이지 마세요.** 클라이언트 번들에 포함되어 누구나 읽을 수 있게 됩니다.

카카오·네이버 로그인 제공자 설정은 [docs/social-login.md](docs/social-login.md)를 참고하세요.

## 테스트

| 계층      | 실행                                                             | CI          |
| --------- | ---------------------------------------------------------------- | ----------- |
| 순수 검사 | `npm run lint` · `npm run typecheck` · `npm run test:pricing` 등 | 모든 PR     |
| DB 통합   | `npx supabase start` 후 `npm run test:partner` 등                | 모든 PR     |
| 외부 연동 | `npm run test:nicepay` (샌드박스 키 필요)                        | 제외 (수동) |

계층별 전체 명령과 새 테스트 작성 원칙은 [docs/testing.md](docs/testing.md)에 있습니다.

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
    ├── admin/     # 계정·결제·환불·예외 종료·정산 처리
    ├── auth/      # OAuth 콜백 보조 (네이버 응답 변환)
    ├── campaigns/ # 첫 1시간 이벤트
    ├── cron/      # keepalive · reminders
    └── payments/  # prepare · confirm · status

middleware.ts        # 역할 기반 권한 필터링
lib/                 # 도메인 로직 (pricing · payments · legal · analytics …)
utils/supabase/      # client / server / admin / middleware
supabase/migrations/ # 스키마 마이그레이션
scripts/             # 시드 · 통합 테스트 · 검사기
docs/                # 설계 기록 · 테스트 · 릴리즈·운영 절차
```

**폴더 규칙** — `_actions/`는 Server Action, `_lib/`의 서버 전용 조회는 `*.server.ts`, `_components/`는 해당 라우트 전용입니다.

## 권한 분리

페이지마다 검증하는 대신 루트 `middleware.ts`가 경로를 기준으로 역할(`USER`/`PARTNER`/`ADMIN`)을 가로챕니다. `role`은 **JWT 클레임**(`app_metadata.role`)으로 판별하므로 요청마다 테이블을 조회하지 않습니다. 원본은 `profiles.role`이고 `auth.users.raw_app_meta_data`에 동기화됩니다.

## 예약 매칭

`reservations`가 상태(`MATCHING`/`CONFIRMED`/`CANCELLED`/`COMPLETED`)와 확정 파트너를 갖고, 파트너별 수락·거절은 `reservation_applications`에 별도 행으로 남습니다(`unique (reservation_id, partner_id)`).

최종 선택은 `confirm_reservation_partner()` RPC가 **단일 트랜잭션**으로 처리합니다 — 예약을 `CONFIRMED`로 전이하고 나머지 `ACCEPTED` 지원건을 `NOT_SELECTED`로 일괄 정리합니다.

> 다중 선택 항목은 배열 컬럼이 아니라 **별도 테이블로 정규화**합니다.

## 파일 업로드

Supabase Storage **비공개 버킷** + signed URL. 서버에서 접근을 검증한 뒤 URL을 발급합니다. 제한은 파일당 5MB · PNG/JPG/PDF입니다.

## PWA

사용자·파트너 **단일 앱**입니다(`app/manifest.ts`). manifest는 origin당 하나가 원칙이라 두 앱으로 가르면 브라우저마다 다르게 설치됩니다.

서비스워커(`public/sw.js`)는 **아무것도 캐싱하지 않습니다.** 인증된 응답이 캐시되면 다른 사용자의 화면이 보일 수 있고, `/pay/*`가 stale 응답을 받으면 결제가 어긋납니다. 프로덕션 빌드에서만 등록하며, 잘못 배포했을 때는 `NEXT_PUBLIC_SW_KILL=1`로 재배포해 해제합니다.

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

## 마이그레이션 배포 순서

- 운영 DB 마이그레이션은 **앱 배포 전에** 적용하는 것이 기본입니다. 새 코드가 새 테이블·RPC를 바로 호출하기 때문입니다.
- 기능을 켜는 **활성화 마이그레이션**(공개·할인·수집 플래그 등)은 고지 화면이 Production에 배포된 것을 확인한 뒤 적용합니다.
- 원격 DB 적용은 dry-run으로 대상 파일을 확인한 뒤 진행합니다.

## 커밋 — `타입 : 메시지`

콜론 앞뒤에 공백을 둡니다. 타입은 `Feat` · `Fix` · `Refactor` · `Docs` · `Chore` · `Test`이며, 필요하면 `타입(스코프)` 형태로 `fe`(UI·클라이언트 상태) · `be`(스키마·Server Action·미들웨어) · `common`(공통 타입·환경변수·패키지)을 붙입니다.

```bash
git commit -m "Feat : 파트너 증빙 업로드 활성화 및 문의처 안내"
git commit -m "fix(fe) : 로그인 성공 시 이동 완료까지 로딩 유지로 스피너 깜빡임 제거"
```

## 코드 품질

- **Husky + lint-staged** — 커밋 시 변경된 파일만 `eslint --fix` → `prettier --write`
- **Prettier** — 4칸 들여쓰기, 큰따옴표, 세미콜론, 후행 쉼표. `prettier-plugin-tailwindcss`로 클래스 자동 정렬
- **CI** — PR마다 두 워크플로가 병렬로 돕니다 (모두 Node 22)
    - `Frontend CI Check` — lint · typecheck · 일부 순수 검사 · build
    - `Backend CI Check` — 순수 검사(수 초) + 로컬 Supabase 스택 위 마이그레이션·RLS·권한 경계 통합 테스트
