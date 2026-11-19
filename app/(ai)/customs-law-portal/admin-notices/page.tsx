import { ClipAdminNoticeView } from "@/app/(ai)/customs-law-portal/admin-notices/clip-admin-notice-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "행정예고 · 관세법령정보포털",
};

export default function ClipAdminNoticesPage() {
  return <ClipAdminNoticeView />;
}
