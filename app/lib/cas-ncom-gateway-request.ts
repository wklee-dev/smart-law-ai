import {
  CAS_GATEWAY_MODE_HEADER,
  type CasGatewayMode,
} from "@/app/lib/cas-ncom-api-paths";

export function parseCasGatewayMode(
  headerValue: string | null,
): CasGatewayMode {
  if (headerValue?.trim().toLowerCase() === "local") return "local";
  return "production";
}

export function casGatewayModeFromRequest(
  headers: Headers,
): CasGatewayMode {
  return parseCasGatewayMode(headers.get(CAS_GATEWAY_MODE_HEADER));
}
