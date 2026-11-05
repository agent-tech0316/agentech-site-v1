import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { masterUnresolvedSessions } from './master-native-handoff.mjs';
import { masterLaunchBlocker, masterRecoveryForStagedPlan, createMasterSessionDeployment } from './master-session-gateway.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// An archived handoff only discharges its previous attempt. Every new booking
// gets a separate bounded read-only SDK preflight for its own plan and deadline.
export function masterBookingAdmission(session, item, { sessions, runtimeDir, deploymentFile,
  claimableStatuses, masterChecks, runCheck }) {
  const id = String(session.id);
  function blocked(reason) {
    masterChecks.discard(id);
    return { status:'blocked', reason };
  }
  let config;
  try {
    if (!deploymentFile) throw new Error('AGENTECH_MASTER_DEPLOYMENT_FILE is not configured');
    config = JSON.parse(readFileSync(deploymentFile,'utf8'));
    const outstanding = masterUnresolvedSessions(sessions,runtimeDir,config);
    item.masterRecoveryOwner = masterRecoveryForStagedPlan(readFileSync(item.localPlan),item.executionPlanSha256,outstanding,id);
    const blocker = masterLaunchBlocker(outstanding,id,item);
    if (blocker) return blocked(blocker);
  } catch (error) { return blocked('Master handoff check failed: '+error.message); }
  try {
    if (!claimableStatuses.includes(String(session.session_status).trim().toLowerCase()) || item.executionAttemptId ||
        String(session.code_submission_id) !== String(item.executionSubmissionId) || session.email !== item.accountEmail ||
        String(session.robot_model).trim().toLowerCase() !== 'master' || session.approved_run_type !== 'custom_code' ||
        Date.parse(session.scheduled_start) !== Date.parse(item.start) || Date.parse(session.scheduled_end) !== Date.parse(item.end)) {
      throw new Error('Master booking changed since staging');
    }
    const attempt = item.masterPreparedAttemptId ?? randomUUID();
    const manifest = JSON.stringify(createMasterSessionDeployment(config,session,item,attempt));
    const identity = sha(manifest);
    item.masterPreparedAttemptId = attempt;
    item.masterSessionDeployment = join(runtimeDir,`session-${id}.${attempt}.master.json`);
    item.masterCancelFile = join(runtimeDir,`session-${id}.${attempt}.cancel`);
    if (existsSync(item.masterCancelFile)) throw new Error('Master session cancelled');
    const checked = masterChecks.poll({ id, identity, planHash:item.executionPlanSha256, endMs:Date.parse(item.end) },
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
