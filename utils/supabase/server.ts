import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 서버 전용 Supabase 클라이언트를 생성.
 * @returns Promise 객체 반환 - 브라우저 환경에서 Supabase 클라이언트 환경변수를 넘김
 */
export async function createClient() {
  const cookieStore = await cookies(); // next/headers 모듈의 cookies() 함수를 사용하여 쿠키를 가져옴

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // (!는 타입스크립트에게 이 값이 null이나 undefined가 아님을 알려주는 연산자)
    {
      cookies: {
        getAll() {
          return cookieStore.getAll(); // 현재 요청에 들어있는 모든 쿠키를 읽어야할 때 호출
        },
        // 로그인, 로그아웃, 세션 갱신 등 쿠키를 새로 설정해야할 때 호출
        setAll(cookiesToSet) {
          // 쿠키를 새로 설정할 때, Next.js 서버 컴포넌트 내부에서 쿠키 갱신 시 발생하는 에러를 우회하기 위해 try-catch 블록을 사용
          try {
            // 각 쿠키 객체에서 구조 분해 할당으로 값을 꺼낸다.
            cookiesToSet.forEach(
              ({ name, value, options }) =>
                // 쿠키 저장소에 설정
                cookieStore.set(name, value, options), // 쿠키 이름, 쿠키 값, 만료시간, path, secure, httpOnly 등
            );
          } catch {
            // Next.js 서버 컴포넌트 내부에서 쿠키 갱신 시 발생하는 에러 우회용
          }
        },
      },
    },
  );
}
