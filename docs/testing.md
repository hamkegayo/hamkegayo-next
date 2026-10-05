# 테스트 가이드

함께가요의 테스트는 실행에 필요한 것에 따라 네 계층으로 나뉩니다. 아래로 갈수록 느리고 준비할 것이 많으므로, 새 테스트는 **가능한 한 위쪽 계층에** 작성합니다.

| 계층                         | 필요한 것                       | CI 실행 위치                                                  | 예                                                |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| 1. 순수 검사                 | Node 22                         | 모든 PR — `Backend CI Check / 순수 검사`, `Frontend CI Check` | 요금 계산, 약관 버전, 링크, 마이그레이션 위험 DDL |
| 2. DB 통합 (`test:db`)       | Node 22 + Docker + Supabase CLI | 모든 PR — `Backend CI Check / 마이그레이션 · RLS · 권한 경계` | RLS·RPC 권한, 보유기간 파기, 결제 원장            |
| 3. 외부 연동                 | 실제 샌드박스 키                | **CI 제외**, 담당자 수동 실행                                 | NICEPAY 샌드박스 승인·취소                        |
| 4. 브라우저 E2E (`test:e2e`) | 2번 + Playwright                | 릴리즈 PR(→ `main`) — `E2E Check`                             | 예약 → 파트너 수락 → 모의 결제 → 관리자 확인      |

외부 실서비스(PG·메일)는 CI에서 호출하지 않습니다. 외부 장애가 CI 실패로 둔갑하면 아무도 CI 결과를 믿지 않게 되기 때문입니다. 결제는 모의 응답으로 검증합니다.

## 1. 순수 검사 (DB 불필요)

```bash
npm run lint && npm run typecheck
npm run test:unit             # Vitest 단위 테스트 (아래 참고)
npm run test:pricing          # 요금 계산 경계값 회귀 (기본요금·연장·할증·최소청구)
npm run test:legal            # 약관·방침 본문 해시와 버전 무결성
npm run check:links           # 알림·리다이렉트 경로가 실제 라우트인지
npm run test:migration-lint   # 위험 DDL 검사기 자체 테스트
npm run check:migrations      # 신규 마이그레이션의 위험 DDL 경고 (NOT NULL 추가 등)
npm run test:reservation-age  # 예약 가능 나이 정책
npm run test:partner-profile  # 파트너 프로필 입력 검증
npm run test:social-auth      # 네이버 응답 변환·OAuth 오류 처리
npm run test:pwa              # PWA 설치 유도 재노출·플랫폼 판정
npm run test:nicepay-live-check  # 운영키 조회 스크립트 (모의 응답만)
```

`package.json`에 스크립트가 없는 순수 검사는 `node --experimental-strip-types --no-warnings [--import ./scripts/_ts-alias.mjs] scripts/<파일>.mjs`로 실행합니다. 전체 목록은 [`.github/workflows/be-check.yml`](../.github/workflows/be-check.yml)의 `fast` job에 있습니다.

### 단위 테스트 (Vitest)

**새 순수 로직 테스트는 Vitest로 작성합니다.** 기존 `scripts/test-*.mjs`는 그대로 유지하며 필요할 때 점진적으로 옮깁니다.

```bash
npm run test:unit             # vitest run — 한 번 실행
npx vitest                    # 감시 모드
```

- 파일은 대상 모듈 옆 `__tests__/<모듈>.test.ts`에 둡니다. 예: [`lib/__tests__/pricing.test.ts`](../lib/__tests__/pricing.test.ts)
- `@/` 경로 별칭을 그대로 쓸 수 있습니다.
- [`vitest.config.ts`](../vitest.config.ts)가 `TZ=UTC`로 고정합니다. 운영 서버(Vercel)와 같은 조건이라, 개발 PC(KST)에서만 통과하는 시간대 버그가 드러납니다.

```ts
import { describe, expect, it } from "vitest";

import { calcPrepayment } from "@/lib/pricing";

describe("선결제 (약관 제21조 ①)", () => {
    it("예상 이용시간이 2시간 미만이어도 2시간분을 받는다", () => {
        expect(calcPrepayment("basic", 60, false).amount).toBe(40_000);
    });
});
```

테스트 이름에는 근거가 되는 약관 조항이나 이슈 번호를 적어, 실패했을 때 무엇이 깨졌는지 바로 알 수 있게 합니다.

## 2. DB 통합 (로컬 Supabase)

로컬 Supabase 스택 위에서 **"무엇이 안 되는가"**(다른 사람의 데이터를 읽을 수 없다, 권한 없이 실행할 수 없다)를 검증합니다.

```bash
npx supabase start            # Docker 필요. 마이그레이션을 0부터 적용
npx supabase status -o env    # API_URL·ANON_KEY·SERVICE_ROLE_KEY 확인 → .env.local
npm run seed:dev              # 테스트 계정 (사용자·파트너)

npm run test:db               # 전체 DB 통합 테스트 (CI와 같은 목록·순서)
npm run test:db -- --list     # 묶음 목록
npm run test:db -- --only evidence   # 이름·파일에 evidence가 들어간 묶음만
```

- 목록과 순서는 [`scripts/run-db-tests.mjs`](../scripts/run-db-tests.mjs)의 `SUITES` 한 곳에 있습니다. CI도 같은 진입점을 씁니다. **새 DB 테스트는 여기에 추가합니다.**
- 로컬 스택(`127.0.0.1`/`localhost`)이 아니면 실행을 거부합니다. `psql`이 없으면 로컬 DB 컨테이너 안의 `psql`을 씁니다.
- 실패해도 나머지 묶음을 계속 실행하고, 끝에 실패한 묶음을 모아 보여줍니다.
- 시드·테스트 스크립트는 대상 프로젝트를 검사합니다. 로컬은 통과하고, 원격은 `SEED_TARGET_REF`에 대상 ref를 직접 입력해야 열리며, **운영 ref는 입력해도 차단됩니다.**
- CI는 이에 앞서 기준 브랜치 스키마에 시드 데이터를 넣은 뒤 PR의 신규 마이그레이션만 적용해, 기존 행이 줄거나 제약이 깨지지 않는지 확인합니다.

### 픽스처 규칙

- **SQL 테스트**는 `begin;`으로 시작해 `rollback;`으로 끝납니다. 픽스처는 테스트 안에서 고정 UUID로 만들고, 롤백으로 함께 사라집니다.
- **Node 테스트**(`test:partner` 등)는 실제 행을 만들므로 `seed:dev` 계정을 쓰거나, 자신이 만든 행을 끝에서 지웁니다. 다른 묶음의 결과에 기대지 않습니다.

## 3. 외부 연동 (수동)

```bash
npm run test:nicepay          # NICEPAY 샌드박스 실호출
npm run test:payapi           # 결제 API 왕복
npm run check:nicepay-live    # 운영키 조회 (실호출, 담당자만)
```

샌드박스 키를 `.env.local`에 넣은 담당자만 실행합니다. 키와 실행 결과의 거래 식별자는 이슈·PR에 남기지 않습니다.

## 4. 브라우저 E2E (Playwright)

핵심 사용자 흐름 하나를 실제 화면으로 끝까지 검증합니다 — [`e2e/reservation-flow.spec.ts`](../e2e/reservation-flow.spec.ts)

1. 이용자 로그인 → 예약 4단계 입력 → 매칭 신청
2. 파트너 로그인 → 요청 수락
3. 이용자: 파트너 선택 → 선결제(모의 PG) → **예약 확정**
4. 관리자 로그인(2단계 인증 등록) → 예약 조회 접속기록 확인

```bash
npx supabase start && npm run seed:dev && npm run seed:admin   # 선행 조건
npx playwright install chromium   # 최초 1회
npm run test:e2e                  # 로컬: next dev, CI: next build → start
npx playwright test --ui          # 단계별로 보며 디버깅
```

- **결제는 모의 PG로만 처리합니다.** 결제창 SDK는 Playwright가 모의 스크립트로 바꾸고([`nicepay-sdk.ts`](../e2e/support/nicepay-sdk.ts)), 서버의 승인·조회·취소 호출은 `NICEPAY_API_BASE_URL`로 로컬 모의 서버([`mock-nicepay.mjs`](../e2e/support/mock-nicepay.mjs))에 보냅니다. 이 재지정은 **샌드박스 키 + 루프백 주소일 때만** 적용되어 운영에서는 무시됩니다. 서명·금액 검증과 결제 확정 RPC는 실제 코드 그대로 실행됩니다.
- 관리자 로그인은 매번 기존 인증기를 지우고, 화면에 표시된 키로 TOTP를 계산해 등록합니다([`totp.ts`](../e2e/support/totp.ts)).
- 테스트 예약(병원명 `E2E병원*`)에는 이용자 생년월일·연락처·진료 목적이 들어가므로, **실행이 끝나면(global teardown) 예약과 결제·서비스·지원 기록·예약 알림을 삭제**합니다. 중단된 실행이 남긴 예약도 시작할 때(global setup) 지웁니다. 남아 있으면 같은 파트너의 일정이 겹쳐 선택이 거절되기도 합니다.
- 로컬 Supabase(`127.0.0.1`/`localhost`)가 아니면 실행을 거부합니다.
- CI에서 실패하면 Actions의 `playwright-report` 아티팩트에서 스크린샷과 트레이스를 확인합니다(`npx playwright show-trace`).
- 시간이 오래 걸리고 외부 상태에 민감하므로, E2E는 **핵심 흐름에만** 추가합니다. 화면 하나의 세부 동작은 단위·DB 테스트로 검증합니다.

## 새 테스트 작성 원칙

- **계층**: DB 없이 검증할 수 있는 로직은 함수로 분리해 순수 검사로 작성합니다. RLS·RPC 권한처럼 DB가 판단하는 것만 DB 통합으로 작성합니다.
- **실패 시나리오 우선**: 정상 동작보다 "권한 없는 호출이 거부되는가", "경계 시각 1초 전/후"처럼 깨지면 사고가 나는 조건을 먼저 씁니다.
- **데이터**: 실제 운영 데이터·비밀키를 쓰지 않습니다. 픽스처·로그·스크린샷에 개인정보나 토큰을 남기지 않습니다.
- **시간**: KST 기준 로직은 시각을 고정해 검증합니다. 로컬 시간대 `Date` 접근자는 ESLint로 금지돼 있습니다.
- **CI 등록**: 새 테스트는 해당 계층의 CI job에 단계로 추가합니다. 추가하지 않으면 아무도 돌리지 않습니다.
