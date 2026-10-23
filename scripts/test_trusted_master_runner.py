import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import Mock

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))


class TrustedMasterRunnerTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue((SCRIPTS / 'trusted-master-runner.py').exists(), 'Master runner is missing')
        spec = importlib.util.spec_from_file_location('trusted_master_test', SCRIPTS / 'trusted-master-runner.py')
        self.runner = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.runner)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.plan = {'version': 2, 'robot_model': 'master', 'submission_id': 'sub', 'source_sha256': 'a'*64,
                     'commands': [{'name': 'adjust_right_elbow', 'args': {'degrees': 5}, 'line': 1},
                                  {'name': 'adjust_left_elbow', 'args': {'degrees': 5}, 'line': 2}]}
        self.plan_path = self.root / 'plan.json'
        self.plan_path.write_text(json.dumps(self.plan), encoding='utf-8')
        self.deployment = {'schema_version': 1, 'robot_model': 'master', 'enabled': True,
            'host': '192.168.4.152', 'sdk_root': str(self.root), 'standing_deployment': '/reviewed/sdk',
            'session_id': '42', 'submission_id': 'sub', 'source_sha256': 'a'*64,
            'plan_sha256': hashlib.sha256(self.plan_path.read_bytes()).hexdigest(),
            'attempt_id': 'attempt', 'scheduled_start': '2026-10-22T00:00:00Z', 'scheduled_end': '2026-10-23T00:00:00Z'}
        self.deployment_path = self.root / 'deployment.json'
        self.deployment_path.write_text(json.dumps(self.deployment), encoding='utf-8')
        self.result = self.root / 'result.json'
        self.adapter = Mock()
        self.adapter.check_ready.return_value = {'requestId': 'request', 'publisherPid': 42, 'ownerMode': 'current-hold',
            'aimdkMcMode': 'STAND_DEFAULT', 'nativeOwner': 'native-mc', 'sdk_fresh_ready_verified': True,
            'guidedSides': ['left', 'right']}
        self.adapter.execute.return_value = {'accepted': True, 'phase': 'adjusted-hold', 'fault': None,
            'requestId': 'request', 'nonce': 1, 'publisherPid': 42, 'endpointVerified': True}

    def run_plan(self, **kwargs):
        return self.runner.execute_plan(self.plan_path, self.deployment_path, self.result,
            adapter_factory=lambda config: self.adapter, now=lambda: 1792670400, **kwargs)

    def test_receipt_binds_identity_and_never_releases_persistent_hold(self):
        receipt = self.run_plan()
        self.assertEqual(receipt['schema_version'], 1)
        self.assertEqual(receipt['outcome'], 'completed')
        self.assertEqual(receipt['completed_count'], 2)
        self.assertEqual(receipt['attempt_id'], 'attempt')
        self.assertTrue(receipt['handoff_ready'])
        self.assertEqual(receipt['handoff_mode'], 'retained-hold')
        self.assertTrue(receipt['owner_hold_preserved'])
        self.adapter.stop.assert_not_called()
        self.adapter.restore.assert_not_called()
        self.assertEqual(json.loads(self.result.read_text())['plan_sha256'], self.deployment['plan_sha256'])

    def test_timeout_is_not_retried_and_blocks_following_command(self):
        self.adapter.execute.side_effect = TimeoutError('ambiguous acknowledgment')
        result = self.run_plan()
        self.assertEqual(result['outcome'], 'failed')
        self.assertEqual(result['completed_count'], 0)
        self.assertEqual(self.adapter.execute.call_count, 1)
        self.assertTrue(result['owner_hold_preserved'])
        self.adapter.stop.assert_not_called()

    def test_invalid_binding_refuses_before_adapter_construction(self):
        self.deployment['source_sha256'] = 'b'*64
        self.deployment_path.write_text(json.dumps(self.deployment))
        with self.assertRaisesRegex(ValueError, 'source'):
            self.run_plan()
        self.adapter.check_ready.assert_not_called()

    def test_cancel_and_expiry_refuse_before_dispatch(self):
        cancel = self.root / 'cancel'
        cancel.write_text('cancel')
        result = self.run_plan(cancel_file=cancel)
        self.assertEqual(result['outcome'], 'failed')
        self.adapter.execute.assert_not_called()
        with self.assertRaisesRegex(ValueError, 'end'):
            self.run_plan(session_end='2026-10-24T00:00:00Z')

    def test_hardware_fault_or_unverified_result_never_completes(self):
        for result in [{'accepted': True}, {'phase': 'adjusted-hold', 'fault': 'fault'}, {'dry_run': True, 'endpointVerified': True}]:
            with self.subTest(result=result):
                self.adapter.reset_mock()
                self.adapter.execute.return_value = result
                receipt = self.run_plan()
                self.assertEqual(receipt['outcome'], 'failed')
                self.assertEqual(self.adapter.execute.call_count, 1)

    def test_movement_a_requires_current_supported_runtime_before_motion(self):
        self.plan['commands'] = [{'name': 'movement_a', 'args': {}, 'line': 1}]
        self.plan_path.write_text(json.dumps(self.plan))
        self.deployment['plan_sha256'] = hashlib.sha256(self.plan_path.read_bytes()).hexdigest()
        self.deployment_path.write_text(json.dumps(self.deployment))
        with self.assertRaisesRegex(ValueError, 'movement_a'):
            self.run_plan()
        self.adapter.execute.assert_not_called()

    def test_preflight_rejects_unsupported_plan_before_sdk_or_robot(self):
        self.plan['commands'] = [{'name': 'movement_a', 'args': {}, 'line': 1}]
        self.plan_path.write_text(json.dumps(self.plan))
        self.deployment['plan_sha256'] = hashlib.sha256(self.plan_path.read_bytes()).hexdigest()
        self.deployment_path.write_text(json.dumps(self.deployment))
        factory = Mock(return_value=self.adapter)
        with self.assertRaisesRegex(ValueError, 'movement_a'):
            self.runner.preflight(self.plan_path, self.deployment_path, adapter_factory=factory)
        factory.assert_not_called()

    def test_preflight_validates_sdk_arguments_before_readiness(self):
        self.adapter.validate.side_effect = ValueError('unsupported SDK range')
        with self.assertRaisesRegex(ValueError, 'SDK range'):
            self.runner.preflight(self.plan_path, self.deployment_path, adapter_factory=lambda config: self.adapter)
        self.adapter.check_ready.assert_not_called()

    def test_owner_wrapper_never_bootstraps_and_rejects_changed_binding(self):
        control, adapter = Mock(), Mock(binding=None)
        control.inspect_active_ready.return_value = None
        wrapper = self.runner.ExistingOwnerControl(control, adapter)
        with self.assertRaisesRegex(RuntimeError, 'existing qualified'):
            wrapper.ensure_ready()
        control.ensure_ready.assert_not_called()
        adapter.binding = {'requestId': 'original'}
        control.inspect_ready_binding.side_effect = RuntimeError('owner changed')
        with self.assertRaisesRegex(RuntimeError, 'owner changed'):
            wrapper.ensure_ready()

    def test_expiry_during_first_call_retains_hold_and_never_admits_second(self):
        current = [1792670400]
        def command(name, arguments):
            current[0] = self.runner._timestamp(self.deployment['scheduled_end']) + 1
            return {'accepted': True, 'phase': 'adjusted-hold', 'fault': None,
                'requestId': 'request', 'nonce': 1, 'publisherPid': 42}
        self.adapter.execute.side_effect = command
        receipt = self.runner.execute_plan(self.plan_path, self.deployment_path, self.result,
            adapter_factory=lambda config: self.adapter, now=lambda: current[0])
        self.assertEqual(receipt['completed_count'], 1)
        self.assertEqual(receipt['outcome'], 'failed')
        self.assertEqual(receipt['overrun_seconds'], 1)
        self.assertEqual(self.adapter.execute.call_count, 1)

    def test_all_supported_endpoint_shapes_remain_distinct(self):
        self.runner.require_completed('movement_b', {'endpointVerified': True, 'dry_run': False})
        self.runner.require_completed('showcase', {'endpointVerified': True, 'dry_run': False})
        self.runner.require_completed('adjust_waist', {'measuredEndpointVerified': True, 'poweredHoldVerified': True})
        self.runner.require_completed('restore_stand_hand_guide', {'upperBodyPoseVerified': True, 'absoluteReturnVerified': True})
        with self.assertRaises(RuntimeError):
            self.runner.require_completed('restore_stand_hand_guide', {'absoluteReturnVerified': True})

    def test_final_hold_observation_failure_is_a_failed_session(self):
        self.adapter.check_ready.side_effect = [self.adapter.check_ready.return_value, RuntimeError('owner fault after command')]
        receipt = self.run_plan()
        self.assertEqual(receipt['outcome'], 'failed')
        self.assertEqual(receipt['error']['command'], 'verify_master_hold')
        self.assertIn('owner fault', receipt['error']['message'])
        self.assertFalse(receipt['owner_hold_verified'])

    def test_duplicate_gateway_lease_refuses_other_client(self):
        with self.runner.master_lease(self.root / 'owner.lock'):
            with self.assertRaisesRegex(RuntimeError, 'exclusive lease'):
                with self.runner.master_lease(self.root / 'owner.lock'):
                    self.fail('second client entered')

    def test_failed_endpoint_evidence_is_retained_in_receipt(self):
        self.adapter.execute.return_value = {'endpointVerified': False, 'fault': 'measured endpoint did not settle', 'phase': 'fault-holding'}
        receipt = self.run_plan()
        self.assertEqual(receipt['commands'][0]['result']['fault'], 'measured endpoint did not settle')

    def test_numeric_database_submission_matches_compiler_string(self):
        self.plan['submission_id'] = '7'
        self.plan_path.write_text(json.dumps(self.plan))
        self.deployment['submission_id'] = 7
        self.deployment['plan_sha256'] = hashlib.sha256(self.plan_path.read_bytes()).hexdigest()
        self.deployment_path.write_text(json.dumps(self.deployment))
        receipt = self.run_plan()
        self.assertEqual(receipt['outcome'], 'completed')
        self.assertEqual(receipt['submission_id'], 7)

    def test_automatic_mode_entry_failure_blocks_all_adjustments(self):
        self.adapter.prepare_mode.side_effect = RuntimeError('raw entry failed native balance gate')
        receipt = self.run_plan()
        self.assertEqual(receipt['outcome'], 'failed')
        self.adapter.execute.assert_not_called()
        self.assertIn('raw entry failed', receipt['error']['message'])

    def test_existing_sdk_entry_is_used_only_when_no_owner_is_present(self):
        adapter = self.runner.SDKAdapter.__new__(self.runner.SDKAdapter)
        adapter.binding = None
        adapter.entry_in_progress = False
        adapter.robot = Mock()
        control = Mock()
        adapter._owner_factory = Mock(return_value=control)
        control.inspect_active_ready.return_value = None
        verified = {'requestId': 'owner', 'publisherPid': 123, 'ownerMode': 'current-hold'}
        def ready():
            adapter.binding = verified
            return verified
        adapter.check_ready = Mock(side_effect=ready)
        self.assertEqual(adapter.prepare_mode(), verified)
        adapter.robot.enter_stand_hand_guide.assert_called_once_with('both')
        adapter.prepare_mode()
        adapter.robot.enter_stand_hand_guide.assert_called_once()
        self.assertFalse(adapter.entry_in_progress)

    def test_mode_entry_failure_is_never_followed_by_adjustment(self):
        adapter = self.runner.SDKAdapter.__new__(self.runner.SDKAdapter)
        adapter.robot = Mock()
        adapter.prepare_mode = Mock(side_effect=RuntimeError('entry refused'))
        with self.assertRaisesRegex(RuntimeError, 'entry refused'):
            adapter.execute('adjust_right_elbow', {'degrees': 5})
        adapter.robot.adjust_right_elbow.assert_not_called()

    def test_expiry_after_raw_entry_refuses_requested_adjustment(self):
        adapter = self.runner.SDKAdapter.__new__(self.runner.SDKAdapter)
        adapter.robot = Mock()
        expired = [False]
        adapter.prepare_mode = Mock(side_effect=lambda: expired.__setitem__(0, True))
        def admission():
            if expired[0]: raise RuntimeError('session expired after entry')
        adapter.admission_check = admission
        with self.assertRaisesRegex(RuntimeError, 'expired after entry'):
            adapter.execute('adjust_right_elbow', {'degrees': 5})
        adapter.robot.adjust_right_elbow.assert_not_called()

    @unittest.skipUnless(shutil.which('node'), 'Node is required for the gateway receipt integration')
    def test_real_gateway_parser_accepts_completed_and_failed_python_receipts(self):
        expected = dict(sessionId='42', submissionId='sub', sourceSha256=self.deployment['source_sha256'],
            planSha256=self.deployment['plan_sha256'], attemptId='attempt', bookedEnd=self.deployment['scheduled_end'])
        script = "const {parseMasterExecutionResult}=await import(process.argv[1]); const fs=await import('node:fs'); parseMasterExecutionResult(fs.readFileSync(process.argv[2],'utf8'),JSON.parse(process.argv[3]));"
        for failed in (False, True):
            with self.subTest(failed=failed):
                self.adapter.check_ready.side_effect = None if not failed else [self.adapter.check_ready.return_value, RuntimeError('hold fault')]
                self.run_plan()
                checked = subprocess.run([shutil.which('node'), '--input-type=module', '-e', script,
                    (SCRIPTS/'master-session-gateway.mjs').as_uri(), str(self.result), json.dumps(expected)],
                    capture_output=True, text=True, timeout=20)
                self.assertEqual(checked.returncode, 0, checked.stderr)


if __name__ == '__main__':
    unittest.main()
