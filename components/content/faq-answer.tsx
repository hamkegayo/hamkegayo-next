import type { FaqItem } from "@/lib/content/faq";

/** 두 페이지가 동일한 문단·취소수수료 표를 렌더링한다. */
export function FaqAnswer({ item }: { item: FaqItem }) {
    return (
        <div className="text-description-foreground space-y-3 text-sm leading-relaxed">
            {item.a.split("\n\n").map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
            ))}
            {item.table && (
                <div className="overflow-x-auto">
                    <table className="border-border w-full border-collapse text-left text-xs">
                        <caption className="sr-only">
                            예약 취소 시점별 수수료
                        </caption>
                        <thead>
                            <tr>
                                <th
                                    scope="col"
                                    className="border-border border p-2"
                                >
                                    취소 시점
                                </th>
                                <th
                                    scope="col"
                                    className="border-border border p-2"
                                >
                                    취소수수료
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {item.table.map(([time, fee]) => (
                                <tr key={time}>
                                    <th
                                        scope="row"
                                        className="border-border border p-2 font-normal"
                                    >
                                        {time}
                                    </th>
                                    <td className="border-border border p-2">
                                        {fee}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
