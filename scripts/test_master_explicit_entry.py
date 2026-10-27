import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
from master_gateway_spec import validate_master_plan

spec = importlib.util.spec_from_file_location('explicit_entry_runner', SCRIPTS / 'trusted-master-runner.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

ENTRY = {'name': 'enter_stand_hand_guide', 'args': {'side': 'both'}}
ADJUST = {'name': 'adjust_right_elbow', 'args': {'degrees': 45}}


class ExplicitEntryTests(unittest.TestCase):
    def test_missing_or_late_entry_rejects_whole_plan(self):
        for commands in ([ADJUST], [ADJUST, ENTRY]):
            with self.subTest(commands=commands), self.assertRaisesRegex(ValueError, 'enter_stand_hand_guide'):
                validate_master_plan(commands)

    def test_entry_admits_adjustments_until_explicit_mode_change(self):
        validate_master_plan([ENTRY, ADJUST, ADJUST])
        for transition in ('restore_stand_hand_guide', 'restore_stand_default', 'release_returned_hold', 'movement_a'):
            with self.subTest(transition=transition), self.assertRaisesRegex(ValueError, 'enter_stand_hand_guide'):
                validate_master_plan([ENTRY, {'name': transition, 'args': {}}, ADJUST])
        validate_master_plan([ENTRY, {'name': 'restore_stand_hand_guide', 'args': {}}, ENTRY, ADJUST])

    def test_dispatch_does_not_bootstrap_for_implicit_adjustment(self):
        adapter = runner.SDKAdapter.__new__(runner.SDKAdapter)
        adapter.robot = Mock()
        adapter.prepare_mode = Mock()
        adapter.check_ready = Mock(return_value={'ownerMode': 'current-hold'})
        adapter.binding = None
        with self.assertRaisesRegex(RuntimeError, 'enter_stand_hand_guide'):
            adapter.execute('adjust_right_elbow', {'degrees': 45})
        adapter.prepare_mode.assert_not_called()
        adapter.robot.adjust_right_elbow.assert_not_called()

    def test_initial_readiness_uses_bilateral_contract(self):
        adapter = runner.SDKAdapter.__new__(runner.SDKAdapter)
        adapter.binding = None
        class NotReady(RuntimeError):
            pass
        adapter._owner_not_ready = NotReady
        owner = {'ownerMode': 'current-hold', 'aimdkMcMode': 'STAND_DEFAULT',
                 'requestId': 'owner', 'publisherPid': 42}
        control = Mock()
        def inspect(*, required_sides):
            if required_sides != ('left', 'right'):
                raise NotReady('returnSides must match the bilateral owner')
            return owner
        control.inspect_active_ready.side_effect = inspect
        adapter._owner_factory = Mock(return_value=control)
        adapter.robot = Mock()
        adapter.robot._standing_current_hold_control.return_value = runner.ExistingOwnerControl(control, adapter)
        self.assertEqual(adapter.check_ready()['publisherPid'], 42)
        self.assertEqual(adapter.binding, owner)

    def test_unbound_movement_a_retains_its_right_arm_contract(self):
        adapter = runner.SDKAdapter.__new__(runner.SDKAdapter)
        adapter.binding = None
        class NotReady(RuntimeError):
            pass
        adapter._owner_not_ready = NotReady
        control = Mock()
        control.inspect_active_ready.side_effect = [NotReady('right-only owner'), {'ownerMode': 'movement-a'}]
        adapter._owner_factory = Mock(return_value=control)
        adapter.movement_a_adapter = Mock()
        verified = {'ownerMode': 'movement-a', 'publisherPid': 11}
        adapter.movement_a_adapter.return_value.check_ready.return_value = verified
        self.assertEqual(adapter.check_ready(), verified)

    def test_right_only_raw_owner_cannot_satisfy_bilateral_readiness(self):
        adapter = runner.SDKAdapter.__new__(runner.SDKAdapter)
        adapter.binding = None
        class NotReady(RuntimeError):
            pass
        adapter._owner_not_ready = NotReady
        control = Mock()
        control.inspect_active_ready.side_effect = [NotReady('bilateral required'), {'ownerMode': 'current-hold'}]
        adapter._owner_factory = Mock(return_value=control)
        with self.assertRaisesRegex(NotReady, 'bilateral required'):
            adapter.check_ready()


if __name__ == '__main__':
    unittest.main()
