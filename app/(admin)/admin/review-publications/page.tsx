import { PublicationManager } from "./publication-manager";
export default function ReviewPublicationsPage() {
    return (
        <section>
            <h1 className="text-2xl font-bold">제공 후기 공개 관리</h1>
            <p className="mt-3">
                승인된 후기의 별도 공개 동의 기록을 등록합니다. 동의일부터 3년
                뒤 자동으로 공개가 중단되며, 철회 시 즉시 제외됩니다. 실제
                이용자와 증빙을 확인한 전체 관리자만 사용할 수 있습니다.
            </p>
            <PublicationManager />
        </section>
    );
}
