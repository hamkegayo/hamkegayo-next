"use client";

import { useMemo, useState } from "react";
import {
    ChevronDown,
    ClipboardCheck,
    CreditCard,
    Search,
    ShieldCheck,
    UserRound,
    Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Section } from "@/app/(user)/_components/home/section";

type Item = { q: string; a: string };
type Category = { icon: LucideIcon; name: string; items: Item[] };

const CATEGORIES: Category[] = [
    {
        icon: UserRound,
        name: "서비스 이용",
        items: [
            {
                q: "어떤 분들이 이용하나요?",
                a: "거동이 불편하시거나 혼자 병원 방문이 어려운 어르신, 보호자가 동행하기 어려운 가족을 둔 분들이 주로 이용하십니다. 환자 본인은 물론 자녀분이 보호자로서 대신 예약할 수도 있습니다.",
            },
            {
                q: "보호자가 함께 가지 않아도 되나요?",
                a: "네, 검증된 동행 파트너가 보호자를 대신해 병원 이동부터 접수·진료 동행·귀가까지 도와드립니다. 진행 상황은 주요 단계마다 보호자에게 알림으로 공유됩니다.",
            },
            {
                q: "병원 동행 서비스는 어떤 서비스인가요?",
                a: "출발지에서 병원까지의 이동, 접수·수납, 진료·검사 동행, 약국 동행 등 병원 이용 전 과정을 곁에서 보조하는 비의료 지원 서비스입니다. 진단·치료 등 의료행위는 포함되지 않습니다.",
            },
            {
                q: "이용 가능한 지역은 어디인가요?",
                a: "현재 서울 전 지역과 수도권 일부에서 운영하고 있으며, 파트너 활동 지역에 따라 매칭 가능 범위가 결정됩니다. 예약 시 출발지·병원 주소를 입력하면 가능 여부를 확인해 드립니다.",
            },
            {
                q: "정기적으로 이용할 수 있나요?",
                a: "네, 정기 진료나 반복 검사가 필요한 경우 같은 파트너로 매칭을 요청하실 수 있으며, 자주 이용하실수록 더 익숙하고 매끄러운 동행이 가능합니다.",
            },
            {
                q: "당일 예약도 가능한가요?",
                a: "파트너 일정에 여유가 있으면 당일 예약도 접수됩니다. 다만 원활한 매칭을 위해 가급적 하루 전까지 예약해 주시길 권합니다.",
            },
            {
                q: "예약은 얼마나 미리 해야 하나요?",
                a: "최소 3시간 전 예약을 권장하며, 정기 방문이나 인기 시간대는 2~3일 전 예약 시 원하는 파트너를 배정받을 가능성이 높습니다.",
            },
        ],
    },
    {
        icon: ClipboardCheck,
        name: "서비스 종류",
        items: [
            {
                q: "Basic 서비스는 어떤 경우에 적합한가요?",
                a: "병원에서 파트너를 만나 접수·수납·진료 동행만 필요할 때 적합합니다. 병원까지 이동은 직접 하시고 병원 내 과정에만 도움이 필요한 분께 권장합니다. (1시간당 20,000원)",
            },
            {
                q: "Plus 서비스는 어떤 경우에 적합한가요?",
                a: "자택에서 파트너를 만나 병원 이동·접수·진료·귀가까지 전 과정을 지원받고 싶을 때 적합합니다. 혼자 이동이 어려운 어르신께 권장합니다. (1시간당 25,000원)",
            },
            {
                q: "Basic과 Plus의 차이는 무엇인가요?",
                a: "가장 큰 차이는 이동 동행 여부입니다. Basic은 병원에서 만나는 동행, Plus는 자택 방문 픽업과 귀가 지원이 포함됩니다. 두 상품 모두 접수·수납·진료 동행은 공통으로 제공됩니다.",
            },
            {
                q: "진료실 동행이 가능한가요?",
                a: "네, 원하시면 진료실까지 동행하여 진료 내용을 메모하고 보호자에게 전달해 드립니다. 단, 의료진의 판단이나 상담을 대신하지는 않습니다.",
            },
            {
                q: "검사실 이동도 도와주나요?",
                a: "네, 엑스레이·내시경·채혈 등 검사실 간 이동·접수를 안내하고 함께 이동해 드립니다. 검사 자체는 의료기관에서 진행됩니다.",
            },
            {
                q: "접수·수납도 지원하나요?",
                a: "네, 접수처에서의 절차 안내와 수납을 보조해 드립니다. 진료비 등 실제 비용은 고객님께서 부담하십니다.",
            },
            {
                q: "약 수령도 가능한가요?",
                a: "네, 처방전 수령 후 약국 동행 및 약 수령까지 지원합니다. (선택 항목이며 Basic·Plus 모두 가능합니다.)",
            },
        ],
    },
    {
        icon: Users,
        name: "파트너",
        items: [
            {
                q: "파트너는 어떤 사람들인가요?",
                a: "간호사, 간호조무사, 요양보호사 등 관련 자격과 동행 경험을 갖춘 분들입니다. 신원 확인과 교육을 마친 검증된 파트너만 활동합니다.",
            },
            {
                q: "파트너는 어떻게 선발되나요?",
                a: "자격 확인, 신원 검증, 범죄경력 조회, 서비스 교육을 모두 통과한 분만 선발합니다. 활동 이후에도 이용 후기와 운영 지표를 바탕으로 지속 관리합니다.",
            },
            {
                q: "간호사만 활동할 수 있나요?",
                a: "아닙니다. 간호사 외에도 간호조무사·요양보호사 등 자격을 갖춘 분들이 활동합니다. 예약 시 파트너의 자격과 경력을 직접 확인하고 선택하실 수 있습니다.",
            },
            {
                q: "파트너의 경력을 확인할 수 있나요?",
                a: "네, 파트너 선택 화면에서 자격, 동행 경험 건수, 평점, 검증 배지, 시간 준수율 등 상세 지표를 확인하실 수 있습니다.",
            },
            {
                q: "범죄경력 조회를 진행하나요?",
                a: "네, 모든 파트너는 활동 전 범죄경력 조회를 포함한 신원 검증 절차를 거치며, 통과한 분만 매칭됩니다.",
            },
            {
                q: "파트너 교육은 어떻게 진행되나요?",
                a: "동행 절차, 안전 수칙, 응급상황 시 대응 절차, 개인정보 보호 등에 대한 교육을 이수해야 활동할 수 있습니다.",
            },
        ],
    },
    {
        icon: CreditCard,
        name: "예약 · 결제",
        items: [
            {
                q: "서비스 비용은 얼마인가요?",
                a: "Basic 20,000원, Plus 25,000원이 1시간 기준 이용금액입니다. 기본 시간을 초과하면 30분 단위로 Basic 10,000원, Plus 12,500원이 추가됩니다.",
            },
            {
                q: "추가 비용이 발생할 수 있나요?",
                a: "기본 이용 시간을 초과하면 30분 단위로 요금이 발생하며, 주말·공휴일 30%, 심야(22~07시) 50% 할증이 적용됩니다. 택시비·진료비 등은 별도입니다.",
            },
            {
                q: "교통비는 어떻게 계산되나요?",
                a: "이동에 사용된 교통비(택시·대중교통 등)는 고객님 부담이며 서비스 비용에 포함되지 않습니다. 이용 후 실비로 정산됩니다.",
            },
            {
                q: "결제는 언제 진행되나요?",
                a: "무통장 방식으로 운영되며, 모든 서비스가 종료된 후 최종 금액을 안내해 드리면 결제하시면 됩니다.",
            },
            {
                q: "카드 등록이 필요한 이유는 무엇인가요?",
                a: "후불 결제를 원활하게 진행하기 위해 카드를 미리 등록해 둘 수 있습니다. 등록만으로 즉시 결제되지 않으며, 서비스 종료 후 청구됩니다.",
            },
            {
                q: "예약 변경이 가능한가요?",
                a: "네, 서비스 시작 전이라면 마이페이지 예약 상세에서 일정·파트너 등을 변경 요청하실 수 있습니다. 파트너 일정에 따라 조정될 수 있습니다.",
            },
            {
                q: "예약 취소 수수료는 어떻게 되나요?",
                a: "예약 시간 24시간 전까지는 전액 환불됩니다. 이후 취소 시 규정에 따라 일부 수수료가 발생할 수 있으며, 서비스 시작 후에는 환불이 제한됩니다.",
            },
            {
                q: "영수증 발급이 가능한가요?",
                a: "네, 결제 완료 후 마이페이지에서 이용 내역과 영수증을 확인·발급하실 수 있습니다.",
            },
        ],
    },
    {
        icon: ShieldCheck,
        name: "안전 · 보호자",
        items: [
            {
                q: "보호자는 진행 상황을 확인할 수 있나요?",
                a: "네, 매칭 확정, 파트너 출발, 병원 도착, 서비스 완료 등 주요 단계마다 보호자에게 알림을 보내드립니다.",
            },
            {
                q: "서비스 종료 후 보고서는 어떻게 확인하나요?",
                a: "서비스가 끝나면 병원 도착·접수 시간, 진료·검사·수납 단계 요약, 특이사항 등이 정리된 리포트로 보호자에게 전달해 드립니다.",
            },
            {
                q: "응급상황이 발생하면 어떻게 하나요?",
                a: "응급상황은 119 또는 의료기관 대응이 최우선입니다. 파트너는 즉시 공공 응급체계를 이용하도록 돕고, 동시에 보호자에게 연락드립니다.",
            },
            {
                q: "개인정보는 어떻게 보호되나요?",
                a: "서비스 제공에 필요한 최소한의 정보만 수집하며, 민감정보는 별도 동의 후 암호화하여 관리합니다. 제3자 제공은 원칙적으로 하지 않습니다.",
            },
            {
                q: "의료 상담도 받을 수 있나요?",
                a: "아니요. 함께가요는 비의료 동행 서비스로, 진단·복약지도·의학적 자문은 제공하지 않습니다. 의료 상담은 의료기관에 문의해 주십시오.",
            },
            {
                q: "의료행위도 가능한가요?",
                a: "아니요, 주사·처치·투약 등 일체의 의료행위는 하지 않습니다. 파트너는 비의료 동행과 행정 보조, 정보 전달만 수행합니다.",
            },
        ],
    },
];

/** 카테고리별 아이콘 색상 (시안 반영) */
const CAT_TONE: Record<string, string> = {
    "서비스 이용": "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15",
    "서비스 종류": "bg-teal-100 text-teal-600 dark:bg-teal-500/15",
    파트너: "bg-violet-100 text-violet-600 dark:bg-violet-500/15",
    "예약 · 결제": "bg-blue-100 text-blue-600 dark:bg-blue-500/15",
    "안전 · 보호자": "bg-sky-100 text-sky-600 dark:bg-sky-500/15",
};

export function FaqList() {
    const [query, setQuery] = useState("");
    const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

    const q = query.trim().toLowerCase();
    const filtered = useMemo(() => {
        if (!q) return CATEGORIES;
        return CATEGORIES.map((c) => ({
            ...c,
            items: c.items.filter((it) =>
                (it.q + it.a).toLowerCase().includes(q),
            ),
        })).filter((c) => c.items.length > 0);
    }, [q]);

    const toggle = (key: string) =>
        setOpenKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    return (
        <Section className="pt-6 md:pt-8">
            {/* 검색 */}
            <div className="mx-auto mb-10 max-w-xl">
                <div className="relative">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="궁금한 내용을 검색해 보세요."
                        aria-label="FAQ 검색"
                        className="border-border bg-background text-foreground focus:border-brand w-full rounded-full border py-3 pr-4 pl-11 text-sm transition-colors outline-none"
                    />
                </div>
            </div>

            {filtered.length === 0 ? (
                <p className="text-muted-foreground py-10 text-center">
                    검색 결과가 없습니다.
                </p>
            ) : (
                <div className="flex flex-col gap-8">
                    {filtered.map((cat) => {
                        const Icon = cat.icon;
                        return (
                            <div
                                key={cat.name}
                                className="grid gap-4 md:grid-cols-[200px_1fr]"
                            >
                                <div className="flex flex-col items-start gap-3 md:pt-1">
                                    <div
                                        className={cn(
                                            "flex size-14 items-center justify-center rounded-2xl",
                                            CAT_TONE[cat.name] ??
                                                "bg-brand/10 text-brand",
                                        )}
                                    >
                                        <Icon className="size-6" />
                                    </div>
                                    <h2 className="text-foreground text-xl font-extrabold">
                                        {cat.name}
                                    </h2>
                                </div>

                                <div className="divide-border/60 border-border/70 bg-background divide-y overflow-hidden rounded-2xl border shadow-sm">
                                    {cat.items.map((it) => {
                                        const key = cat.name + it.q;
                                        const isOpen = openKeys.has(key);
                                        return (
                                            <div key={it.q}>
                                                <button
                                                    type="button"
                                                    onClick={() => toggle(key)}
                                                    aria-expanded={isOpen}
                                                    className="hover:bg-muted/30 flex w-full items-center justify-between gap-3 px-6 py-5 text-left transition-colors"
                                                >
                                                    <span className="text-foreground text-base font-semibold">
                                                        <span className="text-brand mr-1.5 font-bold">
                                                            Q.
                                                        </span>
                                                        {it.q}
                                                    </span>
                                                    <ChevronDown
                                                        className={cn(
                                                            "text-muted-foreground/60 size-5 shrink-0 transition-transform",
                                                            isOpen &&
                                                                "text-brand rotate-180",
                                                        )}
                                                    />
                                                </button>
                                                {/* grid-rows 0fr→1fr 트릭으로 높이 부드럽게 전환 */}
                                                <div
                                                    className={cn(
                                                        "grid transition-[grid-template-rows] duration-200 ease-out",
                                                        isOpen
                                                            ? "grid-rows-[1fr]"
                                                            : "grid-rows-[0fr]",
                                                    )}
                                                >
                                                    <div className="overflow-hidden">
                                                        <p
                                                            className={cn(
                                                                "text-muted-foreground px-6 pb-5 text-sm leading-relaxed transition-opacity duration-200",
                                                                isOpen
                                                                    ? "opacity-100"
                                                                    : "opacity-0",
                                                            )}
                                                        >
                                                            {it.a}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Section>
    );
}
