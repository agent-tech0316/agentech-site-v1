import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScriptModule } from './test-utils/load-typescript-module.mjs';

const { checkMasterExecutionCode } = loadTypeScriptModule('features/eaic/02-unified-api/projects-validation/master-execution-contract.ts');
const entry = 'Agentech.enter_stand_hand_guide("both")';
const adjust = 'Agentech.adjust_right_elbow(45)';

test('Master adjustments require explicit prior bilateral entry', () => {
  for (const source of [adjust, `${adjust}\n${entry}`, `${entry}\nAgentech.restore_stand_hand_guide()\n${adjust}`]) {
    const report = checkMasterExecutionCode(source);
    assert.equal(report.status, 'FAIL');
    assert.match(JSON.stringify(report.findings), /enter_stand_hand_guide/);
    assert.equal(report.findings.length, 1);
  }
  assert.equal(checkMasterExecutionCode(`${entry}\n${adjust}`).status, 'PASS');
  assert.equal(checkMasterExecutionCode('Agentech.wave("right")').status, 'PASS');
});
