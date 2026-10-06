import { describe, expect, it } from "vitest";

import { parseArgs, SUITES } from "../run-db-tests.mjs";

// 옵션 실수가 조용히 전체 DB 테스트 실행으로 이어지지 않는지 확인한다 (#219 리뷰).
describe("test:db 인자 해석", () => {
    it("인자가 없으면 전체 실행", () => {
        expect(parseArgs([])).toEqual({ only: null, list: false });
    });

    it("--only 키워드와 --list 를 받는다", () => {
        expect(parseArgs(["--only", "evidence"])).toEqual({
            only: "evidence",
            list: false,
        });
        expect(parseArgs(["--list", "--only", "#199"])).toEqual({
            only: "#199",
            list: true,
        });
    });

    it.each([
        [["--only"], "--only 뒤에 키워드를 입력하세요."],
        [["--only", "--list"], "--only 뒤에 키워드를 입력하세요."],
        [["--only", "  "], "--only 뒤에 키워드를 입력하세요."],
        [["--onyl", "evidence"], "알 수 없는 인자: --onyl"],
        [["evidence"], "알 수 없는 인자: evidence"],
    ])("%j 는 실행하지 않고 오류", (argv, error) => {
        expect(parseArgs(argv)).toEqual({ error });
    });

    it("CI 목록 23개 묶음을 유지한다 (#226 활동 정보·예약 주소 코드 추가)", () => {
        expect(SUITES).toHaveLength(23);
    });
});
