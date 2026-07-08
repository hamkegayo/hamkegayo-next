"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

import { cn } from "@/lib/utils";

type Review = {
  rating: number;
  text: string;
  name: string;
  meta: string;
};

const REVIEWS: Review[] = [
  {
    rating: 5,
    text: "어머니 정형외과 진료에 동행해 주셨는데, 의사 선생님 말씀을 따로 정리해 알려주셔서 정말 안심이 됐어요.",
    name: "김O연",
    meta: "50대 보호자",
  },
  {
    rating: 5,
    text: "혼자 사시는 아버지 백내장 수술 날, 접수부터 귀가까지 함께해 주셔서 회사에 있는 저도 마음이 놓였습니다.",
    name: "이O준",
    meta: "40대 보호자",
  },
  {
    rating: 4,
    text: "실시간으로 위치와 진행 상황을 보내주셔서, 멀리 있어도 어머니가 어디서 무엇을 하시는지 다 알 수 있었어요.",
    name: "박O희",
    meta: "60대 이용자",
  },
  {
    rating: 5,
    text: "거동이 불편하신 아버지를 정성껏 부축해 주시고, 진료 내내 곁을 지켜주셔서 감사했습니다.",
    name: "정O아",
    meta: "50대 보호자",
  },
  {
    rating: 5,
    text: "예약부터 리포트까지 과정이 투명해서 믿고 맡길 수 있었어요. 다음에도 이용할 생각입니다.",
    name: "최O훈",
    meta: "40대 보호자",
  },
  {
    rating: 4,
    text: "약 수령까지 도와주셔서 번거로운 일이 줄었어요. 리포트도 꼼꼼해서 다음 진료 준비에 큰 도움이 됐습니다.",
    name: "한O서",
    meta: "50대 보호자",
  },
];

const AUTO_MS = 5000;

// 화면 폭에 따른 한 번에 보이는 카드 수 (SSR 기본 3)
function subscribe(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
function getPerView() {
  const w = window.innerWidth;
  return w >= 1024 ? 3 : w >= 640 ? 2 : 1;
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "size-4",
            i < rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted",
          )}
        />
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-border bg-background p-6">
      <Stars rating={review.rating} />
      <p className="mt-3 flex-1 text-sm leading-relaxed text-foreground">
        “{review.text}”
      </p>
      <div className="mt-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
          {review.name.charAt(0)}
        </span>
        <div>
          <p className="text-sm font-bold text-foreground">{review.name}</p>
          <p className="text-xs text-muted-foreground">{review.meta}</p>
        </div>
      </div>
    </article>
  );
}

export function ReviewsCarousel() {
  // SSR 안전한 perView 구독 (setState-in-effect 회피)
  const perView = useSyncExternalStore(subscribe, getPerView, () => 3);
  const [index, setIndex] = useState(0);

  const maxIndex = Math.max(0, REVIEWS.length - perView);
  const current = Math.min(index, maxIndex);

  const go = (next: number) => {
    if (next < 0) setIndex(maxIndex);
    else if (next > maxIndex) setIndex(0);
    else setIndex(next);
  };

  // 5초마다 오른쪽으로 자동 넘김
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i >= maxIndex ? 0 : i + 1));
    }, AUTO_MS);
    return () => clearInterval(timer);
  }, [maxIndex]);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 md:gap-4">
        {/* 이전 */}
        <button
          type="button"
          onClick={() => go(current - 1)}
          aria-label="이전 후기"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </button>

        {/* 뷰포트 */}
        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${current * (100 / perView)}%)` }}
          >
            {REVIEWS.map((review, i) => (
              <div
                key={i}
                className="shrink-0 px-2"
                style={{ width: `${100 / perView}%` }}
              >
                <ReviewCard review={review} />
              </div>
            ))}
          </div>
        </div>

        {/* 다음 */}
        <button
          type="button"
          onClick={() => go(current + 1)}
          aria-label="다음 후기"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* 점 (페이지네이션) */}
      <div className="mt-6 flex justify-center gap-2">
        {Array.from({ length: maxIndex + 1 }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={`${i + 1}번째로 이동`}
            className={cn(
              "h-2 rounded-full transition-all",
              i === current ? "w-5 bg-brand" : "w-2 bg-border hover:bg-muted-foreground/40",
            )}
          />
        ))}
      </div>
    </div>
  );
}
