# 함께가요

사용자가 동행 서비스를 **예약 신청**하면, 여러 **파트너(매니저)**가 요청을 수락하고, 사용자가 그중 한 명을 선택해 서비스를 진행·정산하는 **양방향 매칭 플랫폼**입니다.

## 기술 스택

| 항목                                      | 버전 / 비고                                           |
| ----------------------------------------- | ----------------------------------------------------- |
| Next.js (App Router)                      | 16.2.10                                               |
| React                                     | 19.2.7                                                |
| TypeScript                                | ^6                                                    |
| Supabase (DB / Auth / Storage / Realtime) | @supabase/supabase-js ^2.110.0, @supabase/ssr ^0.12.0 |
| Tailwind CSS                              | ^4                                                    |
| shadcn/ui                                 | ^4.13.0                                               |
| Zustand (클라이언트 상태 관리)            | 예약 STEP 상태 관리 — `npm install zustand` 필요      |
| zod (유효성 검증)                         | 폼 검증 — `npm install zod` 필요                      |
| ESLint / Prettier / Husky / lint-staged   | 코드 품질                                             |

> **설계 원칙 — 오버엔지니어링 경계**
>
> - 복잡한 애니메이션 대신 기본 애니메이션 사용
> - 실시간 팝업 알림 대신 알림 내역 페이지 + DB Fetching (추후 고도화)
> - PG사 결제 연동 대신 무통장 입금 확인 / 가상 결제 완료 버튼으로 비즈니스 프로세스만 검증
> - 소셜 로그인은 클릭 시 "준비중입니다" 안내로 처리
> - 웹사이트는 1920px width 기준 (반응형은 추후 고려)

## 시작하기

### 1. 의존성 설치

```bash
npm install
npm install zustand zod   # 기획상 필요하지만 아직 미설치된 패키지
```

### 2. 환경변수 설정

`.env.example`을 복사해 `.env.local`을 만들고 값을 채웁니다.

```bash
cp .env.example .env.local
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY`에는 **절대 `NEXT_PUBLIC_` 접두사를 붙이지 마세요.** 브라우저에 노출되면 DB 전체 권한이 뚫립니다. 서버 코드(Server Action 등)에서만 사용합니다.

### 3. 개발 서버 실행

```bash
npm run dev
```

## 디렉터리 구조 (Route Groups 활용)

괄호 폴더는 URL 경로에 영향을 주지 않으면서 레이아웃과 접근 권한을 그룹 단위로 분리합니다.

```
app/
├── (auth)/              # 로그인 / 회원가입 그룹 (공통 레이아웃 없음)
│   ├── login/
│   └── signup/
│
├── (user)/              # 일반 사용자 서비스 그룹
│   ├── layout.tsx       # 사용자용 헤더 / 바텀바
│   ├── page.tsx         # 사용자 메인 화면
│   ├── reservation/     # 예약 STEP 0~6 (단일 page.tsx + Zustand 스텝 전환)
│   └── mypage/          # 마이페이지 (예약 현황 등)
│
├── (partner)/           # 파트너(매니저) 서비스 그룹
│   ├── layout.tsx       # 파트너용 사이드바 / 대시보드 레이아웃
│   ├── partner-main/    # 파트너 메인 (수락 대기 목록)
│   ├── management/      # 진행 관리 리스트 및 상세
│   └── settlement/      # 정산 관리 및 리포트
│
├── layout.tsx           # 최상위 글로벌 설정 (폰트, Provider 등)
└── middleware.ts        # 역할 기반 권한 필터링
```

URL 예시:

- `/` → 사용자 메인 (`(user)/page.tsx`)
- `/reservation` → 예약 페이지 (`(user)/reservation/page.tsx`)
- `/partner-main` → 파트너 메인 (`(partner)/partner-main/page.tsx`)

## 권한 분리 — middleware

각 페이지마다 검증하는 대신, `middleware.ts`에서 라우트 경로를 기준으로 역할(`USER` / `PARTNER`)을 가로채 리다이렉트합니다.

- 비로그인 유저가 `/mypage`, `/partner` 접근 → `/login`
- `USER`가 파트너 페이지(`/partner-main`, `/settlement`, `/management`) 접근 → `/`
- `PARTNER`가 사용자 페이지(`/reservation`, `/mypage`) 접근 → `/partner-main`

`role`은 `user` 테이블의 `role` 컬럼(`USER` / `PARTNER`)을 기준으로 판별합니다.

## 예약 매칭 흐름

- **데이터 모델**: `reservation` 테이블은 상태값(`MATCHING` / `CONFIRMED` / `CANCELLED`), 매칭 만료 시각(`matching_expires_at`), 확정된 `partner_id`를 가집니다. 하나의 예약에 여러 파트너의 수락 기록은 `reservation_applications` 테이블(`reservation_id`, `partner_id`, `status: ACCEPTED/SELECTED/NOT_SELECTED`, `accepted_at`)에 별도 레코드로 저장해 동시 수락 충돌을 방지합니다.
- **실시간 반영**: `reservation_applications`를 `reservation_id` 기준으로 Supabase Realtime 구독해 수락 카드/카운트를 실시간 갱신합니다. 타이머는 `matching_expires_at` 기준 클라이언트 카운트다운.
- **최종 선택**: 사용자가 파트너를 선택하면 Server Action 트랜잭션으로 `reservation.status`를 `CONFIRMED`로, 선택된 `partner_id`를 기록하고, 나머지 수락자는 `NOT_SELECTED`로 일괄 변경합니다.

> 다중 선택 항목은 배열 컬럼이 아닌 **별도 테이블로 정규화**합니다.

## 파일 업로드 (자격증)

- Supabase Storage **비공개 버킷** + **signed URL** 방식
- 서버(Server Action)에서 `SUPABASE_SERVICE_ROLE_KEY`로 signed URL 생성 / 접근 검증
- 제한: **5MB 이하**, 형식 **PNG / JPG / PDF**

## 개발 일정

1. 데이터베이스 설계 및 인증 (회원가입 / 로그인 + 기본 DB 테이블 + Next.js·Supabase 배포)
2. 예약 시스템 & 마이페이지 (예약 신청 → 상태 조회 흐름)
3. 파트너 페이지 & 진행 관리 (요청 수락 → 진행 상황 업데이트)
4. 정산 · 후기 · 예외 처리 및 배포 시연 (후속 기능 + UI 폴리싱 + 배포)

## Git 전략

### 브랜치 — 단순화된 GitHub Flow (2트랙)

- `main` : 항상 실행 가능하고 버그 없는 상태 유지 (Vercel 프로덕션 연동). **직접 푸시 금지, PR로만 merge**
- `feature/기능명` : 화면·도메인 단위 작업 브랜치

### 커밋 메시지 — `타입(스코프): 메시지`

**스코프**

- `fe` : UI, 컴포넌트, CSS, 클라이언트 상태(zustand)
- `be` : Supabase 스키마, API Routes, Server Actions, Middleware
- `common` : 공통 타입, 환경변수, 패키지 설치

**예시**

```bash
git commit -m "feat(fe): 예약 STEP 1 페이지 및 병원 선택 UI 구현"
git commit -m "feat(be): Server Actions 예약 등록 API 및 Supabase 연동"
git commit -m "feat(common): 일반/파트너 권한 분리 middleware 추가"
git commit -m "fix(fe): 회원가입 zod 에러 메시지 미출력 오류 수정"
git commit -m "refactor(fe): 중복 모달 팝업 useState 기반으로 통합"
git commit -m "chore(common): shadcn/ui dialog 컴포넌트 설치"
```

## 코드 품질 도구

### Husky + lint-staged

`git commit` 시 자동 실행:

- `*.{js,jsx,ts,tsx}` — ESLint 자동 수정 + Prettier 포맷팅
- `*.{json,css,md}` — Prettier 포맷팅

### Prettier

`prettier-plugin-tailwindcss` 포함 — Tailwind 클래스 자동 정렬 적용.
