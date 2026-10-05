"use client";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
    REVIEW_PUBLICATION,
    REVIEW_PUBLICATION_WORDING,
} from "@/lib/legal/review-publication";
import { kstDateTime } from "@/lib/format";
type Review = {
    id: string;
    title: string;
    content: string;
    author_masked: string;
    plan: string;
    rating: number;
    published_on: string;
    consent_id: string | null;
    public_title: string | null;
    public_content: string | null;
    consented_at: string | null;
    expires_at: string | null;
    withdrawn_at: string | null;
    contains_health_information: boolean | null;
};
export function PublicationManager() {
    const [reason, setReason] = useState("");
    const [rows, setRows] = useState<Review[] | null>(null);
    const [healthEnabled, setHealthEnabled] = useState(false);
    const [selected, setSelected] = useState("");
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState("");
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [subject, setSubject] = useState("");
    const [party, setParty] = useState("ACTUAL_RECIPIENT");
    const [evidence, setEvidence] = useState("");
    const [authority, setAuthority] = useState("");
    const [consented, setConsented] = useState("");
    const [wording, setWording] = useState("");
    const [items, setItems] = useState("후기 공개본");
    const [health, setHealth] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const review = rows?.find((r) => r.id === selected);
    async function load() {
        setPending(true);
        setMessage("");
        try {
            const result = await createClient().rpc(
                "admin_review_publication_queue",
                { p_reason: reason.trim() },
            );
            if (result.error) {
                setRows(null);
                setMessage(
                    "전체 관리자 권한·MFA 인증과 열람 사유(5~500자)를 확인해 주세요.",
                );
                return;
            }
            setRows(result.data.reviews);
            setHealthEnabled(result.data.healthEnabled);
        } catch {
            setRows(null);
            setMessage(
                "조회하지 못했습니다. 비공개 상태로 단정하지 말고 다시 확인해 주세요.",
            );
        } finally {
            setPending(false);
        }
    }
    function choose(id: string) {
        const r = rows?.find((row) => row.id === id);
        setSelected(id);
        setTitle(r?.public_title ?? r?.title ?? "");
        setContent(r?.public_content ?? r?.content ?? "");
        setSubject("");
        setEvidence("");
        setAuthority("");
        setConsented("");
        setWording("");
        setParty("ACTUAL_RECIPIENT");
        setHealth(false);
        setConfirmed(false);
        setItems("후기 공개본");
        setMessage("");
    }
    async function publish() {
        if (!review || !confirmed) return;
        setPending(true);
        setMessage("");
        try {
            const date = new Date(`${consented}:00+09:00`);
            if (!Number.isFinite(date.getTime())) {
                setMessage(
                    "실제 동의 시각을 입력해 주세요. 시간은 한국 시간입니다.",
                );
                return;
            }
            const result = await createClient().rpc("admin_publish_review", {
                p_source: "provided",
                p_review_id: review.id,
                p_subject_reference: subject.trim(),
                p_consenting_party: party,
                p_evidence_reference: evidence.trim(),
                p_authority_evidence_reference:
                    party === "VERIFIED_REPRESENTATIVE"
                        ? authority.trim()
                        : null,
                p_consented_at: date.toISOString(),
                p_wording_version: REVIEW_PUBLICATION.version,
                p_wording_snapshot: wording.trim(),
                p_allowed_items: items
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                p_title: title,
                p_content: content,
                p_contains_health_information: health,
            });
            if (result.error) {
                setMessage(
                    "등록하지 못했습니다. 동의 주체·증빙·문구·허용 항목·동의일과 건강정보 공개 준비 상태를 확인해 주세요.",
                );
                return;
            }
            setConfirmed(false);
            await load();
            setMessage(
                "공개본을 등록했습니다. 메인·후기 목록·상세에서 같은 공개본을 사용합니다.",
            );
        } catch {
            setMessage(
                "결과를 확인하지 못했습니다. 다시 등록하기 전에 목록을 조회해 주세요.",
            );
        } finally {
            setPending(false);
        }
    }
    async function withdraw() {
        if (!review?.consent_id) return;
        setPending(true);
        try {
            const result = await createClient().rpc(
                "admin_withdraw_review_publication",
                { p_consent_id: review.consent_id, p_reason: reason.trim() },
            );
            if (result.error) {
                setMessage(
                    "철회 처리에 실패했습니다. 권한·MFA·철회 사유·현재 상태를 확인해 주세요.",
                );
                return;
            }
            await load();
            setMessage("철회를 반영했습니다. 공개 조회에서 즉시 제외됩니다.");
        } catch {
            setMessage(
                "철회 결과를 확인하지 못했습니다. 목록을 다시 조회해 주세요.",
            );
        } finally {
            setPending(false);
        }
    }
    const canPublish =
        !!review &&
        confirmed &&
        title.trim().length >= 2 &&
        content.trim().length > 0 &&
        subject.trim().length >= 5 &&
        evidence.trim().length >= 5 &&
        wording.trim().length >= 100 &&
        !!consented &&
        (!health || healthEnabled) &&
        (party !== "VERIFIED_REPRESENTATIVE" || authority.trim().length >= 5);
    const inputClass = "mt-1 block w-full rounded border p-2";
    return (
        <div className="mt-5 space-y-4">
            <label className="block">
                열람·철회 사유 (5~500자)
                <input
                    className={inputClass}
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                />
            </label>
            <button
                className="cursor-pointer rounded border px-4 py-2 disabled:cursor-not-allowed"
                disabled={pending || reason.trim().length < 5}
                onClick={load}
            >
                후기 및 공개 상태 조회
            </button>
            <p role="status">{message}</p>
            {rows && (
                <>
                    <p>
                        제공 후기 {rows.length}건 · 진료·검사 정보 공개{" "}
                        {healthEnabled ? "활성" : "준비 중"}
                    </p>
                    <label className="block">
                        등록할 후기
                        <select
                            className={inputClass}
                            value={selected}
                            onChange={(e) => choose(e.target.value)}
                        >
                            <option value="">후기를 선택해 주세요</option>
                            {rows.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.published_on} · {r.author_masked} ·{" "}
                                    {r.title}
                                </option>
                            ))}
                        </select>
                    </label>
                </>
            )}
            {review && (
                <div className="space-y-4 rounded border p-4">
                    <p>후기 식별번호: {review.id}</p>
                    {review.consent_id ? (
                        <p>
                            최근 등록 동의: {kstDateTime(review.consented_at)} ·
                            만료: {kstDateTime(review.expires_at)} ·{" "}
                            {review.withdrawn_at
                                ? "철회됨"
                                : "만료·건강정보 공개 조건 충족 시 공개"}
                        </p>
                    ) : (
                        <p>공개 동의 기록 미등록</p>
                    )}
                    <label className="block">
                        공개 제목
                        <input
                            className={inputClass}
                            value={title}
                            maxLength={200}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </label>
                    <label className="block">
                        동의받은 정확한 공개 본문
                        <textarea
                            className={inputClass}
                            rows={6}
                            value={content}
                            maxLength={10000}
                            onChange={(e) => setContent(e.target.value)}
                        />
                    </label>
                    <label className="block">
                        실제 이용자 식별 참조 (비공개, 실명 대신 관리번호)
                        <input
                            className={inputClass}
                            value={subject}
                            maxLength={200}
                            onChange={(e) => setSubject(e.target.value)}
                        />
                    </label>
                    <label className="block">
                        동의 주체
                        <select
                            className={inputClass}
                            value={party}
                            onChange={(e) => setParty(e.target.value)}
                        >
                            <option value="ACTUAL_RECIPIENT">
                                실제 이용자 본인
                            </option>
                            <option value="VERIFIED_REPRESENTATIVE">
                                대리권을 확인한 대리인
                            </option>
                        </select>
                    </label>
                    <label className="block">
                        비공개 동의 증빙 참조
                        <input
                            className={inputClass}
                            value={evidence}
                            maxLength={200}
                            onChange={(e) => setEvidence(e.target.value)}
                        />
                    </label>
                    {party === "VERIFIED_REPRESENTATIVE" && (
                        <label className="block">
                            대리권 증빙 참조
                            <input
                                className={inputClass}
                                value={authority}
                                maxLength={200}
                                onChange={(e) => setAuthority(e.target.value)}
                            />
                        </label>
                    )}
                    <label className="block">
                        실제 동의일·시각 (한국 시간)
                        <input
                            type="datetime-local"
                            className={inputClass}
                            value={consented}
                            onChange={(e) => setConsented(e.target.value)}
                        />
                    </label>
                    <p>
                        공통 동의일 확인: 2026-10-04. 정확한 시각을 알지 못하면
                        임의로 생성하지 않습니다.
                    </p>
                    <label className="block">
                        허용 공개 항목 (한 줄에 하나, ‘후기 공개본’ 필수)
                        <textarea
                            className={inputClass}
                            value={items}
                            onChange={(e) => setItems(e.target.value)}
                        />
                    </label>
                    <label className="block">
                        실제 동의 당시 문구 ({REVIEW_PUBLICATION.version})
                        <textarea
                            className={inputClass}
                            rows={6}
                            value={wording}
                            onChange={(e) => setWording(e.target.value)}
                        />
                    </label>
                    <details>
                        <summary className="cursor-pointer">
                            확정 공개 동의 양식 참고
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap">
                            {REVIEW_PUBLICATION_WORDING}
                        </p>
                    </details>
                    <label className="flex gap-2">
                        <input
                            type="checkbox"
                            checked={health}
                            onChange={(e) => setHealth(e.target.checked)}
                        />
                        공개본에 진료·검사 등 건강 정보가 포함됩니다.
                    </label>
                    {health && !healthEnabled && (
                        <p role="alert">
                            건강정보 공개는 준비 중입니다. 포함 여부를 해제하여
                            우회하지 마세요.
                        </p>
                    )}
                    <label className="flex gap-2">
                        <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        실제 이용자 또는 확인된 대리권의 별도 공개 동의와 정확한
                        공개본·허용 항목·동의 문구·증빙을 대조했습니다.
                    </label>
                    <button
                        className="cursor-pointer rounded border px-4 py-2 disabled:cursor-not-allowed"
                        disabled={pending || !canPublish}
                        onClick={publish}
                    >
                        동의 기록 등록 및 공개
                    </button>
                    {review.consent_id && !review.withdrawn_at && (
                        <button
                            className="ml-3 cursor-pointer rounded border px-4 py-2 disabled:cursor-not-allowed"
                            disabled={pending || reason.trim().length < 5}
                            onClick={withdraw}
                        >
                            철회 요청 반영
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
