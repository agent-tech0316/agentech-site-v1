import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location('master_dispatch_runner', SCRIPTS/'trusted-master-runner.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class DispatchModesTests(unittest.TestCase):
    def test_restore_after_incomplete_endpoint_accepts_exact_healthy_owner(self):
        adapter = self.adapter()
        adapter._owner_not_ready = ValueError
        expected = dict(previous_session_id='75', previous_attempt_id='attempt',
                        requestId='held-owner', publisherPid=123, ownerMode='current-hold')
        adapter.config['recovery_owner_binding'] = expected
        control = adapter._owner_factory.return_value
        control.inspect_active_ready.return_value = expected
        self.assertEqual(adapter.check_recovery_owner(), expected)
        control.inspect_retained_fault.assert_not_called()
        control.inspect_active_ready.return_value = {**expected, 'requestId': 'different-owner'}
        with self.assertRaisesRegex(RuntimeError, 'owner changed'):
            adapter.check_recovery_owner()

    def test_restore_fault_path_still_requires_sdk_verified_retained_fault(self):
        adapter = self.adapter()
        adapter._owner_not_ready = ValueError
        expected = dict(previous_session_id='75', previous_attempt_id='attempt',
                        requestId='fault-owner', publisherPid=123, ownerMode='current-hold')
        adapter.config['recovery_owner_binding'] = expected
        control = adapter._owner_factory.return_value
        control.inspect_active_ready.side_effect = ValueError('fault holding')
        control.inspect_retained_fault.return_value = expected
        self.assertEqual(adapter.check_recovery_owner(), expected)
        control.inspect_retained_fault.assert_called_once_with(required_sides=('left', 'right'))
        control.inspect_retained_fault.side_effect = RuntimeError('stale telemetry')
        with self.assertRaisesRegex(RuntimeError, 'stale telemetry'):
            adapter.check_recovery_owner()

    def adapter(self):
        adapter = runner.SDKAdapter.__new__(runner.SDKAdapter)
        adapter.config = {}
        adapter.robot = Mock()
        adapter.planner = Mock()
        adapter.prepare_mode = Mock()
        adapter.native_ready = Mock(return_value={'ownerMode': 'native-standing'})
        adapter.binding = None
        adapter.config = {}
        adapter._movement_a = Mock()
        adapter._owner_factory = Mock()
        return adapter

    def test_movement_a_uses_retained_adapter_without_entering_raw(self):
        adapter = self.adapter()
        expected = {'endpointVerified': True, 'ownerBinding': {'ownerMode': 'movement-a'}}
        adapter._movement_a.execute.return_value = expected
        self.assertEqual(adapter.execute('movement_a', {}), expected)
        adapter.prepare_mode.assert_not_called()
        adapter.robot.movement_a.assert_not_called()

    def test_native_preset_requires_native_readiness_without_raw_entry(self):
        adapter = self.adapter()
        adapter.execute('wave', {'hand': 'left'})
        adapter.native_ready.assert_called_once()
        adapter.robot.wave.assert_called_once_with(hand='left')
        adapter.prepare_mode.assert_not_called()
        adapter.native_ready.side_effect = RuntimeError('raw owner active')
        adapter.robot.reset_mock()
        with self.assertRaisesRegex(RuntimeError, 'raw owner'):
            adapter.execute('wave', {'hand': 'left'})
        adapter.robot.wave.assert_not_called()

    def test_explicit_recovery_never_automatically_bootstraps_owner(self):
        adapter = self.adapter()
        adapter.execute('accept_current_hold', {})
        adapter.execute('restore_stand_hand_guide', {})
        adapter.prepare_mode.assert_not_called()

    def test_readonly_validation_does_not_poll_robot_via_dry_client(self):
        adapter = self.adapter()
        adapter.validate([{'name': name, 'args': {}} for name in ('status', 'get_status', 'get_motion_readiness', 'action_catalog')])
        for name in ('status', 'get_status', 'get_motion_readiness', 'action_catalog'):
            getattr(adapter.planner, name).assert_not_called()

    def test_native_completion_requires_exact_sdk_task_success(self):
        valid = {'succeeded': True, 'dry_run': False, 'task_id': 5, 'task_state': 1,
                 'posture_before': 'STAND_DEFAULT', 'posture_after': 'STAND_DEFAULT'}
        runner.require_completed('wave', valid)
        for changed in ({'task_state': 2}, {'task_id': 0}, {'posture_after': 'MANIPULATE_DEFAULT'}):
            with self.assertRaises(RuntimeError): runner.require_completed('wave', {**valid, **changed})

    def test_accept_current_hold_uses_real_sdk_shape_without_invented_phase(self):
        valid = {'accepted': True, 'motionCommandsSent': False, 'nonce': 2,
            'requestId': 'owner', 'publisherPid': 123}
        runner.require_completed('accept_current_hold', valid)
        with self.assertRaises(RuntimeError):
            runner.require_completed('accept_current_hold', {**valid, 'motionCommandsSent': True})

    def test_release_requires_process_and_publisher_exit_evidence(self):
        with self.assertRaises(RuntimeError):
            runner.require_completed('release_returned_hold', {'ownerReleased': True})
        runner.require_completed('release_returned_hold', {'ownerReleased': True, 'phase': 'hold-released-waist-unverified',
            'upperBodyPoseVerified': False, 'releaseObservation': {
                'ownerProcessExited': True, 'publisherCount': 0, 'publisherLeaseReleased': True, 'rawMcMode': 'STAND_DEFAULT'}})

    def test_native_ready_refuses_publisher_or_incomplete_native_evidence(self):
        adapter = self.adapter()
        del adapter.native_ready
        evidence = {'aimdkMcMode': 'STAND_DEFAULT', 'standingStateVerified': True,
            'presetActionsReady': True, 'manipulationPublishers': 0,
            'nativeCommandOwnersVerified': True, 'nativeBalanceEvidenceVerified': True,
            'completeArmCommandFrameVerified': True, 'completeArmStateFrameVerified': True}
        adapter.robot.get_motion_readiness.return_value = evidence
        self.assertEqual(adapter.native_ready()['ownerMode'], 'native-standing')
        for changes in ({'manipulationPublishers': 1}, {'nativeCommandOwnersVerified': False}, {'presetActionsReady': False}, {'standingStateVerified': False}):
            adapter.robot.get_motion_readiness.return_value = {**evidence, **changes}
            with self.assertRaises(RuntimeError): adapter.native_ready()


if __name__ == '__main__': unittest.main()
