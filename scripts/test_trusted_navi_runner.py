from __future__ import annotations

import importlib.util
import json
import copy
import io
from contextlib import redirect_stdout, nullcontext
import sys
import tempfile
from types import SimpleNamespace
import unittest
from pathlib import Path
from unittest.mock import patch
from datetime import datetime, timezone, timedelta


RUNNER_PATH = Path(__file__).with_name("trusted-navi-runner.py")
sys.path.insert(0, str(RUNNER_PATH.parent))
SPEC = importlib.util.spec_from_file_location("trusted_navi_runner", RUNNER_PATH)
assert SPEC and SPEC.loader
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class FakeAgentech:
    def __init__(self, failures: dict[str, BaseException] | None = None) -> None:
        self.calls: list[str] = []
        self.failures = failures or {}

    def __getattr__(self, name: str):
        def call(**_arguments):
            self.calls.append(name)
            error = self.failures.get(name)
            if error:
                raise error

        return call


class FakeCleanupAgentech(FakeAgentech):
    def __init__(self, failures=None):
        super().__init__(failures)
        self.state = {'boot_finish': True, 'robot_ready': True, 'standing': True,
                      'action': 3, 'error': 0, 'warning': 0, 'estop': 0}
        self.body = {'z': .235, 'yaw': .185, 'roll': .01, 'pitch': -.01,
                     'vx': 0., 'vy': 0., 'wz': 0.}
        self.result = {'succeeded': True, 'damping_completed': True,
                       'terminal_state': 'lowered_damped', 'run_id': 'test-calibrated-boot',
                       'elapsed_s': 14.2, 'position_error_m': .025,
                       'final_heading_error_deg': 1.2,
                       'final_state': {**self.state, 'standing': False, 'action': 0, 'estop': 1},
                       'final_body_status': {**self.body, 'z': .08}}
        self.return_arguments = []
        self.battery = {'percent': 55., 'present': True, 'power_supply_status': 2,
                        'voltage': 23.5, 'current': -1.2}

    def get_battery_status(self):
        self.calls.append('get_battery_status')
        return copy.deepcopy(self.battery)

    def status(self):
        self.calls.append('status')
        return copy.deepcopy(self.state)

    def body_status(self):
        self.calls.append('body_status')
        return copy.deepcopy(self.body)

    def stand(self):
        self.calls.append('stand')
        self.state.update(standing=True, action=3, estop=0)
        self.body['z'] = .235

    def stop(self):
        self.calls.append('stop')
        if 'stop' in self.failures:
            raise self.failures['stop']
        self.body.update(vx=0., vy=0., wz=0.)
        if self.state['standing']:
            self.state['action'] = 3

    def damping(self):
        self.calls.append('damping')
        self.state.update(standing=False, action=0, estop=1)
        self.body['z'] = .08

    def return_to_home(self, **kwargs):
        self.calls.append('return_to_home')
        self.return_arguments.append(kwargs)
        if 'return_to_home' in self.failures:
            raise self.failures['return_to_home']
        self.state = copy.deepcopy(self.result['final_state'])
        self.body = copy.deepcopy(self.result['final_body_status'])
        return copy.deepcopy(self.result)


def motions(agentech):
    return [call for call in agentech.calls if call not in ('status', 'body_status', 'get_battery_status')]


def write_plan(commands: list[str]) -> str:
    directory = tempfile.mkdtemp(prefix="agentech-navi-runner-")
    path = Path(directory, "plan.json")
    path.write_text(
        json.dumps({
            "version": 2,
            "robot_model": "navi",
            "commands": [{"name": name, "args": {}} for name in commands],
        }),
        encoding="utf-8",
    )
    return str(path)


class TrustedNaviRunnerTests(unittest.TestCase):
    def test_hidden_child_explicitly_forwards_supervisor_logs_without_stdin_or_window(self):
        with patch.object(runner.subprocess,'Popen') as start:
            runner._hidden_child(['--cleanup-attempt','plan','result','attempt'])
        _args, options=start.call_args
        self.assertEqual(options.get('stdin'),runner.subprocess.DEVNULL)
        self.assertIs(options.get('stdout'),runner.sys.stdout)
        self.assertIs(options.get('stderr'),runner.sys.stderr)
        self.assertEqual(options['creationflags'],
                         runner.subprocess.CREATE_NO_WINDOW if runner.os.name=='nt' else 0)

    def test_offline_supervisor_real_child_expiry_writes_one_verified_durable_receipt(self):
        # Only an isolated sleeping Python child is real. All SDK IO is fake,
        # and owner/receipt/lock files live in the test's temporary directory.
        agentech=FakeCleanupAgentech()
        with tempfile.TemporaryDirectory(prefix='navi-supervisor-test-') as directory:
            result=str(Path(directory,'result.json')); owner=str(Path(directory,'owner.json'))
            end=(datetime.now(timezone.utc)+timedelta(seconds=.2)).isoformat()
            child=None
            def start(_arguments):
                nonlocal child
                child=runner.subprocess.Popen([sys.executable,'-c','import time; time.sleep(10)'])
                return child
            def cleanup(plan,result_path,owner_path,attempt_id,metadata):
                self.assertIsNotNone(child.poll(),'program owner must exit before SDK cleanup')
                runner.run_cleanup_attempt(plan,result_path,attempt_id)
                metadata['phase']='finished'
                runner._atomic_json(owner_path,metadata)
            with patch.object(runner,'load_plan',return_value=[{'name':'get_battery_status','args':{}}]), \
                 patch.object(runner,'_hidden_child',side_effect=start), \
                 patch.object(runner,'_run_cleanup_child',side_effect=cleanup), \
                 patch.object(runner,'configure_navi',return_value=agentech), \
                 patch.object(runner,'verify_home_binding',return_value='test-calibrated-boot'), \
                 patch.dict('os.environ',{'AGENTECH_NAVI_OWNER_LOCK':str(Path(directory,'owner.lock'))}):
                try: runner.supervise_booked_session('inert-plan',end,result,owner,'test-attempt')
                finally:
                    if child is not None and child.poll() is None:
                        child.kill(); child.wait(timeout=5)
            outcome=json.loads(Path(result).read_text())
            self.assertEqual(outcome['outcome'],'verified')
            self.assertEqual(outcome['attempt_id'],'test-attempt')
            self.assertIs(outcome['result']['ready_for_next_user'],True)
            self.assertEqual(motions(agentech),['stop','return_to_home'])

    def test_os_owner_lock_refuses_overlapping_sdk_owner_and_releases_after_exit(self):
        owner=getattr(runner,'navi_owner',None)
        self.assertTrue(callable(owner),'missing exclusive SDK ownership lock')
        with tempfile.TemporaryDirectory(prefix='navi-owner-test-') as directory, \
             patch.dict('os.environ',{'AGENTECH_NAVI_OWNER_LOCK':str(Path(directory,'owner.lock'))}):
            with owner():
                with self.assertRaisesRegex(RuntimeError,'owner'):
                    with owner(): self.fail('overlapping owner acquired')
            with owner(): pass

    def test_cleanup_attempt_writes_only_verified_outcome_and_preserves_failure(self):
        attempt=getattr(runner,'run_cleanup_attempt',None)
        self.assertTrue(callable(attempt),'missing durable cleanup outcome')
        records=[]
        with patch.object(runner,'navi_owner',return_value=nullcontext()), \
             patch.object(runner,'_atomic_json',side_effect=lambda _path,value:records.append(value)), \
             patch.object(runner,'end_session_cleanup',side_effect=RuntimeError('original failure')):
            with self.assertRaisesRegex(RuntimeError,'original failure'):
                attempt('plan','outcome','attempt')
        self.assertEqual(records[-1]['outcome'],'failed')
        self.assertEqual(records[-1]['attempt_id'],'attempt')
        self.assertNotIn('result',records[-1])

    def test_cleanup_failure_is_not_masked_by_durable_outcome_write_failure(self):
        original=RuntimeError('original return failure')
        with patch.object(runner,'navi_owner',return_value=nullcontext()), \
             patch.object(runner,'end_session_cleanup',side_effect=original), \
             patch.object(runner,'_atomic_json',side_effect=OSError('disk full')):
            with self.assertRaisesRegex(RuntimeError,'original return failure'):
                runner.run_cleanup_attempt('plan','outcome','attempt')

    def test_supervisor_refuses_cleanup_until_terminated_program_is_verified_dead(self):
        supervise=getattr(runner,'supervise_booked_session',None)
        self.assertTrue(callable(supervise),'missing deadline supervisor')
        child=SimpleNamespace(pid=123,wait=lambda timeout:(_ for _ in ()).throw(runner.subprocess.TimeoutExpired('plan',timeout)),poll=lambda:None)
        with patch.object(runner,'load_plan',return_value=[{'name':'forward','args':{}}]), \
             patch.object(runner.subprocess,'Popen',return_value=child), \
             patch.object(runner,'_atomic_json'), patch.object(runner,'_terminate_plan_child'), \
             patch.object(runner.time,'time',return_value=1000), \
             patch.object(runner,'_run_cleanup_child') as cleanup:
            with self.assertRaisesRegex(RuntimeError,'did not exit'):
                supervise('plan','1970-01-01T00:16:41Z','outcome','owner','attempt')
        cleanup.assert_not_called()

    def test_booked_supervisor_terminates_then_verifies_plan_child_before_cleanup(self):
        supervise = getattr(runner, 'supervise_booked_session', None)
        self.assertTrue(callable(supervise), 'missing independent booked-deadline supervisor')
        events=[]
        class Child:
            pid=123
            def wait(self, timeout=None):
                events.append(('wait',timeout))
                if len(events)==1:
                    raise runner.subprocess.TimeoutExpired('plan',timeout)
                return 1
            def poll(self): return None
        child=Child()
        with patch.object(runner,'load_plan',return_value=[{'name':'forward','args':{}}]), \
             patch.object(runner.subprocess,'Popen',return_value=child), \
             patch.object(runner,'_terminate_plan_child',side_effect=lambda proc:events.append('terminate')), \
             patch.object(runner,'_atomic_json',side_effect=lambda *_args:None), \
             patch.object(runner,'_run_cleanup_child',side_effect=lambda *_args:events.append('cleanup')), \
             patch.object(runner.time,'time',side_effect=[1000,1001]):
            supervise('plan','1970-01-01T00:16:41Z','outcome','owner','attempt')
        self.assertEqual(events,[('wait',1),'terminate',('wait',5),'cleanup'])

    def test_booked_supervisor_early_finish_waits_for_booking_not_program_duration(self):
        supervise=getattr(runner,'supervise_booked_session',None)
        self.assertTrue(callable(supervise), 'missing independent booked-deadline supervisor')
        events=[]
        child=SimpleNamespace(pid=123,wait=lambda timeout:events.append(('plan',timeout)),poll=lambda:0)
        with patch.object(runner,'load_plan',return_value=[{'name':'forward','args':{}}]), \
             patch.object(runner.subprocess,'Popen',return_value=child), \
             patch.object(runner,'_atomic_json',side_effect=lambda *_args:None), \
             patch.object(runner,'_run_cleanup_child',side_effect=lambda *_args:events.append('cleanup')), \
             patch.object(runner.time,'time',side_effect=[1000,1000,1001]), \
             patch.object(runner.time,'sleep',side_effect=lambda delay:events.append(('sleep',delay))):
            supervise('plan','1970-01-01T00:16:41Z','outcome','owner','attempt')
        self.assertEqual(events,[('plan',1),('sleep',1),'cleanup'])

    def test_admission_requires_prior_verified_reset_same_boot(self):
        agentech = FakeCleanupAgentech()
        agentech.state.update(action=0, standing=False, estop=1)
        agentech.body['z'] = .08
        with patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(runner, 'verify_home_binding', return_value='current-boot'), \
             patch.dict('os.environ', {'AGENTECH_NAVI_EXPECTED_RESET_RUN_ID':'previous-boot'}):
            with self.assertRaisesRegex(RuntimeError, 'reset.*boot'):
                runner.check_home_ready()
        self.assertEqual(motions(agentech), [])

    def test_configuration_requires_explicit_existing_sdk_deployment_before_import(self):
        fake = SimpleNamespace(Agentech=SimpleNamespace(use=lambda *_args, **_kwargs: None))
        for root in ('', 'relative-sdk', str(Path(tempfile.gettempdir())/'missing-navi-deployment')):
            with patch.dict('os.environ', {'AGENTECH_SDK_ROOT': root}), \
                 patch.dict(sys.modules, {'agentech': fake}):
                with self.assertRaisesRegex(ValueError, 'AGENTECH_SDK_ROOT'):
                    runner.configure_navi()

    def test_charging_or_unknown_battery_blocks_cleanup_and_ready_without_motion(self):
        for change in [{'power_supply_status': 1, 'current': 1.824}, {'power_supply_status': 0},
                       {'power_supply_status': None}, {'present': False}, {'percent': float('nan')},
                       {'percent': True}, {'percent': 101.}, {'current': float('inf')}]:
            for operation in ('cleanup', 'ready'):
                agentech = FakeCleanupAgentech()
                agentech.state.update(standing=False, action=0, estop=1)
                agentech.body['z'] = .08
                agentech.battery.update(change)
                with patch.object(runner, 'configure_navi', return_value=agentech), \
                     patch.object(runner, 'verify_home_binding', return_value='test-calibrated-boot'), \
                     redirect_stdout(io.StringIO()) as output:
                    with self.assertRaises((RuntimeError, ValueError)):
                        if operation == 'cleanup':
                            runner.end_session_cleanup(return_home=True)
                        else:
                            runner.check_home_ready()
                self.assertEqual(motions(agentech), [])
                self.assertNotIn('cleanup-result ', output.getvalue())

    def test_return_to_home_executes_as_a_premium_approved_command(self) -> None:
        agentech = FakeAgentech()
        directory = tempfile.mkdtemp(prefix="agentech-navi-runner-")
        path = Path(directory, "plan.json")
        path.write_text(
            json.dumps({
                "version": 2,
                "robot_model": "navi",
                "commands": [{"name": "return_to_home", "args": {"facing_angle_deg": 90}}],
            }),
            encoding="utf-8",
        )

        with patch.object(runner, "configure_navi", return_value=agentech):
            runner.execute(str(path))

        self.assertEqual(agentech.calls, ["return_to_home", "stop"])

    def test_end_session_uses_original_return_receipt_without_duplicate_damp_or_stop(self) -> None:
        agentech = FakeCleanupAgentech()
        output = io.StringIO()
        with patch.object(runner, "configure_navi", return_value=agentech), \
             patch.object(runner, "verify_home_binding", return_value='test-calibrated-boot', create=True), \
             redirect_stdout(output):
            runner.end_session_cleanup(return_home=True)
        self.assertEqual(motions(agentech), ['return_to_home'])
        self.assertEqual(agentech.return_arguments, [{}])
        receipts = [line for line in output.getvalue().splitlines()
                    if line.startswith('[navi-runner] cleanup-result ')]
        self.assertEqual(len(receipts), 1)
        receipt = json.loads(receipts[0].split('cleanup-result ', 1)[1])
        self.assertIs(receipt['ready_for_next_user'], True)
        self.assertEqual(receipt['terminal_state'], 'lowered_damped')
        self.assertEqual(receipt['run_id'], 'test-calibrated-boot')
        self.assertEqual(receipt['position_error_m'], .025)

    def test_end_session_skips_duplicate_return_but_still_damps(self) -> None:
        agentech = FakeCleanupAgentech()

        with patch.object(runner, "configure_navi", return_value=agentech):
            runner.end_session_cleanup(return_home=False)

        self.assertEqual(motions(agentech), ["damping"])

    def test_end_session_does_not_damp_before_return_home_finishes(self) -> None:
        agentech = FakeCleanupAgentech({"return_to_home": RuntimeError("camera unavailable")})

        with patch.object(runner, "configure_navi", return_value=agentech), \
             patch.object(runner, "verify_home_binding", return_value='test-calibrated-boot', create=True):
            with self.assertRaisesRegex(RuntimeError, "camera unavailable"):
                runner.end_session_cleanup(return_home=True)

        self.assertEqual(motions(agentech), ["return_to_home", "stop"])

    def test_recognized_low_postures_stand_once_before_return(self):
        for action, estop in [(0, 1), (0, 0), (2, 0)]:
            agentech = FakeCleanupAgentech()
            agentech.state.update(standing=False, action=action, estop=estop)
            agentech.body['z'] = .08
            with patch.object(runner, 'configure_navi', return_value=agentech), \
                 patch.object(runner, 'verify_home_binding', return_value='test-calibrated-boot', create=True):
                runner.end_session_cleanup(return_home=True)
            self.assertEqual(motions(agentech), ['stand', 'return_to_home'])

    def test_fault_unknown_fallen_or_estop_refuses_stand_and_return(self):
        for state, body in [({'warning': 1}, {}), ({'error': 1}, {}), ({'estop': 1}, {}),
                            ({'action': 99}, {}), ({'standing': False, 'action': 2, 'estop': 1}, {'z': .08}),
                            ({'standing': False, 'action': 0}, {'z': .08, 'roll': .8}),
                            ({}, {'z': float('nan')}), ({'boot_finish': None}, {})]:
            agentech = FakeCleanupAgentech()
            agentech.state.update(state); agentech.body.update(body)
            with patch.object(runner, 'configure_navi', return_value=agentech), \
                 patch.object(runner, 'verify_home_binding', return_value='test-calibrated-boot', create=True):
                with self.assertRaises((RuntimeError, ValueError)):
                    runner.end_session_cleanup(return_home=True)
            self.assertEqual(motions(agentech), ['stop'])

    def test_active_gait_stops_then_freshly_verifies_before_return(self):
        agentech = FakeCleanupAgentech()
        agentech.state['action'] = 4
        agentech.body['vx'] = .2
        with patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(runner, 'verify_home_binding', return_value='test-calibrated-boot', create=True):
            runner.end_session_cleanup(return_home=True)
        self.assertEqual(motions(agentech), ['stop', 'return_to_home'])

    def test_bad_receipt_never_marks_ready_and_stops_without_damping(self):
        for field, value in [('succeeded', False), ('damping_completed', False),
                             ('terminal_state', 'standing'), ('position_error_m', .061),
                             ('final_heading_error_deg', 4.01), ('elapsed_s', float('nan')),
                             ('run_id', 'another-boot')]:
            agentech = FakeCleanupAgentech(); agentech.result[field] = value
            with patch.object(runner, 'configure_navi', return_value=agentech), \
                 patch.object(runner, 'verify_home_binding', return_value='test-calibrated-boot', create=True), \
                 redirect_stdout(io.StringIO()) as output:
                with self.assertRaises((RuntimeError, ValueError)):
                    runner.end_session_cleanup(return_home=True)
            self.assertEqual(motions(agentech), ['return_to_home', 'stop'])
            self.assertNotIn('cleanup-result ', output.getvalue())

    def test_return_failure_is_preserved_when_best_effort_stop_also_fails(self):
        agentech = FakeCleanupAgentech({'return_to_home': RuntimeError('original failure'),
                                        'stop': RuntimeError('stop failure')})
        with patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(runner, 'verify_home_binding', return_value='test-calibrated-boot', create=True):
            with self.assertRaisesRegex(RuntimeError, 'original failure'):
                runner.end_session_cleanup(return_home=True)
        self.assertEqual(motions(agentech), ['return_to_home', 'stop'])

    def test_session_emergency_stop_intent_blocks_reset_before_configuration(self):
        plan = write_plan(['emergency_stop'])
        with patch.object(runner, 'configure_navi') as configure:
            with self.assertRaisesRegex((RuntimeError, ValueError), 'emergency_stop'):
                runner.end_session_cleanup(return_home=True, session_plan=plan)
        configure.assert_not_called()

    def test_stand_must_verify_healthy_bounded_height_before_return(self):
        agentech = FakeCleanupAgentech()
        agentech.state.update(standing=False, action=0, estop=1)
        agentech.body['z'] = .08
        def incomplete_stand():
            agentech.calls.append('stand')
            agentech.state.update(standing=True, action=3, estop=0)
            # The body never reaches the calibrated standing height.
        agentech.stand = incomplete_stand
        with patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(runner, 'verify_home_binding', return_value='test-calibrated-boot'):
            with self.assertRaises(RuntimeError):
                runner.end_session_cleanup(return_home=True)
        self.assertEqual(motions(agentech), ['stand', 'stop'])

    def test_terminal_result_requires_low_fault_free_actual_state_and_body(self):
        for field, value in [('action', 3), ('warning', 1), ('standing', True), ('estop', 2)]:
            agentech = FakeCleanupAgentech(); agentech.result['final_state'][field] = value
            with patch.object(runner, 'configure_navi', return_value=agentech), \
                 patch.object(runner, 'verify_home_binding', return_value='test-calibrated-boot'):
                with self.assertRaises(RuntimeError):
                    runner.end_session_cleanup(return_home=True)
            self.assertEqual(motions(agentech), ['return_to_home', 'stop'])

    def test_receipt_omits_transport_fields(self):
        agentech = FakeCleanupAgentech()
        agentech.result['final_state'].update(host='private-address', port=9090)
        output = io.StringIO()
        with patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(runner, 'verify_home_binding', return_value='test-calibrated-boot'), redirect_stdout(output):
            runner.end_session_cleanup(return_home=True)
        self.assertNotIn('private-address', output.getvalue())
        self.assertNotIn('9090', output.getvalue())

    def test_check_home_ready_is_read_only_and_requires_damped_posture(self):
        agentech = FakeCleanupAgentech()
        agentech.state.update(action=0, standing=False, estop=1)
        agentech.body['z'] = .08
        with patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(runner, 'verify_home_binding', return_value='test-calibrated-boot'), \
              patch.dict('os.environ',{'AGENTECH_NAVI_EXPECTED_RESET_RUN_ID':'test-calibrated-boot'}), \
              patch.object(runner,'navi_owner',return_value=nullcontext()), \
             patch.object(sys, 'argv', ['trusted-navi-runner.py', '--check-home-ready']):
            runner.main()
        self.assertEqual(motions(agentech), [])
        agentech.state['action'] = 2
        agentech.state['estop'] = 0
        with patch.object(runner, 'configure_navi', return_value=agentech):
            with self.assertRaises(RuntimeError):
                runner.check_home_ready()
        self.assertEqual(motions(agentech), [])

    def test_home_binding_refuses_disabled_legacy_or_other_boot(self):
        valid = {'schema_version': 2, 'mode': 'cell_return_to_home', 'motion_enabled': True,
                 'motion': {'enabled': True, 'run_id': 'calibration-boot'}}
        for mutate, live in [({}, 'other-boot'), ({'schema_version': 1}, 'calibration-boot'),
                             ({'motion_enabled': False}, 'calibration-boot'),
                             ({'motion': {'enabled': False, 'run_id': 'calibration-boot'}}, 'calibration-boot')]:
            config = copy.deepcopy(valid); config.update(mutate)
            with patch.object(runner, '_load_home_calibration', return_value=config), \
                 patch.object(runner, '_current_run_id', return_value=live):
                with self.assertRaises(RuntimeError):
                    runner.verify_home_binding(FakeCleanupAgentech())
        with patch.object(runner, '_load_home_calibration', return_value=valid), \
             patch.object(runner, '_current_run_id', return_value='calibration-boot'):
            self.assertEqual(runner.verify_home_binding(FakeCleanupAgentech()), 'calibration-boot')

    def test_optional_session_plan_cli_is_validated_without_customer_execution(self):
        plan = write_plan(['emergency_stop'])
        with patch.object(sys, 'argv', ['trusted-navi-runner.py', '--return-home-and-damp', '--session-plan', plan]), \
              patch.object(runner,'navi_owner',return_value=nullcontext()), \
             patch.object(runner, 'configure_navi') as configure:
            with self.assertRaisesRegex(RuntimeError, 'emergency_stop'):
                runner.main()
        configure.assert_not_called()

    def test_yaw_turn_convergence_timeout_stops_then_continues(self) -> None:
        agentech = FakeAgentech({
            "u_turn": TimeoutError("Navi yaw-feedback turn timed out at 135.45 degrees")
        })
        plan = write_plan(["u_turn", "pee", "turn_right", "lie_down"])

        with patch.object(runner, "configure_navi", return_value=agentech):
            runner.execute(plan)

        self.assertEqual(
            agentech.calls,
            ["u_turn", "stop", "pee", "turn_right", "lie_down", "stop"],
        )

    def test_unrelated_timeout_still_aborts_the_plan(self) -> None:
        agentech = FakeAgentech({
            "u_turn": TimeoutError("Navi body_status yaw timed out before the turn")
        })
        plan = write_plan(["u_turn", "pee"])

        with patch.object(runner, "configure_navi", return_value=agentech):
            with self.assertRaisesRegex(TimeoutError, "body_status yaw"):
                runner.execute(plan)

        self.assertEqual(agentech.calls, ["u_turn", "stop"])

    def test_non_turn_timeout_still_aborts_the_plan(self) -> None:
        agentech = FakeAgentech({
            "pee": TimeoutError("Navi yaw-feedback turn timed out at 20 degrees")
        })
        plan = write_plan(["pee", "lie_down"])

        with patch.object(runner, "configure_navi", return_value=agentech):
            with self.assertRaisesRegex(TimeoutError, "yaw-feedback turn"):
                runner.execute(plan)

        self.assertEqual(agentech.calls, ["pee", "stop"])


if __name__ == "__main__":
    unittest.main()
