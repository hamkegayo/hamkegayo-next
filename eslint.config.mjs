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
