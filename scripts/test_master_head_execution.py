"""Offline coverage of review-to-plan-to-SDK native standing head execution."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch
import json
import tempfile

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


compiler = load('head_compiler', 'compile-robot-plan.py')
runner = load('head_runner', 'trusted-master-runner.py')


def completed_head(name='turn_head'):
    return dict(dry_run=False, operation=name, posture='stand',
        phase='head-sequence-complete', live_enabled=True,
        measured_endpoint_verified=True, native_ownership_verified_before_and_after=True,
        native_balance_retained=True, mode_changes=False, direct_hal_commands=False,
        other_joint_targets_unchanged=True, other_joint_gains_unchanged=True,
        head_mapping_qualification_required=False)


class HeadContractTests(unittest.TestCase):
    def test_shake_positionals_and_keywords_compile_with_whole_cycles(self):
        from master_gateway_spec import validate_master_plan
        for source, args in [('Agentech.shake_head()', {}),
                ('Agentech.shake_head(5, 2)', {'angle_degrees': 5, 'cycles': 2}),
                ('Agentech.shake_head(5, 2.0)', {'angle_degrees': 5, 'cycles': 2.0}),
                ('Agentech.shake_head(-20, 10)', {'angle_degrees': -20, 'cycles': 10}),
                ('Agentech.shake_head(angle_degrees=20, cycles=1)', {'angle_degrees': 20, 'cycles': 1})]:
            with self.subTest(source=source):
                plan = compiler.compile_plan(source, 'shake-sub', 'master')
                self.assertEqual(plan['commands'][0]['args'], args)
                validate_master_plan(plan['commands'])

    def test_shake_rejects_invalid_cycles_zero_angles_and_lowercase_roots(self):
        from master_gateway_spec import validate_master_command
        for args in [{'angle_degrees': 0}, {'angle_degrees': 21}, {'angle_degrees': True},
                     {'cycles': 0}, {'cycles': 11}, {'cycles': 1.5}, {'cycles': True},
                     {'cycles': None}, {'cycles': float('inf')}, {'cycles': '2'},
                     {'posture': 'sit'}, {'cycle': 2}, {'angle': 5}]:
            with self.subTest(args=args), self.assertRaises(ValueError):
                validate_master_command('shake_head', args)
        for source in ['agentech.turn_head()', 'agentech.shake_head(5, 2)',
                       'from agentech import Agentech as agentech\nagentech.shake_head(5, 2)',
                       'Agentech.shake_head(angle, cycle)', 'Agentech.shake_head(5, 1, 2)',
                       'Agentech.shake_head(5, 2, cycles=3)']:
            with self.subTest(source=source), self.assertRaises(ValueError):
                compiler.compile_plan(source, 'shake-sub', 'master')

    def test_head_turn_requires_fresh_explicit_entry_before_later_arm_adjustments(self):
        program = ('Agentech.enter_stand_hand_guide("both")\nAgentech.turn_head()\n'
                   'Agentech.adjust_both_elbows(5)')
        with self.assertRaisesRegex(ValueError, 'before adjustment'):
            compiler.compile_plan(program, 'head-sub', 'master')

    def test_default_positionals_and_keywords_compile_without_raw_entry(self):
        from master_gateway_spec import validate_master_plan
        for source, args in [('Agentech.turn_head()', {}),
                             ('Agentech.turn_head(20)', {'angle_degrees': 20}),
                             ('Agentech.turn_head(-20)', {'angle_degrees': -20}),
                             ('Agentech.turn_head(angle_degrees=0, posture="stand")',
                              {'angle_degrees': 0, 'posture': 'stand'})]:
            with self.subTest(source=source):
                plan = compiler.compile_plan('from agentech import Agentech\n' + source, 'head-sub', 'master')
                self.assertEqual(plan['commands'][0]['name'], 'turn_head')
                self.assertEqual(plan['commands'][0]['args'], args)
                validate_master_plan(plan['commands'])

    def test_invalid_angles_options_expressions_and_nonstanding_posture_are_refused(self):
        from master_gateway_spec import validate_master_command, validate_master_plan
        for args in [{'angle_degrees': 20.01}, {'angle_degrees': -20.01},
                     {'angle_degrees': True}, {'angle_degrees': float('nan')},
                     {'angle_degrees': float('inf')}, {'angle_degrees': None},
                     {'posture': 'sit'}, {'operator_holding': True}, {'speed': 10}]:
            with self.subTest(args=args), self.assertRaises(ValueError):
                validate_master_command('turn_head', args)
            with self.subTest(plan=args), self.assertRaises(ValueError):
                validate_master_plan([{'name': 'turn_head', 'args': args}])
        for source in ['Agentech.turn_head(value)', 'Agentech.turn_head(10 + 5)',
                       'Agentech.turn_head(1, 2)', 'Agentech.turn_head(1, angle_degrees=2)']:
            with self.subTest(source=source), self.assertRaises(ValueError):
                compiler.compile_plan(source, 'head-sub', 'master')


class HeadAdapterTests(unittest.TestCase):
    def adapter(self):
        adapter = runner.SDKAdapter.__new__(runner.SDKAdapter)
        adapter.config = {}
        adapter.planner = Mock()
        adapter.robot = Mock()
        adapter.native_ready = Mock(return_value={'ownerMode': 'native-standing'})
        adapter.prepare_mode = Mock()
        adapter._owner_factory = Mock()
        adapter.admission_check = Mock()
        adapter.binding = None
        return adapter

    def test_missing_controller_approval_fails_before_robot_observation(self):
        adapter = self.adapter()
        with tempfile.TemporaryDirectory() as temp:
            sdk = Mock()
            sdk._head_controller_approval_path.return_value = Path(temp) / 'head-controller.json'
            with patch.dict(sys.modules, {'agentech.robots.master.standing_head_control': sdk}):
                with self.assertRaisesRegex(RuntimeError, 'head-controller.json'):
                    adapter.verify_head_contract()
        adapter.robot._standing_head_control.assert_not_called()
        adapter.native_ready.assert_not_called()

    def test_head_contract_uses_fresh_sdk_identity_mapping_and_ownership_without_motion(self):
        adapter = self.adapter()
        control = adapter.robot._standing_head_control.return_value
        with tempfile.TemporaryDirectory() as temp:
            approval_path = Path(temp) / 'head-controller.json'
            approval_path.write_text(json.dumps({'readOnlyApproved': True, 'controllerHost': '10.0.200.40',
                'robotSerial': 'approved-test-serial', 'sha256Fingerprint': 'SHA256:test'}))
            sdk = Mock()
            sdk._head_controller_approval_path.return_value = approval_path
            with patch.dict(sys.modules, {'agentech.robots.master.standing_head_control': sdk}):
                control.mapping_reader.side_effect = RuntimeError('Approved native head controller SSH key changed')
                with self.assertRaisesRegex(RuntimeError, 'SSH key changed'):
                    adapter.verify_head_contract()
                control._identity.assert_not_called()
                control.mapping_reader.side_effect = None
                adapter.verify_head_contract()
        self.assertEqual(control.reader.call_count, 2)
        self.assertEqual(control.mapping_reader.call_count, 2)
        control.mapping_reader.assert_called_with(control.reader.return_value)
        control.mapping_reader.return_value.require_qualified.assert_called_once()
        control._identity.assert_called_once_with(control.reader.return_value)
        control.execute.assert_not_called()
        adapter.robot.turn_head.assert_not_called()
        adapter.robot.shake_head.assert_not_called()

    def test_dry_validation_and_live_dispatch_select_standing_and_default_five_degrees(self):
        adapter = self.adapter()
        adapter.validate([{'name': 'turn_head', 'args': {}}])
        adapter.planner.turn_head.assert_called_once_with(angle_degrees=5, posture='stand')
        adapter.robot.turn_head.assert_not_called()
        adapter.native_ready.assert_not_called()
        adapter.preflight_mode([{'name': 'turn_head', 'args': {}}])
        adapter.native_ready.assert_called_once_with(require_presets=False)
        adapter.native_ready.reset_mock()
        adapter.execute('turn_head', {'angle_degrees': -20})
        adapter.robot.turn_head.assert_called_once_with(angle_degrees=-20, posture='stand')
        adapter.native_ready.assert_called_once_with(require_presets=False)
        adapter.prepare_mode.assert_not_called()
        adapter._owner_factory.assert_not_called()
        adapter.robot.enter_stand_hand_guide.assert_not_called()
        adapter.admission_check.assert_called()

    def test_missing_readiness_or_sdk_support_refuses_dispatch(self):
        adapter = self.adapter()
        adapter.native_ready.side_effect = RuntimeError('native ownership unavailable')
        with self.assertRaisesRegex(RuntimeError, 'native ownership'):
            adapter.execute('turn_head', {})
        adapter.robot.turn_head.assert_not_called()
        adapter.planner.turn_head = None
        with self.assertRaisesRegex(ValueError, 'no turn_head'):
            adapter.validate([{'name': 'turn_head', 'args': {}}])

    def test_shake_dispatch_binds_angle_cycles_and_standing_without_raw_control(self):
        adapter = self.adapter()
        adapter.validate([{'name': 'shake_head', 'args': {}}])
        adapter.planner.shake_head.assert_called_once_with(angle_degrees=5, cycles=1, posture='stand')
        adapter.execute('shake_head', {'angle_degrees': -20, 'cycles': 2.0})
        adapter.robot.shake_head.assert_called_once_with(angle_degrees=-20, cycles=2, posture='stand')
        self.assertIs(type(adapter.robot.shake_head.call_args.kwargs['cycles']), int)
        adapter.prepare_mode.assert_not_called()
        adapter._owner_factory.assert_not_called()
        adapter.planner.shake_head = None
        with self.assertRaisesRegex(ValueError, 'no shake_head'):
            adapter.validate([{'name': 'shake_head', 'args': {}}])

    def test_shake_completion_requires_matching_operation_and_measured_center_return(self):
        result = {**completed_head('shake_head'), 'exact_center_return': True}
        runner.require_completed('shake_head', result)
        for key in result:
            with self.subTest(missing=key), self.assertRaises(RuntimeError):
                runner.require_completed('shake_head', {k: v for k, v in result.items() if k != key})
        with self.assertRaises(RuntimeError):
            runner.require_completed('shake_head', completed_head())

    def test_completion_requires_measured_native_standing_evidence(self):
        result = completed_head()
        runner.require_completed('turn_head', result)
        for key in result:
            with self.subTest(missing=key), self.assertRaises(RuntimeError):
                runner.require_completed('turn_head', {k: v for k, v in result.items() if k != key})
        for changes in [{'dry_run': True}, {'posture': 'sit'}, {'phase': 'accepted'},
                        {'measured_endpoint_verified': False}, {'mode_changes': True},
                        {'other_joint_targets_unchanged': False}, {'fault': 'tracking'}]:
            with self.subTest(changes=changes), self.assertRaises(RuntimeError):
                runner.require_completed('turn_head', {**result, **changes})


if __name__ == '__main__':
    unittest.main()
