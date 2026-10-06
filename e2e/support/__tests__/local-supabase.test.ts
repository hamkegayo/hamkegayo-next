import { describe, expect, it } from "vitest";

import { isLocalSupabaseUrl } from "../local-supabase";

// service_role 키를 쓰는 E2E 준비·정리가 로컬 스택에만 붙는지 확인한다 (#221 리뷰).
describe("E2E 로컬 Supabase 판정", () => {
    it("127.0.0.1 과 localhost 는 허용한다", () => {
        expect(isLocalSupabaseUrl("http://127.0.0.1:54321")).toBe(true);
        expect(isLocalSupabaseUrl("http://localhost:54321")).toBe(true);
        expect(isLocalSupabaseUrl("https://localhost")).toBe(true);
    });

    it("접두사만 같은 외부 호스트는 거부한다", () => {
        expect(isLocalSupabaseUrl("http://localhost.attacker.example")).toBe(
            false,
        );
        expect(isLocalSupabaseUrl("http://127.0.0.1.attacker.example")).toBe(
            false,
        );
        expect(isLocalSupabaseUrl("http://localhost@attacker.example")).toBe(
            false,
        );
    });

    it("원격 프로젝트·잘못된 값은 거부한다", () => {
        expect(isLocalSupabaseUrl("https://abc.supabase.co")).toBe(false);
        expect(isLocalSupabaseUrl("ftp://localhost")).toBe(false);
        expect(isLocalSupabaseUrl("localhost:54321")).toBe(false);
        expect(isLocalSupabaseUrl("")).toBe(false);
        expect(isLocalSupabaseUrl(undefined)).toBe(false);
    });
});
