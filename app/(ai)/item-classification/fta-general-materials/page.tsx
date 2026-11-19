import { FtaPortalBoardView } from "@/app/(ai)/item-classification/fta-portal-board/fta-portal-board-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "일반자료 · FTA포털",
};

const SOURCE_URL =
  "https://www.customs.go.kr/ftaportalkor/na/ntt/selectNttList.do?mi=3508&bbsId=1465";

export default function FtaGeneralMaterialsPage() {
  return (
    <FtaPortalBoardView
      title="일반자료"
      sourceUrl={SOURCE_URL}
      sourceLabel="협정별 자료실 · 일반자료"
      apiBase="/api/fta-general-materials"
      tableHint="fta_general_materials"
      categoryLabel="협정"
    />
  );
}
