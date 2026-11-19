import "server-only";
import { loadProcessingStatusPayload } from "@/app/lib/data-processing-status-sync";
import {
  filterProcessingStatusPayloadForDashboard,
  type ProcessingStatusPayload,
} from "@/app/lib/data-processing-status-shared";

export function getProcessingStatusData(
  force = false,
): ProcessingStatusPayload {
  return filterProcessingStatusPayloadForDashboard(
    loadProcessingStatusPayload({ force }),
  );
}

export function refreshProcessingStatusData(
  force = true,
): ProcessingStatusPayload {
  return filterProcessingStatusPayloadForDashboard(
    loadProcessingStatusPayload({ force }),
  );
}
