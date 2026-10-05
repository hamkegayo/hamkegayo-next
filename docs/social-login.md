# 소셜 로그인 설정

카카오·네이버 로그인을 Supabase Auth로 연결할 때의 제공자 설정과 오류 확인 방법입니다. 키·시크릿은 이 문서나 이슈에 적지 않고 각 환경의 Supabase Dashboard와 환경 변수로만 관리합니다.

## 제공자 공통

- 카카오는 Supabase Dashboard의 기본 `Kakao` provider를 사용합니다.
- 네이버는 Supabase Dashboard에 OAuth2 custom provider `custom:naver`를 생성합니다.
- 두 제공자의 외부 콜백은 Supabase가 표시하는 `https://<project-ref>.supabase.co/auth/v1/callback`이며, Supabase Redirect URL에는 스테이징·운영의 `/auth/callback`을 각각 등록합니다.
- 이메일 제공을 필수로 설정하고 최소 scope만 요청합니다. 제공자 동의와 함께가요 약관 동의는 별개이며, 최초 로그인 뒤 `/signup/social`에서 서비스 동의를 받습니다.

## 네이버 UserInfo 응답 변환

네이버 `/v1/nid/me`는 `response.id`, `response.email`을 반환하지만 Supabase custom OAuth2는 최상위 `sub`, `email`을 읽습니다. 네이버 제공자의 **Userinfo URL**을 아래처럼 이 사이트의 응답 변환 엔드포인트로 설정합니다. 이 코드가 배포된 뒤 URL을 변경해야 합니다.

| 환경     | Userinfo URL                                                   |
| -------- | -------------------------------------------------------------- |
| 스테이징 | `https://hamkegayo-staging.vercel.app/api/auth/naver/userinfo` |
| 운영     | `https://www.hamkegayo.kr/api/auth/naver/userinfo`             |

Authorization URL은 `https://nid.naver.com/oauth2.0/authorize`, Token URL은 `https://nid.naver.com/oauth2.0/token`을 사용합니다. **네이버 앱에 등록하는 Callback URL은 Supabase `/auth/v1/callback`을 유지**합니다. Userinfo URL과 Callback URL은 서로 다른 용도입니다.

변환 엔드포인트는 Supabase가 보낸 네이버 Bearer 토큰으로 고정된 네이버 API만 조회합니다. ID·이메일·이름만 반환하며, 토큰과 프로필을 저장·로그 출력하지 않고 응답도 캐시하지 않습니다. 이메일을 받지 못하면 임의로 채우거나 인증됐다고 표시하지 않습니다. `Allow users without email`은 끄고, 네이버 개발자센터의 **스테이징 앱**에서 연락처 이메일 제공을 설정하세요. 기존 사용자가 이메일을 거부했다면 네이버의 재동의 절차가 필요합니다.

네이버 프로필 API는 이메일의 인증 여부를 반환하지 않습니다. Supabase의 이메일 확인 정책에 따라 최초 로그인에서 인증 메일 확인이 필요할 수 있으며, `provider_email_needs_verification`은 받은 편지함 확인 후 재로그인 안내로 표시합니다. 동작을 우회하려고 `email_verified: true`를 임의로 추가하거나 `Confirm email`을 해제하지 않습니다. SMTP·메일 템플릿·인증 메일의 복귀 주소도 배포 후 확인하세요.

## 카카오 KOE205 및 로그인 오류 확인

Supabase Kakao 기본 제공자는 `account_email`, `profile_image`, `profile_nickname`을 요청합니다. 현재 REST API 키에 해당하는 카카오 앱의 **카카오 로그인 → 동의항목**에서 요청 항목을 설정해야 합니다. `KOE205` 오류 페이지를 펼치면 빠진 항목을 확인할 수 있습니다. `KOE101`은 REST API Key 칸에 실제 키가 들어 있는지 먼저 확인합니다.

Supabase의 Site URL은 각 환경의 사이트 주소로, Redirect URLs는 각 환경의 `/auth/callback`을 등록합니다. 테스트 시 네이버 이메일 미제공은 로그인 화면의 지속 안내로 표시되며, Supabase가 fragment(`#error=...`)로 반환한 오류도 처리합니다. 원본 오류는 URL에서 제거하고 정해진 `oauth_error` 코드만 남깁니다.

참고: [네이버 로그인 응답 명세](https://developers.naver.com/docs/login/devguide/devguide.md), [Supabase custom OAuth 처리](https://github.com/supabase/auth/blob/master/internal/api/provider/custom_oauth.go), [카카오 오류 코드](https://developers.kakao.com/docs/ko/kakaologin/trouble-shooting).
