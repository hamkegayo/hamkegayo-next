import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // 로컬 시간대에 의존하는 Date 접근자 금지.
  //
  //  이 값들은 실행 환경의 시간대를 따른다. Vercel 은 UTC 로 돌고 개발
  //  기계는 KST 라, 로컬에서는 맞아 보이고 프로덕션에서만 9시간 어긋난다.
  //  **테스트로도 잡히지 않는다** — 테스트도 KST 기계에서 돌기 때문이다.
  //
  //  실제로 냈던 사고: 예약 상세의 "파트너 확정" 이 20:55 대신 11:55 로
  //  표시됐고, 파트너 홈의 "오늘 일정" 은 KST 09시 이전에 하루가 밀렸다.
  //
  //  lib/format.ts 의 kst* 함수를 쓴다. 시간대를 명시하므로 어디서 돌든
  //  같은 값이 나온다. getTime()·getUTC*() 는 시간대와 무관하므로 허용한다.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["lib/format.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^get(FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds)$/]",
          message:
            "로컬 시간대에 의존한다. 서버(Vercel)는 UTC 로 돌아 프로덕션에서만 어긋난다. @/lib/format 의 kstTime·kstDate·kstStamp·kstDateTime·kstToday·weekdayOf·formatUseDate·koreanAgeLabel 을 쓸 것.",
        },
      ],
    },
  },
  // 관리자 영역에서 service_role 키 사용 금지 (#50).
  // service_role 은 RLS 를 통째로 우회하므로, 한 번만 쓰여도
  // 관리자에게 막아둔 이용자 개인정보(care_recipients·reports·reservations)가
  // 그대로 열리고 접속기록도 남지 않는다. 관리자 권한은 ADMIN role 로만 판정한다.
  {
    files: ["app/(admin)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/utils/supabase/admin",
              message:
                "관리자 화면은 service_role 을 쓰지 않는다. createClient(@/utils/supabase/server) 로 관리자 세션을 쓰고, 쓰기는 admin_* RPC 를 호출할 것. (#50)",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
