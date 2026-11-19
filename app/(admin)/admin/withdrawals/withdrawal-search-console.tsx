"use client";

import { useState, useTransition } from "react";

import {
    classifyMemberLookupQuery,
    WITHDRAW_BLOCKER_LABEL,
} from "@/lib/auth/admin-withdrawal";
import { kstDateTime } from "@/lib/format";

import { AdminWithdrawForm } from "./admin-withdraw-form";
import { findMemberForWithdrawal, type MemberForWithdrawal } from "./actions";

const ROLE_LABEL: Record<string, string> = {
    USER: "회원(USER)",
    PARTNER: "파트너(PARTNER)",
};

const STATUS_LABEL: Record<string, string> = {
    PENDING: "가입 대기",
    ACTIVE: "이용 중",
    SUSPENDED: "정지",
    WITHDRAWN: "탈퇴",
};

/** 정확 일치 검색 + 결과 카드 + 운영자 탈퇴 폼 (#293) */
export function WithdrawalSearchConsole() {
    const [query, setQuery] = useState("");
    const [members, setMembers] = useState<MemberForWithdrawal[] | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const search = (q: string) =>
        startTransition(async () => {
            const result = await findMemberForWithdrawal(q);
            if (!result.ok) {
                setMembers(null);
                setMessage(result.message);
                return;
            }
            setMessage(null);
            setMembers(result.members);
        });

    const valid = classifyMemberLookupQuery(query).kind !== "invalid";

    return (
        <section className="mt-8">
            <h2 className="text-lg font-bold">대상 회원 찾기</h2>
            <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (valid && !pending) search(query.trim());
                }}
            >
                <label htmlFor="withdrawal-query" className="sr-only">
                    이메일 · 휴대전화번호 · 회원 UUID
                </label>
                <input
                    id="withdrawal-query"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    maxLength={200}
                    autoComplete="off"
                    placeholder="이메일 · 휴대전화번호 · 회원 UUID (정확히 입력)"
                    className="bg-background flex-1 rounded-lg border p-3 text-sm"
                />
                <button
                    type="submit"
                    disabled={!valid || pending}
                    className="bg-brand text-brand-foreground rounded-lg px-4 py-2 font-bold disabled:opacity-50"
                >
                    {pending ? "검색 중…" : "검색"}
                </button>
            </form>
            {query.trim() && !valid && (
                <p className="text-description-foreground mt-2 text-xs">
                    이메일·휴대전화번호(9-11자리)·회원 UUID 중 하나를 정확히
                    입력해 주세요. 이름·일부 검색은 지원하지 않습니다.
                </p>
            )}

            {message && (
                <p role="alert" className="mt-4 text-sm text-red-600">
                    {message}
                </p>
            )}

            {members && members.length === 0 && (
                <p className="mt-4 leading-relaxed">
                    일치하는 회원이 없습니다. 관리자 계정은 검색되지 않습니다.
                </p>
            )}

            {members && members.length > 0 && (
                <ul className="mt-4 space-y-4">
                    {members.map((m) => {
                        const withdrawn = m.status === "WITHDRAWN";
                        const blocker = m.blocker_code
                            ? (WITHDRAW_BLOCKER_LABEL[m.blocker_code] ??
                              m.blocker_code)
                            : null;
                        return (
                            <li
                                key={m.id}
                                className="bg-background rounded-xl border p-5"
                                data-testid="withdrawal-member"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-bold">
                                        {m.name ?? "(이름 없음)"}
                                    </h3>
                                    <span className="rounded-full border px-2 py-0.5 text-xs">
                                        {ROLE_LABEL[m.role] ?? m.role}
                                    </span>
                                    <span className="rounded-full border px-2 py-0.5 text-xs">
                                        {STATUS_LABEL[m.status] ?? m.status}
                                    </span>
                                    {blocker && (
                                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                                            처리 불가 · {blocker}
                                        </span>
                                    )}
                                </div>
                                <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[6rem_1fr]">
                                    <dt className="text-description-foreground">
                                        이메일
                                    </dt>
                                    <dd className="break-all">
                                        {m.email ?? "-"}
                                    </dd>
                                    <dt className="text-description-foreground">
                                        연락처
                                    </dt>
                                    <dd>{m.phone ?? "-"}</dd>
                                    <dt className="text-description-foreground">
                                        회원 UUID
                                    </dt>
                                    <dd className="font-mono text-xs break-all">
                                        {m.id}
                                    </dd>
                                    {withdrawn && m.withdrawn_at && (
                                        <>
                                            <dt className="text-description-foreground">
                                                탈퇴 시각
                                            </dt>
                                            <dd>
                                                {kstDateTime(m.withdrawn_at)}
                                            </dd>
                                        </>
                                    )}
                                </dl>
                                {withdrawn ? (
                                    <p className="text-description-foreground mt-3 text-sm">
                                        이미 탈퇴 처리된 회원입니다.
                                    </p>
                                ) : blocker ? (
                                    <p className="mt-3 text-sm leading-relaxed break-keep text-red-700 dark:text-red-300">
                                        {blocker} 때문에 지금은 탈퇴 처리할 수
                                        없습니다. 해소된 뒤 다시 검색해 주세요.
                                    </p>
                                ) : (
                                    <AdminWithdrawForm
                                        userId={m.id}
                                        // 탈퇴하면 이메일·연락처가 지워지므로 UUID 로 다시 찾아 결과를 보여 준다.
                                        onDone={() => search(m.id)}
                                    />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
