import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Only this adapter knows the Navi runner's admission protocol. A bare
// --check-home-ready is the legacy damped-posture check, not booking admission.
function verifyStagedBooking(session, item, runtimeDir, claimableStatuses, readPlan) {
  if (!claimableStatuses.includes(String(session.session_status).toLowerCase()) || item.executionAttemptId ||
      session.approved_run_type !== 'custom_code' || String(session.robot_model).toLowerCase() !== 'navi' ||
      session.email !== item.accountEmail || session.code_submission_id !== item.executionSubmissionId ||
      Date.parse(session.scheduled_start) !== Date.parse(item.start) || Date.parse(session.scheduled_end) !== Date.parse(item.end)) {
    throw new Error('Navi booking changed since staging');
  }
  const path = join(runtimeDir, `session-${session.id}.plan.json`);
  if (item.localPlan !== path) throw new Error('Navi staged plan path does not belong to this booking');
  const digest = item.executionPlanSha256;
  const bytes = readPlan(path);
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Navi staged plan hash changed');
  const plan = JSON.parse(bytes.toString('utf8'));
  if (plan.version !== 2 || plan.robot_model !== 'navi' || plan.submission_id !== item.executionSubmissionId ||
      plan.source_sha256 !== item.executionSourceSha256) throw new Error('Navi staged plan does not match the reviewed submission');
  return digest;
}

export function checkNaviBookedReadiness({ session, item, runtimeDir, claimableStatuses, readPlan = readFileSync, checkRunner }) {
  const digest = verifyStagedBooking(session, item, runtimeDir, claimableStatuses, readPlan);
  checkRunner(['--check-home-ready', item.localPlan, digest]);
  if (verifyStagedBooking(session, item, runtimeDir, claimableStatuses, readPlan) !== digest) {
    throw new Error('Navi staged plan hash changed during readiness');
  }
}
