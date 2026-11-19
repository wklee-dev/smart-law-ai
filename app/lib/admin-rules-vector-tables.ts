/** 행정규칙 SQLite 벡터 저장 — 접두사(admin_rule / raw_rule)와 동일 */

export type AdminRulesVectorFamily = "admin" | "law";

export type AdminRulesVectorTableSet = {
  family: AdminRulesVectorFamily;
  prefix: "admin_rule" | "raw_rule";
  snapshots: "admin_rule_snapshots" | "raw_rule_snapshots";
  chunks: "admin_rule_chunks" | "raw_rule_chunks";
  snapshotFk: "admin_rule_snapshot_id" | "raw_rule_snapshot_id";
};

const ADMIN_SET: AdminRulesVectorTableSet = {
  family: "admin",
  prefix: "admin_rule",
  snapshots: "admin_rule_snapshots",
  chunks: "admin_rule_chunks",
  snapshotFk: "admin_rule_snapshot_id",
};

const RAW_SET: AdminRulesVectorTableSet = {
  family: "law",
  prefix: "raw_rule",
  snapshots: "raw_rule_snapshots",
  chunks: "raw_rule_chunks",
  snapshotFk: "raw_rule_snapshot_id",
};

export function adminRulesVectorTables(
  family: AdminRulesVectorFamily,
): AdminRulesVectorTableSet {
  return family === "law" ? RAW_SET : ADMIN_SET;
}
