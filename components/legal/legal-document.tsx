import { Section } from "@/app/(user)/_components/home/section";
import type { LegalArticle, LegalDocument } from "@/lib/legal/types";

/**
 * 약관·방침 공용 렌더러.
 *
 *  두 문서가 같은 서식을 갖도록 렌더링을 한 곳에 둔다. 조문이 개정되면
 *  `lib/legal/*.ts` 의 데이터만 바뀌고 이 파일은 그대로다.
 *
 *  조문은 31개까지 가므로 상단에 조 목차를 둔다. 목차 없이는
 *  "제19조 취소수수료" 같은 특정 조문을 찾아 읽기가 어렵다.
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
                        <p
                            key={i}
                            className="text-muted-foreground leading-relaxed"
                        >
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
                            className="text-muted-foreground list-decimal space-y-2 pl-5 leading-relaxed"
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
                                                className="text-muted-foreground px-3 py-2 align-top leading-relaxed"
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

            <nav
                aria-label={`${doc.title} 조항 목차`}
                className="border-border bg-muted/40 mt-8 rounded-xl border p-4"
            >
                <p className="text-foreground text-sm font-semibold">목차</p>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
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
            </nav>

            <div className="mt-10 space-y-10">
                {doc.articles.map((article, i) => (
                    <article
                        key={article.no}
                        id={anchorId(i)}
                        className="scroll-mt-24"
                    >
                        <h2 className="text-foreground text-lg font-bold">
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
