import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { masterUnresolvedSessions } from './master-native-handoff.mjs';
import { masterLaunchBlocker, masterPreviousSessionIssue, masterRecoveryForStagedPlan, createMasterSessionDeployment } from './master-session-gateway.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const PREP_LEAD_MS = 90000;
const VIEWER_LEAD_MS = 20000;

export function masterFirstCommandNotBefore(item, nowMs = Date.now()) {
  const start = Date.parse(item.start), end = Date.parse(item.end);
  const published = Date.parse(item.masterViewerStreamStartedAt);
  if (item.streamStatus !== 'publishing' || !Number.isFinite(published) || published > nowMs ||
      !Number.isFinite(start) || !Number.isFinite(end) || nowMs < start || nowMs >= end) {
    throw new Error('Master viewer countdown requires a publishing stream and an open booking');
  }
  const notBefore = Math.max(start, published) + VIEWER_LEAD_MS;
  if (notBefore >= end) throw new Error('The booking ends before the 20-second Master viewing period is complete');
  return new Date(notBefore).toISOString();
}

// An archived handoff only discharges its previous attempt. Every new booking
// gets a separate bounded read-only SDK preflight for its own plan and deadline.
export function masterBookingAdmission(session, item, { sessions, runtimeDir, deploymentFile,
  claimableStatuses, masterChecks, runCheck, observePrior, prepareOnly=false, now=Date.now }) {
  const id = String(session.id);
  const nowMs = now(), startMs = Date.parse(item.start), endMs = Date.parse(item.end);
  function blocked(reason) {
    masterChecks.discard(id);
    return { status:'blocked', reason };
  }
  let config;
  try {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || nowMs >= endMs) {
      return blocked('Master booked session has expired or is invalid');
    }
    if (!claimableStatuses.includes(String(session.session_status).trim().toLowerCase()) || item.executionAttemptId ||
        String(session.code_submission_id) !== String(item.executionSubmissionId) || session.email !== item.accountEmail ||
        String(session.robot_model).trim().toLowerCase() !== 'master' || session.approved_run_type !== 'custom_code' ||
        Date.parse(session.scheduled_start) !== startMs || Date.parse(session.scheduled_end) !== endMs) {
      return blocked('Master booking changed since staging');
    }
    if (prepareOnly && nowMs < startMs) {
      const earlierMaster = Object.entries(sessions).some(([otherId, other]) => otherId !== id
        && other.executionModel === 'master' && other.status === 'staged' && Date.parse(other.end) > nowMs
        && (Date.parse(other.start) < startMs || (Date.parse(other.start) === startMs && otherId < id)));
      if (nowMs < startMs - PREP_LEAD_MS || earlierMaster) {
        masterChecks.discard(id);
        return {status:'waiting'};
      }
    }
    if (!deploymentFile) throw new Error('AGENTECH_MASTER_DEPLOYMENT_FILE is not configured');
    config = JSON.parse(readFileSync(deploymentFile,'utf8'));
    const outstanding = masterUnresolvedSessions(sessions,runtimeDir,config);
    item.masterRecoveryOwner = masterRecoveryForStagedPlan(readFileSync(item.localPlan),item.executionPlanSha256,outstanding,id);
    const issue = masterPreviousSessionIssue(outstanding,id,item,nowMs);
    const blocker = prepareOnly ? issue?.reason : masterLaunchBlocker(outstanding,id,item,nowMs);
    if (blocker) {
      const previous = outstanding[issue?.priorId];
      if (blocker === issue?.reason && previous?.status === 'finished' && previous.executionStatus === 'failed' &&
          previous.masterHandoffReady === false && item.status === 'staged' && !item.pid) {
        const detail = observePrior?.({previousId:issue.priorId,attempt:previous.executionAttemptId,waitingId:id,config});
        if (detail) return blocked(blocker+': '+detail);
      }
      return blocked(blocker);
    }
  } catch (error) { return blocked('Master handoff check failed: '+error.message); }
  try {
    const attempt = item.masterPreparedAttemptId ?? randomUUID();
    const manifest = JSON.stringify(createMasterSessionDeployment(config,session,item,attempt));
    const identity = sha(manifest);
    item.masterPreparedAttemptId = attempt;
    item.masterSessionDeployment = join(runtimeDir,`session-${id}.${attempt}.master.json`);
    item.masterCancelFile = join(runtimeDir,`session-${id}.${attempt}.cancel`);
    if (existsSync(item.masterCancelFile)) throw new Error('Master session cancelled');
    const checked = masterChecks.poll({ id, identity, planHash:item.executionPlanSha256, startMs, endMs, prepareOnly },
      async ({ timeoutMs,signal }) => {
        writeFileSync(item.masterSessionDeployment,manifest);
        return runCheck({planPath:item.localPlan,deploymentPath:item.masterSessionDeployment,timeoutMs,signal});
      });
    if (checked.status === 'failed') return {status:'blocked',reason:'Master readiness check failed: '+checked.error};
    if (checked.status !== 'ready') return {status:'waiting'};
    if (sha(readFileSync(item.masterSessionDeployment)) !== identity) throw new Error('Master deployment changed after readiness');
    return {status:'ready',expiresAt:checked.expiresAt};
  } catch (error) { return blocked('Master readiness check failed: '+error.message); }
}
