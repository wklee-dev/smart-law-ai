import { FtaPortalBoardView } from "@/app/(ai)/item-classification/fta-portal-board/fta-portal-board-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "집행지침 · FTA포털",
};

const SOURCE_URL =
  "https://www.customs.go.kr/ftaportalkor/na/ntt/selectNttList.do?mi=3509&bbsId=1466";

export default function FtaExecutionGuidancePage() {
  return (
    <FtaPortalBoardView
      title="집행지침"
      sourceUrl={SOURCE_URL}
      sourceLabel="협정별 자료실 · 집행지침"
      apiBase="/api/fta-execution-guidance"
      tableHint="fta_execution_guidance_post"
      categoryLabel="구분"
    />
  );
}
