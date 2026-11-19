import { ApqaNoticesView } from "@/app/(ai)/apqa/notices/apqa-notices-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "공지사항 · 농림축산검역본부",
};

export default function ApqaNoticesPage() {
  return <ApqaNoticesView />;
}
