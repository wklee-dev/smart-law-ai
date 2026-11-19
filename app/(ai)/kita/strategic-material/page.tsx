import type { Metadata } from "next";
import { KitaStrategicMaterialView } from "@/app/(ai)/kita/strategic-material/kita-strategic-material-view";

export const metadata: Metadata = {
  title: "전략물자HS · KITA",
};

export default function KitaStrategicMaterialPage() {
  return <KitaStrategicMaterialView />;
}
