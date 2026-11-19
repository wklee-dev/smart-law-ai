import { ItemMasterView } from "@/app/(ai)/cas-ncom/item-master/item-master-view";
import { IMPORT_ITEM_MASTER_COLUMNS } from "@/app/lib/cas-ncom-item-master-columns";

export default function CasNcomImportItemMasterPage() {
  return (
    <ItemMasterView
      title="수입품목마스터"
      apiPath="/api/cas-ncom/import-item-master/search"
      columns={IMPORT_ITEM_MASTER_COLUMNS}
      showDetailTabs
    />
  );
}
