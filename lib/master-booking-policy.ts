import { checkMasterExecutionCode } from "../features/eaic/02-unified-api/projects-validation/master-execution-contract";

export const masterGatewayProtocol = "master-arm-session-v1";

/** Deployment configuration is separate from fresh runtime/physical readiness. */
export function masterBookingBlocker(code: string, configuration: Record<string, string | undefined>) {
  const report = checkMasterExecutionCode(code);
  if (report.status !== "PASS") return {
    errorCode: "MASTER_PROGRAM_INVALID", status: 409,
    error: `The saved Master program no longer matches the upper-body SDK contract. Run Code Certification again. ${report.findings.map(item => item.message).join(" ")}`,
  };
  if (configuration.AGENTECH_MASTER_EXECUTION_ENABLED !== "true" || configuration.AGENTECH_MASTER_GATEWAY_PROTOCOL !== masterGatewayProtocol) return {
    errorCode: "MASTER_GATEWAY_NOT_CONFIGURED", status: 503,
    error: "Master scheduling is awaiting activation of its upper-body execution gateway. Ask the operator to finish the gateway deployment and enable Master booking. Your code remains saved; no booking credits were charged.",
  };
  return null;
}
