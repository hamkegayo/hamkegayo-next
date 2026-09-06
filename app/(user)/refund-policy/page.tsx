import type { Metadata } from "next";
import Link from "next/link";

import { Section } from "@/app/(user)/_components/home/section";
import { ArticleBody } from "@/components/legal/legal-document";
import { COMPANY } from "@/lib/legal/company";
import { TERMS, termsArticle } from "@/lib/legal/terms";
import { POINT_RESTORE_NOTE, REFUND_METHOD_NOTE } from "@/lib/legal/refund";

export const metadata: Metadata = {
    title: "취소·환불 정책 | 함께가요",
    description:
        "함께가요 병원동행 서비스의 예약 취소 시점별 취소수수료, 환불 방법과 소요기간, 청약철회 및 최종정산 기준을 안내합니다.",
};

/**
 * 취소·환불 정책 (#52) — 전자상거래법이 요구하는 별도 표시.
 *
 *  ⚠️ **여기에 정책을 새로 적지 않는다.** 조문은 이용약관이 정본이고,
 *     이 페이지는 취소·환불에 걸리는 조(제19~22조)를 같은 데이터에서
 *     읽어 모아 보여줄 뿐이다. 다시 적으면 약관 개정 때 한쪽만 바뀐다.
 *
 *  약관 전문(/terms)이 있는데 이 페이지를 따로 두는 이유는, 약관이 32개
 *  조라 취소·환불만 확인하려는 사람이 찾아 읽기 어렵기 때문이다. PG 심사도
 *  취소·환불 기준을 별도 화면으로 확인할 수 있는지를 본다.
 */

const ARTICLE_NOS = ["제19조", "제20조", "제21조", "제22조"] as const;

function Card({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="border-border bg-background mt-6 rounded-2xl border p-6 md:p-7">
            <h2 className="text-foreground text-lg font-bold">{title}</h2>
            <div className="mt-3">{children}</div>
        </section>
    );
}

export default function RefundPolicyPage() {
    const fees = termsArticle("제19조");

    return (
        <Section className="max-w-3xl">
            <h1 className="text-foreground text-3xl font-extrabold md:text-4xl">
                취소·환불 정책
            </h1>
            <p className="text-muted-foreground mt-3 text-sm">
                시행일 {TERMS.effectiveDate}
            </p>

            <p className="text-muted-foreground mt-6 leading-7">
                예약 취소 시점에 따라 취소수수료가 달라집니다. 아래 내용은{" "}
                <Link
                    href="/terms"
                    className="text-brand underline underline-offset-4"
                >
                    이용약관
                </Link>{" "}
                제19조부터 제22조까지를 취소·환불 기준으로 모은 것이며, 해석에
                다툼이 있으면 약관 조문이 기준입니다.
            </p>

            {/*
              표는 제19조에서 그대로 가져온다. 여기서 따로 적으면 약관이
              개정될 때 이 화면만 옛 금액을 보여주게 된다.
            */}
            <Card title="1. 취소 시점별 청구 기준">
                <ArticleBody article={fees} />
            </Card>

            <Card title="2. 환불 방법과 소요기간">
                <ul className="text-muted-foreground list-disc space-y-2 pl-5 leading-7">
                    <li>
                        선결제하신 금액에서 취소수수료를 뺀 나머지를 환불해
                        드립니다.
                    </li>
                    <li>{POINT_RESTORE_NOTE}</li>
                    <li>{REFUND_METHOD_NOTE}</li>
                    <li>
                        취소수수료가 실제 결제하신 현금보다 큰 경우에도 추가로
                        청구하지 않습니다.
                    </li>
                    <li>
                        서비스 종료 후 실제 이용시간이 예약금액보다 적으면
                        차액을 환불합니다(제21조 ⑤). 반대로 많으면 차액을
                        추가결제하셔야 합니다(제21조 ④).
                    </li>
                </ul>
            </Card>

            <Card title="3. 취소 방법">
                <p className="text-muted-foreground leading-7">
                    마이페이지의 예약 상세에서 직접 취소하실 수 있습니다. 취소
                    전에 예상 환불 금액과 취소수수료가 화면에 표시됩니다.
                    서비스가 이미 시작된 뒤에는 고객센터로 연락해 주세요.
                </p>
            </Card>

            {/* 조문 발췌 — 정본은 약관이다 */}
            <Card title="4. 관련 약관 조항">
                <div className="divide-border divide-y">
                    {ARTICLE_NOS.map((no) => {
                        const article = termsArticle(no);
                        return (
                            <div key={no} className="py-5 first:pt-0 last:pb-0">
                                <h3 className="text-foreground font-bold">
                                    {article.no}
                                    {article.title ? ` (${article.title})` : ""}
                                </h3>
                                <ArticleBody article={article} />
                            </div>
                        );
                    })}
                </div>
            </Card>

            <Card title="5. 문의">
                <dl className="text-muted-foreground space-y-2 leading-7">
                    <div className="flex gap-3">
                        <dt className="text-foreground w-20 shrink-0 font-semibold">
                            고객센터
                        </dt>
                        <dd>
                            <a
                                href={`tel:${COMPANY.tel}`}
                                className="hover:text-brand underline-offset-4 hover:underline"
                            >
                                {COMPANY.tel}
                            </a>
                            <span className="ml-2">({COMPANY.hours})</span>
                        </dd>
                    </div>
                    <div className="flex gap-3">
                        <dt className="text-foreground w-20 shrink-0 font-semibold">
                            이메일
                        </dt>
                        <dd>
                            <a
                                href={`mailto:${COMPANY.email}`}
                                className="hover:text-brand underline-offset-4 hover:underline"
                            >
                                {COMPANY.email}
                            </a>
                        </dd>
                    </div>
                    <div className="flex gap-3">
                        <dt className="text-foreground w-20 shrink-0 font-semibold">
                            카카오톡
                        </dt>
                        <dd>{COMPANY.kakao}</dd>
                    </div>
                </dl>
            </Card>
        </Section>
    );
}
