import { Section } from "@/app/(user)/_components/home/section";
import type { LegalArticle, LegalDocument } from "@/lib/legal/types";

/**
 * 약관·방침 공용 렌더러.
 *
 *  두 문서가 같은 서식을 갖도록 렌더링을 한 곳에 둔다. 조문이 개정되면
 *  `lib/legal/*.ts` 의 데이터만 바뀌고 이 파일은 그대로다.
 *
 *  목차는 **접어 둔다.** 약관은 조가 32개라 펼쳐 두면 첫 화면이 목차로
 *  가득 차 본문이 접히는 선 아래로 밀린다. 특정 조를 찾아 읽으려는
 *  사람만 펼치면 된다. `<details>` 라 자바스크립트 없이 동작한다.
 */

/** 조 앵커 id. 조 번호에 한글이 섞여 URL 로 쓰기 나쁘므로 순번을 쓴다. */
function anchorId(index: number): string {
    return `article-${index + 1}`;
}

function ArticleBody({ article }: { article: LegalArticle }) {
    return (
        <div className="mt-3 space-y-3">
            {article.blocks.map((block, i) => {
                if (block.type === "p") {
                    return (
                        <p key={i} className="text-muted-foreground leading-7">
                            {block.text}
                        </p>
                    );
                }

                if (block.type === "subhead") {
                    return (
                        <p
                            key={i}
                            className="text-foreground pt-2 font-semibold"
                        >
                            {block.text}
                        </p>
                    );
                }

                if (block.type === "list") {
                    return (
                        <ol
                            key={i}
                            className="text-muted-foreground list-decimal space-y-2 pl-5 leading-7"
                        >
                            {block.items.map((item, j) => (
                                <li key={j}>{item}</li>
                            ))}
                        </ol>
                    );
                }

                // 표는 좁은 화면에서 페이지 전체를 밀지 않도록 자기 안에서 스크롤한다.
                return (
                    <div
                        key={i}
                        className="border-border overflow-x-auto rounded-lg border"
                    >
                        <table className="w-full min-w-md border-collapse text-sm">
                            <thead>
                                <tr className="bg-muted">
                                    {block.head.map((cell, j) => (
                                        <th
                                            key={j}
                                            scope="col"
                                            className="text-foreground border-border border-b px-3 py-2 text-left font-semibold"
                                        >
                                            {cell}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {block.rows.map((row, j) => (
                                    <tr
                                        key={j}
                                        className="border-border border-b last:border-b-0"
                                    >
                                        {row.map((cell, k) => (
                                            <td
                                                key={k}
                                                className="text-muted-foreground px-3 py-2 align-top leading-6"
                                            >
                                                {cell}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            })}
        </div>
    );
}

export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
    return (
        <Section className="max-w-3xl">
            <h1 className="text-foreground text-3xl font-extrabold md:text-4xl">
                {doc.title}
            </h1>
            <p className="text-muted-foreground mt-3 text-sm">
                시행일 {doc.effectiveDate}
            </p>

            <details className="border-border bg-muted/30 group mt-8 rounded-xl border">
                <summary className="text-foreground hover:bg-muted/50 cursor-pointer list-none rounded-xl px-4 py-3 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center justify-between gap-2">
                        <span>목차 · {doc.articles.length}개 항목</span>
                        {/* 접힘/펼침 표시. 기본 삼각형은 list-none 과 webkit 마커로 숨겼다. */}
                        <span
                            aria-hidden
                            className="text-muted-foreground text-xs transition-transform group-open:rotate-180"
                        >
                            ▼
                        </span>
                    </span>
                </summary>
                <ul className="border-border flex flex-wrap gap-x-4 gap-y-2 border-t px-4 py-3 text-sm">
                    {doc.articles.map((article, i) => (
                        <li key={article.no}>
                            <a
                                href={`#${anchorId(i)}`}
                                className="text-muted-foreground hover:text-brand underline-offset-4 hover:underline"
                            >
                                {article.no}
                                {article.title ? ` ${article.title}` : ""}
                            </a>
                        </li>
                    ))}
                </ul>
            </details>

            {/*
              조 사이를 구분선으로 나눈다. 여백만으로 띄우면 조가 어디서
              끝나고 시작하는지 눈으로 잡히지 않아 긴 문서에서 위치를 잃는다.
            */}
            <div className="divide-border mt-8 divide-y">
                {doc.articles.map((article, i) => (
                    <article
                        key={article.no}
                        id={anchorId(i)}
                        className="scroll-mt-24 py-7 first:pt-0"
                    >
                        <h2 className="text-foreground font-bold">
                            {article.no}
                            {article.title ? ` (${article.title})` : ""}
                        </h2>
                        <ArticleBody article={article} />
                    </article>
                ))}
            </div>
        </Section>
    );
}
