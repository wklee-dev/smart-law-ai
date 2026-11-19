import { NlcNoticeView } from "@/app/(ai)/integrated-legislation-notice/nlc-notice-view";

export default function MinistryAdministrativeNoticePage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <NlcNoticeView kind="ministry-administrative" />
    </div>
  );
}
