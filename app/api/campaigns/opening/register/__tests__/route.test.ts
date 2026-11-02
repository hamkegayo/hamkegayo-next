import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ ensure: vi.fn(), rpc: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
    createClient: async () => ({
        auth: {
            getUser: async () => ({ data: { user: { id: "local-user" } } }),
        },
        rpc: mock.rpc,
    }),
}));
vi.mock("@/lib/opening-event-email.server", () => ({
    ensureOpeningEventEmail: mock.ensure,
}));
import { POST } from "../route";

beforeEach(() => vi.resetAllMocks());

// #298 리뷰: 종료 후에는 결제 화면·쿠폰함이 열릴 때마다 등록 RPC 를 부르지 않는다.
it("returns before identity registration once the event has ended", async () => {
    mock.rpc.mockResolvedValue({
        data: [{ enabled: false, remaining: 0, ended: true }],
        error: null,
    });
    expect(await (await POST()).json()).toEqual({ registered: false });
    expect(mock.ensure).not.toHaveBeenCalled();
});
it("registers while the event is running", async () => {
    mock.rpc.mockResolvedValue({
        data: [{ enabled: true, remaining: 3, ended: false }],
        error: null,
    });
    mock.ensure.mockResolvedValue(true);
    expect(await (await POST()).json()).toEqual({ registered: true });
    expect(mock.ensure).toHaveBeenCalledOnce();
});
it("leaves the end check to the registration RPC when status lookup fails", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    mock.ensure.mockResolvedValue(false);
    expect(await (await POST()).json()).toEqual({ registered: false });
    expect(mock.ensure).toHaveBeenCalledOnce();
});
