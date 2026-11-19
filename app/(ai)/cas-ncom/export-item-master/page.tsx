import { ItemMasterView } from "@/app/(ai)/cas-ncom/item-master/item-master-view";
import { EXPORT_ITEM_MASTER_COLUMNS } from "@/app/lib/cas-ncom-item-master-columns";

export default function CasNcomExportItemMasterPage() {
  return (
    <ItemMasterView
      title="수출품목마스터"
      apiPath="/api/cas-ncom/export-item-master/search"
      columns={EXPORT_ITEM_MASTER_COLUMNS}
    />
  );
}
