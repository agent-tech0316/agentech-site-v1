import importlib.util
from pathlib import Path
import types
import unittest


def load_adapter():
    path = Path(__file__).with_name('master-movement-a-adapter.py')
    spec = importlib.util.spec_from_file_location('master_movement_a_adapter', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def owner(request='owner-a', pid=123):
    return {'requestId': request, 'publisherPid': pid, 'ownerMode': 'movement-a',
            'aimdkMcMode': 'MANIPULATE_DEFAULT', 'nativeOwner': 'native-mc',
            'guidedSides': ['right'], 'phase': 'top-hold', 'fault': None,
            'topHoldReady': True, 'adjustmentReady': True, 'accepted': True}


class MovementAAdapterTests(unittest.TestCase):
    def setUp(self):
        self.module = load_adapter()
        self.config = {'host': '192.168.4.152', 'sdk_root': str(Path(__file__).parent),
            'ssh_username': 'run', 'movement_a': {'enabled': True,
            'deployment': '/home/run/.agentech/existing',
            'recording_root': '/home/run/.agentech/recordings',
            'recording': '/home/run/.agentech/recordings/movement-a.json',
            'recording_sha256': 'a' * 64, 'runner_sha256': 'b' * 64,
            'qualification_sha256': 'c' * 64, 'bridge_sha256': 'd' * 64}}
        self.calls = []
        self.observed_owner = None
        self.remote = {'ok': True, 'robotCommandsSent': False,
            'recordingHashVerified': True, 'runnerSha256': 'b' * 64,
            'qualificationSha256': 'c' * 64, 'existingReplayProcess': None}
        def move():
            self.calls.append('movement_a_payload')
            self.observed_owner = owner()
            return {'ok': True, 'reachedTopHold': True, 'fault': None}
        self.bridge = types.SimpleNamespace(
            movement_a_preflight_payload=lambda: self.remote,
            movement_a_payload=move)
        self.adapter = self.module.MovementAAdapter(self.config,
            inspect_owner=lambda: self.observed_owner, bridge_module=self.bridge,
            password_provider=lambda: 'test-only-password',
            recording_validator=lambda: {'offline_validated': True})

    def test_preflight_has_no_motion_and_binds_exact_target(self):
        result = self.adapter.preflight()
        self.assertTrue(result['ready'])
        self.assertEqual(self.calls, [])
        options = self.bridge.master_connection_options_from_environment()
        self.assertEqual(options['host'], '192.168.4.152')
        self.assertEqual(self.bridge.MOVEMENT_A_DEPLOYMENT, self.config['movement_a']['deployment'])

    def test_executes_existing_function_once_and_reports_real_owner_mode(self):
        result = self.adapter.execute()
        self.assertEqual(self.calls, ['movement_a_payload'])
        self.assertTrue(result['endpointVerified'])
        self.assertEqual(result['ownerBinding']['aimdkMcMode'], 'MANIPULATE_DEFAULT')

    def test_raw_owner_is_never_replaced_or_reentered(self):
        self.observed_owner = {**owner(), 'ownerMode': 'current-hold', 'aimdkMcMode': 'STAND_DEFAULT'}
        with self.assertRaisesRegex(RuntimeError, 'incompatible'):
            self.adapter.execute()
        self.assertEqual(self.calls, [])

    def test_remote_hash_mismatch_blocks_before_motion(self):
        self.remote['runnerSha256'] = 'e' * 64
        with self.assertRaisesRegex(RuntimeError, 'runner hash'):
            self.adapter.execute()
        self.assertEqual(self.calls, [])

    def test_missing_recording_rejects_before_motion(self):
        self.remote['recordingHashVerified'] = False
        with self.assertRaisesRegex(RuntimeError, 'recording'):
            self.adapter.execute()
        self.assertEqual(self.calls, [])

    def test_unrecognized_live_process_is_not_ignored(self):
        self.remote['existingReplayProcess'] = '999 unknown runner'
        with self.assertRaisesRegex(RuntimeError, 'unverified'):
            self.adapter.execute()
        self.assertEqual(self.calls, [])

    def test_expiry_after_preflight_prevents_launch(self):
        checks = []
        def admission():
            checks.append(True)
            if len(checks) == 2:
                raise RuntimeError('session expired')
        self.adapter.admission_check = admission
        with self.assertRaisesRegex(RuntimeError, 'expired'):
            self.adapter.execute()
        self.assertEqual(self.calls, [])

    def test_existing_owner_identity_must_continue(self):
        self.observed_owner = owner('original', 55)
        with self.assertRaisesRegex(RuntimeError, 'identity changed'):
            self.adapter.execute()

    def test_incomplete_top_hold_is_failure_without_retry(self):
        def incomplete():
            self.calls.append('movement_a_payload')
            return {'ok': True, 'reachedTopHold': False, 'fault': 'timeout'}
        self.bridge.movement_a_payload = incomplete
        with self.assertRaisesRegex(RuntimeError, 'verified top hold'):
            self.adapter.execute()
        self.assertEqual(self.calls, ['movement_a_payload'])

    def test_unsafe_trusted_path_rejects_shell_interpretation(self):
        self.config['movement_a']['deployment'] = '/home/run/example;bad'
        with self.assertRaises(ValueError):
            self.module.MovementAAdapter(self.config, inspect_owner=lambda: None,
                bridge_module=self.bridge, password_provider=lambda: 'test')


if __name__ == '__main__':
    unittest.main()
