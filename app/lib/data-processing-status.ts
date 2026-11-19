export {
  PROCESSING_STATUS_DETAIL_COLUMNS,
  PROCESSING_STATUS_FIELD_DEFS,
  PROCESSING_STATUS_TABLE_COLUMNS,
  cellText,
  classifyProgress,
  progressLabel,
  formatCategoryBreakdown,
  parseProcessingStatusCount,
  processingStatusAdminRuleLegacyCount,
  processingStatusLawApiCount,
  summarizeProcessingStatus,
  summarizeProcessingStatusByCategory,
  summarizeProcessingStatusByProgress,
  type ProcessingStatusCategorySummary,
  type ProcessingStatusProgressSummary,
  type ProcessingStatusColumn,
  type ProcessingStatusItem,
  type ProcessingStatusKind,
  type ProcessingStatusPayload,
  type ProcessingStatusSummary,
} from "@/app/lib/data-processing-status-shared";

import fallbackConfig from "@/app/lib/data-processing-status.json";
import type { ProcessingStatusItem } from "@/app/lib/data-processing-status-shared";
import { filterProcessingStatusForDashboard } from "@/app/lib/data-processing-status-shared";

/** 빌드·오프라인 폴백용 정적 데이터 (씨엘 70% 행 제외) */
export const PROCESSING_STATUS_ITEMS: ProcessingStatusItem[] =
  filterProcessingStatusForDashboard(
    fallbackConfig.items as ProcessingStatusItem[],
  );

export const PROCESSING_STATUS_SOURCE = fallbackConfig.source as string;
