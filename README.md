# 함께가요

사용자가 동행 서비스를 **예약 신청**하면, 여러 **파트너(매니저)**가 요청을 수락하고, 사용자가 그중 한 명을 선택해 서비스를 진행·정산하는 **양방향 매칭 플랫폼**입니다.

## 기술 스택

| 항목                                    | 버전 / 비고                                           |
| --------------------------------------- | ----------------------------------------------------- |
| Next.js (App Router)                    | 16.2.10                                               |
| React                                   | 19.2.7                                                |
| TypeScript                              | ^6                                                    |
| Supabase (DB / Auth / Storage)          | @supabase/supabase-js ^2.110.0, @supabase/ssr ^0.12.0 |
| Tailwind CSS                            | ^4                                                    |
| shadcn/ui                               | ^4.13.0                                               |
| Zustand                                 | ^5.0.14 — 예약 STEP 등 클라이언트 상태                |
| zod                                     | ^4.4.3 — 폼 유효성 검증                               |
| Resend                                  | 이메일 발송 (인증 메일 등)                            |
| ESLint / Prettier / Husky / lint-staged | 코드 품질                                             |

> **설계 원칙 — 오버엔지니어링 경계**
>
> - 복잡한 애니메이션 대신 기본 애니메이션 사용
> - 실시간 팝업 알림 대신 알림 내역 페이지 + DB Fetching (추후 고도화)
> - 소셜 로그인은 클릭 시 "준비중입니다" 안내로 처리
> - 웹사이트는 1920px width 기준 (반응형은 추후 고려)
>
> 결제는 초기 무통장 입금 확인 방식에서 **PG사 연동으로 전환**합니다(이슈 #46).
> 카드 등록(빌링키 발급) → 서비스 완료 → 서버 승인 요청 흐름이며, 승인 API는 반드시 서버에서 호출합니다.

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.example`을 복사해 `.env.local`을 만들고 값을 채웁니다.

```bash
cp .env.example .env.local
```

| 변수                            | 필수 | 용도                                                      |
| ------------------------------- | ---- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | ✅   | Supabase 프로젝트 URL                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅   | 클라이언트/SSR 용 공개 키 (RLS 적용)                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | ✅   | 서버 전용 관리자 키 (RLS 우회)                            |
| `RESEND_API_KEY`                | –    | 미설정 시 개발용 Mock(콘솔 출력)으로 동작                 |
| `EMAIL_FROM`                    | –    | 미설정 시 기본 발신주소 사용                              |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | –    | GA4. 값이 없으면 로드하지 않음                            |
| `NEXT_PUBLIC_META_PIXEL_ID`     | –    | Meta Pixel. 값이 없으면 로드하지 않음                     |
| `NEXT_PUBLIC_ANALYTICS_DEBUG`   | –    | 로컬에서 DebugView·Pixel Helper 검증할 때만 `true`        |
| `CRON_SECRET`                   | –    | Vercel Cron 인증용. 미설정 시 keepalive 엔드포인트가 거부 |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY`에는 **절대 `NEXT_PUBLIC_` 접두사를 붙이지 마세요.** 브라우저에 노출되면 DB 전체 권한이 뚫립니다. 서버 코드(Server Action, Route Handler)에서만 사용합니다.

> 애널리틱스는 기본적으로 **프로덕션에서 + 사용자 동의(쿠키 배너) 시에만** 로드됩니다.

### 3. 스크립트

```bash
npm run dev        # 개발 서버 (Turbopack)
npm run build      # 프로덕션 빌드
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## 디렉터리 구조 (Route Groups 활용)

괄호 폴더는 URL 경로에 영향을 주지 않으면서 레이아웃과 접근 권한을 그룹 단위로 분리합니다.
언더스코어(`_`) 폴더는 라우팅에서 제외되는 내부 전용 폴더입니다.

```
app/
├── (user)/                  # 일반 사용자 서비스 그룹
│   ├── layout.tsx           # 사용자용 헤더 / 푸터
│   ├── page.tsx             # 사용자 메인 (/)
│   ├── login/  signup/      # 로그인 / 회원가입
│   ├── reservation/         # 예약 STEP (단일 page.tsx + Zustand 스텝 전환)
│   ├── mypage/              # 마이페이지 (자체 layout.tsx 보유)
│   ├── review/              # 후기 목록 / 상세 / 작성
│   ├── service/  faq/       # 서비스 소개 / FAQ
│   └── _actions/ _components/ _lib/
│
├── (partner)/               # 파트너(매니저) 서비스 그룹
│   ├── layout.tsx           # 파트너용 레이아웃
│   ├── _components/ _lib/
│   └── partner/             # 실제 URL 프리픽스 (/partner)
│       ├── page.tsx         # 파트너 메인 (수락 대기 목록)
│       ├── requests/        # 요청 수락 / 거절
│       ├── management/      # 진행 관리 리스트 및 상세
│       ├── reports/         # 리포트 작성 / 조회
│       ├── settlement/      # 정산 관리 및 내역
│       ├── profile/  notifications/
│       └── _actions/
│
├── api/
│   └── cron/keepalive/      # Vercel Cron 진입점 (아래 "정기 작업" 참고)
│
└── layout.tsx               # 최상위 글로벌 설정 (폰트, Provider 등)

middleware.ts                # (프로젝트 루트) 역할 기반 권한 필터링
utils/supabase/              # Supabase 클라이언트 (client / server / admin / middleware)
lib/  hooks/  components/    # 공통 로직 / 훅 / UI 컴포넌트
supabase/migrations/         # DB 스키마 마이그레이션
```

**폴더 규칙**

- `_actions/` — Server Action (`"use server"`)
- `_lib/` — 서버 전용 조회 로직은 `*.server.ts`, 공용 유틸은 접미사 없음
- `_components/` — 해당 라우트 전용 컴포넌트

URL 예시:

- `/` → 사용자 메인 (`(user)/page.tsx`)
- `/reservation` → 예약 페이지 (`(user)/reservation/page.tsx`)
- `/partner` → 파트너 메인 (`(partner)/partner/page.tsx`)

## 권한 분리 — middleware

각 페이지마다 검증하는 대신, 루트 `middleware.ts`에서 라우트 경로를 기준으로 역할(`USER` / `PARTNER`)을 가로채 리다이렉트합니다.

- 비로그인 상태로 `/mypage`, `/partner`, `/reservation`, `/review/write` 접근 → `/?blocked=auth` (홈에서 로그인 안내 모달 표시)
- 로그인 상태로 `/login`, `/signup` 접근 → 역할별 홈(`PARTNER`는 `/partner`, 그 외 `/`)
- `USER`가 파트너 영역(`/partner`) 접근 → `/?blocked=partner`
- `PARTNER`가 파트너 영역 밖 접근 → `/partner?blocked=user`

`role`은 **JWT 클레임(`app_metadata.role`)** 으로 판별합니다. 원본은 `profiles.role` 컬럼이며, `auth.users.raw_app_meta_data`에 동기화되어 세션에 실립니다. 즉 요청마다 테이블을 조회하지 않습니다.

## 예약 매칭 흐름

- **데이터 모델**: `reservations` 테이블이 상태값(`MATCHING` / `CONFIRMED` / `CANCELLED` / `COMPLETED`), 예약번호(`code`), 확정 파트너(`confirmed_partner_id`)를 가집니다. 하나의 예약에 대한 파트너별 수락/거절 기록은 `reservation_applications` 테이블(`reservation_id`, `partner_id`, `status`, `reject_reason`)에 별도 레코드로 저장하며, `unique (reservation_id, partner_id)` 제약으로 중복 수락을 막습니다.
- **지원 상태값**: `PENDING` / `ACCEPTED` / `REJECTED` / `NOT_SELECTED`
- **최종 선택**: `confirm_reservation_partner()` RPC(security definer)가 단일 트랜잭션으로 `reservations.status`를 `CONFIRMED`로, `confirmed_partner_id`를 기록하고, 나머지 `ACCEPTED` 지원건을 `NOT_SELECTED`로 일괄 전이합니다. 파트너 본인이 거절한 `REJECTED`는 유지됩니다.
- **미확정 예약 만료**: 진료일시가 지난 `MATCHING` 예약은 `expire_past_matchings()` RPC로 `CANCELLED` 처리됩니다. 조회 시점 lazy 호출(`lib/expire-matchings.ts`)과 매일 도는 Cron 양쪽에서 실행되며, 여러 번 실행해도 안전합니다.

> 다중 선택 항목은 배열 컬럼이 아닌 **별도 테이블로 정규화**합니다.

## 파일 업로드 (자격증 / 리포트 첨부)

- Supabase Storage **비공개 버킷** + **signed URL** 방식
- 서버(Server Action)에서 `SUPABASE_SERVICE_ROLE_KEY`로 signed URL 생성 / 접근 검증
- 제한: **5MB 이하**, 형식 **PNG / JPG / PDF**

## 정기 작업 (Vercel Cron)

`vercel.json`에 선언하며, 프로덕션 배포에만 등록됩니다.

| 경로                  | 주기                 | 목적                                                |
| --------------------- | -------------------- | --------------------------------------------------- |
| `/api/cron/keepalive` | 매일 1회 (UTC 03:00) | Supabase 무료 플랜 일시정지 방지 + 미확정 예약 만료 |

- Supabase 무료 플랜은 **7일간 DB 활동이 없으면 프로젝트가 자동 일시정지**됩니다. 판정 기준이 "DB 쿼리"이므로 정적 페이지 핑은 CDN에서 끝나 효과가 없습니다.
- 엔드포인트는 `Authorization: Bearer $CRON_SECRET` 헤더를 검증하며, Vercel Cron이 이 헤더를 자동으로 붙입니다. `CRON_SECRET`이 **Vercel 환경변수에 등록되어 있어야** 합니다.
- Vercel Hobby 플랜은 cron **최소 주기가 하루 1회**이고 실행 시각 정밀도가 **±59분**입니다. 그보다 잦은 표현식(`*/30 * * * *` 등)은 배포 자체가 실패합니다.
- cron 문법의 `*/N`은 day-of-month 기준이라 월 경계에서 간격이 벌어집니다. 임계값 대비 여유를 확보하기 위해 **매일 1회**로 둡니다.

## 개발 일정

1. 데이터베이스 설계 및 인증 (회원가입 / 로그인 + 기본 DB 테이블 + Next.js·Supabase 배포)
2. 예약 시스템 & 마이페이지 (예약 신청 → 상태 조회 흐름)
3. 파트너 페이지 & 진행 관리 (요청 수락 → 진행 상황 업데이트)
4. 정산 · 후기 · 예외 처리 및 배포 시연 (후속 기능 + UI 폴리싱 + 배포)

## Git 전략

### 브랜치 — 단순화된 GitHub Flow (2트랙)

- `main` : 항상 실행 가능하고 버그 없는 상태 유지 (Vercel 프로덕션 연동). **직접 푸시 금지, PR로만 merge**
- 작업 브랜치 : `타입/작업명-이슈번호`

```bash
feat/analytics-ga4-meta-39
fix/DB-keepalive-47
chore/fb-domain-verification
```

- 타입은 아래 커밋 타입과 동일한 값을 사용합니다.
- 이슈가 있으면 브랜치명 끝에 이슈번호를 붙입니다.

### 커밋 메시지 — `타입(스코프) : 메시지`

콜론 **앞뒤로 공백**을 둡니다. 스코프가 애매한 설정·문서 작업은 스코프를 생략할 수 있습니다.

**타입**

- `feat` : 새 기능
- `fix` : 버그 수정
- `refactor` : 동작 변경 없는 구조 개선
- `docs` : 문서(README 등) 변경
- `chore` : 빌드·설정·의존성 등 그 외

**스코프**

- `fe` : UI, 컴포넌트, CSS, 클라이언트 상태(zustand)
- `be` : Supabase 스키마, Route Handler, Server Actions, Middleware
- `common` : 공통 타입, 환경변수, 패키지 설치

**예시**

```bash
git commit -m "feat(fe) : 예약 STEP 1 페이지 및 병원 선택 UI 구현"
git commit -m "feat(be) : 환자 정보 관리(care_recipients) CRUD 및 내 포인트 실데이터화"
git commit -m "fix(be) : Supabase 미사용 일시정지 방지 keepalive cron 추가"
git commit -m "fix(fe) : 로그인 성공 시 이동 완료까지 로딩 유지로 스피너 깜빡임 제거"
git commit -m "refactor(fe) : 중복 모달 팝업 useState 기반으로 통합"
git commit -m "docs : README 디렉터리 구조·스키마 현행화"
git commit -m "chore : 네이버 서치 어드바이저 메타 태그 추가"
```

## 코드 품질 도구

### Husky + lint-staged

`git commit` 시 자동 실행:

- `*.{js,jsx,ts,tsx}` — ESLint 자동 수정 + Prettier 포맷팅
- `*.{json,css,md}` — Prettier 포맷팅

### Prettier

`tabWidth: 4`, 큰따옴표, 세미콜론, 후행 쉼표(`all`).
`prettier-plugin-tailwindcss` 포함 — Tailwind 클래스 자동 정렬 적용.

### CI (GitHub Actions)

`main` 대상 PR마다 `.github/workflows/pr-check.yml`이 실행됩니다.

```
npm ci → npm run lint → npm run typecheck → npm run build
```

셋 중 하나라도 실패하면 merge 전에 걸립니다.
