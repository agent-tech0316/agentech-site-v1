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
    def test_guardian_receipt_or_post_child_metadata_failure_still_waits_and_damps(self):
        for fault in ('program_result', 'owner_metadata'):
            events=[]
            child=SimpleNamespace(pid=123,returncode=0,wait=lambda timeout:events.append('child_exit'))
            def persist(path, value):
                if fault=='owner_metadata' and value.get('phase')=='waiting_for_booked_end':
                    raise OSError('owner disk full')
            def finalize(*_):
                if fault=='program_result': raise OSError('program disk full')
            with patch.object(runner,'_hidden_child',return_value=child), \
                 patch.object(runner,'_atomic_json',side_effect=persist), \
                 patch.object(runner,'_finalize_program',side_effect=finalize), \
                 patch.object(runner,'_run_cleanup_child',side_effect=lambda *_:events.append('damping')), \
                 patch.object(runner.time,'time',side_effect=[1000,1000,1001]), \
                 patch.object(runner.time,'sleep',side_effect=lambda seconds:events.append(('wait_booked',seconds))):
                runner.supervise_booked_session(write_plan(['get_battery_status']),
                    '1970-01-01T00:16:41Z','cleanup','owner','attempt')
            self.assertEqual(events,['child_exit',('wait_booked',1),'damping'],fault)

    def test_cleanup_owner_metadata_failure_does_not_skip_bounded_cleanup_child(self):
        events=[]
        child=SimpleNamespace(pid=456,returncode=0,wait=lambda timeout:events.append(('wait',timeout)))
        with patch.object(runner,'_atomic_json',side_effect=OSError('owner disk full')), \
             patch.object(runner,'_hidden_child',side_effect=lambda _:events.append('cleanup_child') or child):
            runner._run_cleanup_child('plan','cleanup','owner','attempt',{})
        self.assertEqual(events,['cleanup_child',('wait',120)])

    def test_cleanup_keeps_exclusive_sdk_lock_when_owner_metadata_is_unwritable(self):
        agentech=FakeCleanupAgentech()
        entered=runner.threading.Event(); release=runner.threading.Event(); errors=[]
        original_damping=agentech.damping
        def damping():
            entered.set()
            if not release.wait(2): raise RuntimeError('test damping release timed out')
            original_damping()
        agentech.damping=damping
        with tempfile.TemporaryDirectory() as folder:
            owner=Path(folder,'owner.json'); receipt=Path(folder,'cleanup.json')
            atomic=runner._atomic_json
            def persist(path,value):
                if str(path)==str(owner): raise OSError('owner metadata unavailable')
                atomic(path,value)
            def start(_args):
                def run():
                    try: runner.run_cleanup_attempt(write_plan(['get_battery_status']),str(receipt),'attempt')
                    except BaseException as error: errors.append(error)
                thread=runner.threading.Thread(target=run)
                thread.start()
                try:
                    self.assertTrue(entered.wait(2),'fake SDK cleanup did not enter')
                    with self.assertRaisesRegex(RuntimeError,'owner'):
                        with runner.navi_owner(): self.fail('second SDK owner acquired')
                finally:
                    release.set()
                return SimpleNamespace(pid=456,returncode=0,wait=lambda timeout:thread.join(timeout))
            with patch.object(runner,'_atomic_json',side_effect=persist), \
                 patch.object(runner,'_hidden_child',side_effect=start), \
                 patch.object(runner,'configure_navi',return_value=agentech), \
                 patch.dict('os.environ',{'AGENTECH_NAVI_OWNER_LOCK':str(Path(folder,'sdk-owner.lock'))}):
                runner._run_cleanup_child('plan',str(receipt),str(owner),'attempt',{})
            self.assertEqual(errors,[])
            self.assertEqual(json.loads(receipt.read_text())['outcome'],'verified')

    def test_unknown_child_exit_never_starts_cleanup_even_when_result_writer_succeeds(self):
        child=SimpleNamespace(pid=123,returncode=None,wait=lambda timeout:None)
        with patch.object(runner,'_hidden_child',return_value=child), \
             patch.object(runner,'_atomic_json'),patch.object(runner,'_finalize_program'), \
             patch.object(runner,'_run_cleanup_child') as cleanup, \
             patch.object(runner.time,'time',side_effect=[1000,1001]):
            with self.assertRaisesRegex(RuntimeError,'exit'):
                runner.supervise_booked_session(write_plan(['get_battery_status']),
                    '1970-01-01T00:16:41Z','cleanup','owner','attempt')
        cleanup.assert_not_called()

    def test_failed_turn_retains_bounded_exception_trace_and_original_primary_error(self):
        original=RuntimeError('Navi timed turn stalled: no sustained yaw progress')
        original.feedback_trace_tail=[{'elapsed_s':index/10,'measured_angle_rad':.001*index,
            'body_yaw_rad':.1,'measured_wz_rad_s':0.,'command_wz_rad_s':.5} for index in range(24)]
        agentech=FakeAgentech({'u_turn':original,'stop':RuntimeError('secondary stop failed')})
        with tempfile.TemporaryDirectory() as folder, patch.object(runner,'configure_navi',return_value=agentech):
            result_path=Path(folder,'program.json')
            with self.assertRaisesRegex(RuntimeError,'no sustained yaw progress') as raised:
                runner.execute(write_plan(['u_turn','pee']),result_path=str(result_path),attempt_id='attempt')
            result=json.loads(result_path.read_text())
        self.assertIs(raised.exception,original)
        self.assertEqual(result['error']['message'],str(original))
        self.assertEqual(result['cleanup_error']['message'],'secondary stop failed')
        trace=(result['commands'][0]['result'] or {}).get('feedback_trace_tail',[])
        self.assertEqual(len(trace),6)
        self.assertEqual(trace[-1]['elapsed_s'],2.3)
        self.assertLessEqual(len(json.dumps(result['commands'][0]['result']).encode()),1536)
        self.assertNotIn('pee',agentech.calls)

    def test_failed_promotion_retries_failed_receipt_without_overwriting_sdk_error(self):
        with tempfile.TemporaryDirectory() as folder:
            plan=write_plan(['u_turn']); child_path=Path(folder,'child.json'); program=Path(folder,'program.json')
            agentech=FakeCleanupAgentech({'u_turn':RuntimeError('yaw stalled')})
            with patch.object(runner,'configure_navi',return_value=agentech):
                with self.assertRaisesRegex(RuntimeError,'yaw stalled'):
                    runner.execute(plan,result_path=str(child_path),attempt_id='attempt')
            atomic=runner._atomic_json
            attempts=0
            def persist(path,value):
                nonlocal attempts
                if str(path)==str(program):
                    attempts+=1
                    if attempts==1: raise OSError('promotion disk fault')
                atomic(path,value)
            metadata={}
            end=(datetime.now(timezone.utc)+timedelta(minutes=1)).isoformat()
            with patch.object(runner,'_atomic_json',side_effect=persist):
                runner._guardian_finalize(plan,str(program),str(child_path),'attempt',
                    SimpleNamespace(pid=123,returncode=1),runner._deadline_seconds(end),end,False,metadata)
            saved=json.loads(program.read_text())
            self.assertEqual(attempts,2)
            self.assertEqual(saved['outcome'],'failed')
            self.assertEqual(saved['error']['message'],'yaw stalled')
            self.assertEqual(saved['persistence_error']['message'],'promotion disk fault')
            self.assertEqual(metadata['program_outcome_error']['message'],'promotion disk fault')

    def test_nested_timed_turn_measurements_survive_oversized_trace(self):
        result=runner._bounded_result({'operation':'turn','dry_run':False,'turn':{
            'measured_angle_rad':1.44,'measured_angle_deg':82.5,'feedback_samples':24,'rotation_observed':True,
            'feedback_trace_tail':[{'elapsed_s':index/10,'body_yaw_rad':index/10,'measured_wz_rad_s':.5,
                'measured_angle_rad':.1*index,'command_wz_rad_s':.5} for index in range(24)]}})
        self.assertEqual(result.get('turn',{}).get('measured_angle_deg'),82.5)
        self.assertLess(len(json.dumps(result).encode()),1537)


    def test_supervisor_program_nonzero_or_missing_result_remains_failure_after_damping(self):
        for returncode in (0, 7):
            with tempfile.TemporaryDirectory() as folder:
                plan = Path(folder, 'session-17.plan.json')
                plan.write_text(json.dumps({'version':2,'robot_model':'navi','submission_id':'submission',
                    'source_sha256':'a'*64,'commands':[{'name':'get_battery_status','args':{}}]}))
                cleanup = Path(folder, 'cleanup.json'); owner = Path(folder, 'owner.json')
                child = SimpleNamespace(pid=123,returncode=returncode,wait=lambda timeout:None,poll=lambda:returncode)
                with patch.object(runner, '_hidden_child', return_value=child), \
                     patch.object(runner, '_run_cleanup_child', side_effect=lambda *_:cleanup.write_text('{"outcome":"verified"}')), \
                     patch.object(runner.time, 'time', side_effect=[1000,1001]):
                    runner.supervise_booked_session(str(plan),'1970-01-01T00:16:41Z',str(cleanup),str(owner),'attempt')
                result_path = str(cleanup)+'.program.json'
                self.assertTrue(Path(result_path).is_file(), 'missing independent program outcome')
                result = json.loads(Path(result_path).read_text())
                self.assertEqual(result['outcome'], 'failed')
                self.assertEqual(result['navi_supervision']['program_return_code'], returncode)
                self.assertTrue(result['navi_supervision']['child_exited'])
                self.assertEqual(json.loads(cleanup.read_text())['outcome'], 'verified')

    def test_program_result_keeps_sdk_measurements_and_identity(self):
        plan = write_plan(['get_battery_status'])
        agentech = FakeAgentech()
        agentech.get_battery_status = lambda: {'measured_yaw_deg': 82.5, 'feedback_samples': 12}
        with tempfile.TemporaryDirectory() as folder, \
             patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(runner, 'rest_after_program', return_value={'status':'already_normal'}, create=True):
            result_path = str(Path(folder, 'program.json'))
            runner.execute(plan, result_path=result_path, attempt_id='attempt')
            result = json.loads(Path(result_path).read_text())
        self.assertEqual(result['outcome'], 'completed')
        self.assertEqual(result['attempt_id'], 'attempt')
        self.assertEqual(result['commands'][0]['result']['feedback_samples'], 12)
        self.assertEqual(result['completed_count'], 1)
        self.assertEqual(len(result['plan_sha256']), 64)

    def test_program_failure_is_not_replaced_by_stop_failure(self):
        plan = write_plan(['u_turn', 'pee'])
        agentech = FakeAgentech({'u_turn':RuntimeError('yaw stalled'), 'stop':RuntimeError('secondary stop')})
        with tempfile.TemporaryDirectory() as folder, patch.object(runner, 'configure_navi', return_value=agentech):
            result_path = str(Path(folder, 'program.json'))
            with self.assertRaisesRegex(RuntimeError, 'yaw stalled'):
                runner.execute(plan, result_path=result_path, attempt_id='attempt')
            result = json.loads(Path(result_path).read_text())
        self.assertEqual(result['outcome'], 'failed')
        self.assertEqual(result['error']['message'], 'yaw stalled')
        self.assertEqual(result['commands'][0]['status'], 'failed')
        self.assertNotIn('pee', agentech.calls)

    def test_program_failure_stops_then_rests_without_losing_original_error(self):
        plan = write_plan(['u_turn', 'pee'])
        agentech = FakeCleanupAgentech({'u_turn':RuntimeError('yaw stalled')})
        agentech.state['action'] = 4
        def stop():
            agentech.calls.append('stop')
            agentech.body.update(vx=0., vy=0., wz=0.)  # Public stop preserves action-4 gait.
        agentech.stop = stop
        def action(_client, action_id):
            self.assertEqual(action_id,3); agentech.calls.append('normal_stand'); agentech.state['action']=3
        agentech._selected_controller = SimpleNamespace(dry_run=False,
            _client=lambda:nullcontext(object()),_send_dog_action=action)
        with tempfile.TemporaryDirectory() as folder, patch.object(runner,'configure_navi',return_value=agentech):
            result_path=str(Path(folder,'program.json'))
            with self.assertRaisesRegex(RuntimeError,'yaw stalled'):
                runner.execute(plan,result_path=result_path,attempt_id='attempt')
            result=json.loads(Path(result_path).read_text())
        self.assertEqual(motions(agentech),['u_turn','stop','normal_stand'])
        self.assertEqual(result['error']['message'],'yaw stalled')
        self.assertEqual(result['outcome'],'failed')

    def test_original_program_failure_survives_result_disk_failure(self):
        plan=write_plan(['u_turn'])
        agentech=FakeAgentech({'u_turn':RuntimeError('yaw stalled')})
        with patch.object(runner,'configure_navi',return_value=agentech), \
             patch.object(runner,'_atomic_json',side_effect=OSError('disk full')):
            with self.assertRaisesRegex(RuntimeError,'yaw stalled'):
                runner.execute(plan,result_path='unused',attempt_id='attempt')

    def test_reported_sdk_failure_is_retained_and_aborts_remaining_commands(self):
        for value in ({'succeeded':False}, {'success':False}, {'stalled':True},
                      {'timed_out':True}, {'outcome':'failed'}, {'status':'failed'}, {'dry_run':True}):
            agentech=FakeAgentech()
            agentech.u_turn=lambda:value
            with tempfile.TemporaryDirectory() as folder, patch.object(runner,'configure_navi',return_value=agentech):
                result_path=str(Path(folder,'program.json'))
                with self.assertRaises(RuntimeError):
                    runner.execute(write_plan(['u_turn','pee']),result_path=result_path,attempt_id='attempt')
                result=json.loads(Path(result_path).read_text())
            self.assertEqual(result['outcome'],'failed')
            self.assertEqual(result['commands'][0]['result'],value)
            self.assertNotIn('pee',agentech.calls)

    def test_supervised_actual_runner_receipt_round_trips_through_gateway_parser(self):
        with tempfile.TemporaryDirectory() as folder:
            plan=Path(folder,'session-17.plan.json')
            plan.write_text(json.dumps({'version':2,'robot_model':'navi','submission_id':'submission',
                'source_sha256':'a'*64,'commands':[{'name':'get_battery_status','args':{}}]}))
            child_result=Path(folder,'child.json'); program=Path(folder,'program.json')
            with patch.object(runner,'configure_navi',return_value=FakeCleanupAgentech()):
                runner.execute(str(plan),result_path=str(child_result),attempt_id='attempt')
            booked_end=(datetime.now(timezone.utc)+timedelta(minutes=1)).isoformat()
            child=SimpleNamespace(pid=123,returncode=0)
            runner._finalize_program(str(plan),str(program),str(child_result),'attempt',child,
                                     runner._deadline_seconds(booked_end),booked_end,False)
            result=json.loads(program.read_text())
            expected={'sessionId':'17','submissionId':'submission','sourceSha256':'a'*64,
                'planSha256':result['plan_sha256'],'attemptId':'attempt',
                'guardianPid':runner.os.getpid(),'bookedEnd':booked_end}
            parser=Path(__file__).with_name('navi-session-handoff.mjs').resolve().as_uri()
            code="import {readFileSync} from 'node:fs'; import {parseNaviProgramResult} from "+json.dumps(parser)+"; " \
                "const result=parseNaviProgramResult(readFileSync(process.argv[1],'utf8'),JSON.parse(process.argv[2])); " \
                "if(result.outcome!=='completed'||result.commands[0].result.percent!==55) process.exit(2);"
            completed=runner.subprocess.run(['node','--input-type=module','-e',code,str(program),json.dumps(expected)],
                capture_output=True,text=True,timeout=10)
            self.assertEqual(completed.returncode,0,completed.stderr)

    def test_finalizer_rejects_wrong_attempt_nonzero_deadline_and_unknown_child(self):
        with tempfile.TemporaryDirectory() as folder:
            plan=write_plan(['get_battery_status']); child_path=Path(folder,'child.json'); output=Path(folder,'program.json')
            with patch.object(runner,'configure_navi',return_value=FakeCleanupAgentech()):
                runner.execute(plan,result_path=str(child_path),attempt_id='attempt')
            original=json.loads(child_path.read_text())
            end=(datetime.now(timezone.utc)+timedelta(minutes=1)).isoformat()
            for code,expired,attempt in [(0,False,'other'),(7,False,'attempt'),(0,True,'attempt'),(None,False,'attempt')]:
                child_path.write_text(json.dumps({**original,'attempt_id':attempt}))
                result=runner._finalize_program(plan,str(output),str(child_path),'attempt',
                    SimpleNamespace(pid=123,returncode=code),runner._deadline_seconds(end),end,expired)
                self.assertEqual(result['outcome'],'failed')

    def test_finalizer_cannot_claim_success_when_exit_is_observed_after_deadline(self):
        with tempfile.TemporaryDirectory() as folder:
            plan=write_plan(['get_battery_status']); child=Path(folder,'child.json'); output=Path(folder,'program.json')
            result=runner._program_base(plan,'attempt')
            result.update(outcome='completed',error=None,started_at='2000-01-01T00:00:00Z',finished_at='2000-01-01T00:00:01Z')
            child.write_text(json.dumps(result))
            finalized=runner._finalize_program(plan,str(output),str(child),'attempt',
                SimpleNamespace(pid=123,returncode=0),runner._deadline_seconds('2000-01-01T00:01:00Z'),
                '2000-01-01T00:01:00Z',False)
            self.assertEqual(finalized['outcome'],'failed')
            self.assertTrue(finalized['navi_supervision']['deadline_expired'])

    def test_sdk_results_are_bounded_nonfinite_safe_and_omit_transport_fields(self):
        bounded=runner._bounded_result({'host':'private','port':9090,'measured_angle_deg':82.5,
            'feedback_samples':12,'feedback_trace_tail':[1.,2.,float('nan')],'huge':'x'*100000})
        self.assertNotIn('host',bounded); self.assertNotIn('port',bounded)
        self.assertEqual(bounded['measured_angle_deg'],82.5)
        self.assertEqual(bounded['feedback_trace_tail'],[1.,2.,None])
        self.assertLess(len(json.dumps(bounded)),1537)

    def test_truncated_turn_evidence_keeps_measured_scalars(self):
        result=runner._bounded_result({'operation':'turn','measured_angle_deg':82.5,
            'measured_angle_rad':1.44,'feedback_samples':12,'rotation_observed':True,
            'feedback_trace_tail':[{'yaw':index,'detail':'x'*256} for index in range(16)]})
        self.assertEqual(result.get('measured_angle_deg'),82.5)
        self.assertEqual(result.get('feedback_samples'),12)
        self.assertLess(len(json.dumps(result)),1537)

    def test_booked_yaw_timeout_cannot_be_recovered_to_full_success(self):
        plan = write_plan(['u_turn', 'pee'])
        agentech = FakeAgentech({'u_turn':TimeoutError(runner.TURN_TIMEOUT_PREFIX+'35 degrees')})
        with tempfile.TemporaryDirectory() as folder, patch.object(runner, 'configure_navi', return_value=agentech):
            result_path = str(Path(folder, 'program.json'))
            with self.assertRaises(TimeoutError):
                runner.execute(plan, result_path=result_path, attempt_id='attempt')
            self.assertEqual(json.loads(Path(result_path).read_text())['outcome'], 'failed')
        self.assertNotIn('pee', agentech.calls)

    def test_resting_stand_only_transitions_stationary_healthy_action_four(self):
        agentech = FakeCleanupAgentech()
        agentech.state['action'] = 4
        # The normal action must not call the public wake/recovery stand method.
        def action(_client, action_id):
            self.assertEqual(action_id, 3)
            agentech.calls.append('normal_stand')
            agentech.state['action'] = 3
        controller = SimpleNamespace(dry_run=False, _client=lambda:nullcontext(object()), _send_dog_action=action)
        agentech._selected_controller = controller
        result = runner.rest_after_program(agentech)
        self.assertEqual(result['status'], 'verified')
        self.assertEqual(motions(agentech), ['normal_stand'])

    def test_resting_stand_never_wakes_low_or_overrides_fault_charging_or_moving(self):
        for state, body, battery, raises in [
            ({'standing':False,'action':0,'estop':1}, {'z':.08}, {}, False),
            ({'standing':False,'action':2}, {'z':.08}, {}, False),
            ({'warning':1}, {}, {}, True), ({'estop':1}, {}, {}, True),
            ({'action':4}, {'vx':.1}, {}, True),
            ({'action':4}, {}, {'power_supply_status':1}, True),
        ]:
            agentech = FakeCleanupAgentech()
            agentech.state.update(state); agentech.body.update(body); agentech.battery.update(battery)
            if raises:
                with self.assertRaises((RuntimeError, ValueError)): runner.rest_after_program(agentech)
            else:
                self.assertEqual(runner.rest_after_program(agentech)['status'], 'unchanged_low')
            self.assertEqual(motions(agentech), [])

    def test_resting_stand_verifies_action_three_after_dispatch(self):
        agentech = FakeCleanupAgentech(); agentech.state['action'] = 4
        agentech._selected_controller = SimpleNamespace(dry_run=False,
            _client=lambda:nullcontext(object()), _send_dog_action=lambda *_:None)
        with self.assertRaisesRegex(RuntimeError, 'normal stand'):
            runner.rest_after_program(agentech)

    def test_execution_rechecks_readiness_after_claim_before_first_command(self):
        with patch.object(runner, 'navi_owner', return_value=nullcontext()), \
             patch.object(runner.time, 'time', return_value=1000), \
             patch.object(runner.threading, 'Timer'), \
             patch.object(runner, 'check_home_ready', side_effect=RuntimeError('charging now')), \
             patch.object(runner, 'execute') as execute:
            with self.assertRaisesRegex(RuntimeError, 'charging now'):
                runner.execute_until('plan', '1970-01-01T00:16:41Z')
        execute.assert_not_called()

    def test_lowered_action_zero_requires_real_damping_terminal_flag(self):
        agentech = FakeCleanupAgentech()
        agentech.state.update(standing=False, action=0, estop=0)
        agentech.body['z'] = .08
        with self.assertRaises(RuntimeError):
            runner._posture(agentech.state, agentech.body, damped=True)
        with patch.object(runner, 'configure_navi', return_value=agentech):
            result = runner.end_session_cleanup(return_home=False)
        self.assertIn('damping', motions(agentech))
        self.assertEqual(result['final_state']['estop'], 1)

    def test_booked_cleanup_damps_without_home_calibration(self):
        agentech = FakeCleanupAgentech()
        records = []
        with patch.object(runner, 'navi_owner', return_value=nullcontext()), \
             patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(runner, 'load_plan', return_value=[{'name':'stand','args':{}}]), \
             patch.object(runner, 'verify_home_binding', side_effect=AssertionError('home must not run')), \
             patch.object(runner, '_atomic_json', side_effect=lambda _path,value:records.append(value)):
            runner.run_cleanup_attempt('plan', 'result', 'attempt')
        self.assertEqual(motions(agentech), ['stop', 'damping'])
        self.assertEqual(records[-1]['result']['operation'], 'damping')
        self.assertFalse(records[-1]['result']['home_verified'])
        self.assertNotIn('position_error_m', records[-1]['result'])

    def test_default_sdk_standing_height_is_recognized(self):
        agentech = FakeCleanupAgentech()
        agentech.body['z'] = .285
        self.assertEqual(runner._posture(agentech.state, agentech.body), ('standing', True))
        agentech.body['z'] = .34
        with self.assertRaises(RuntimeError):
            runner._posture(agentech.state, agentech.body)

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
                try: runner.supervise_booked_session(write_plan(['get_battery_status']),end,result,owner,'test-attempt')
                finally:
                    if child is not None and child.poll() is None:
                        child.kill(); child.wait(timeout=5)
            outcome=json.loads(Path(result).read_text())
            self.assertEqual(outcome['outcome'],'verified')
            self.assertEqual(outcome['attempt_id'],'test-attempt')
            self.assertIs(outcome['result']['ready_for_next_user'],True)
            self.assertEqual(motions(agentech),['stop','damping'])
            self.assertEqual(outcome['result']['operation'], 'damping')

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
            returncode=1
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
            supervise(write_plan(['forward']),'1970-01-01T00:16:41Z','outcome','owner','attempt')
        self.assertEqual(events,[('wait',1),'terminate',('wait',5),'cleanup'])

    def test_booked_supervisor_early_finish_waits_for_booking_not_program_duration(self):
        supervise=getattr(runner,'supervise_booked_session',None)
        self.assertTrue(callable(supervise), 'missing independent booked-deadline supervisor')
        events=[]
        child=SimpleNamespace(pid=123,returncode=0,wait=lambda timeout:events.append(('plan',timeout)),poll=lambda:0)
        with patch.object(runner,'load_plan',return_value=[{'name':'forward','args':{}}]), \
             patch.object(runner.subprocess,'Popen',return_value=child), \
             patch.object(runner,'_atomic_json',side_effect=lambda *_args:None), \
             patch.object(runner,'_run_cleanup_child',side_effect=lambda *_args:events.append('cleanup')), \
             patch.object(runner.time,'time',side_effect=[1000,1000,1001]), \
             patch.object(runner.time,'sleep',side_effect=lambda delay:events.append(('sleep',delay))):
            supervise(write_plan(['forward']),'1970-01-01T00:16:41Z','outcome','owner','attempt')
        self.assertEqual(events,[('plan',1),('sleep',1),'cleanup'])

    def test_session_admission_does_not_require_home_calibration_or_same_boot(self):
        agentech = FakeCleanupAgentech()
        agentech.state.update(action=0, standing=False, estop=1)
        agentech.body['z'] = .08
        with patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(runner, 'verify_home_binding', side_effect=AssertionError('home must not gate session')) as binding, \
             patch.dict('os.environ', {'AGENTECH_NAVI_EXPECTED_RESET_RUN_ID':'previous-boot'}):
            runner.check_home_ready()
        binding.assert_not_called()
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

    def relaxed_damped_robot(self):
        agentech = FakeCleanupAgentech()
        agentech.state.update(standing=False, action=1, estop=0)
        agentech.body.update(z=.019487956538796425, roll=-.00646582804620266,
                             pitch=-.009637602604925632, yaw=.0010585348354652524,
                             vx=-.00016297705587930977, vy=.00010933620797004551,
                             wz=-.0012739332159981132)
        return agentech

    def test_relaxed_damped_admission_recognizes_confirmed_pose_without_motion(self):
        agentech = self.relaxed_damped_robot()
        original = copy.deepcopy(agentech.state)
        with patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(runner.time, 'sleep'):
            result = runner.check_home_ready()
        self.assertEqual(result['posture'], 'lowered_damped')
        self.assertEqual(result['posture_evidence'], 'operator_confirmed_relaxed_mode')
        self.assertEqual(result['final_state']['action'], 1)
        self.assertEqual(result['final_state']['estop'], 0)
        self.assertEqual(agentech.state, original)
        self.assertEqual(agentech.calls.count('status'), 3)
        self.assertEqual(agentech.calls.count('body_status'), 3)
        self.assertEqual(motions(agentech), [])

    def test_relaxed_damped_admission_rejects_unsafe_or_ambiguous_samples(self):
        cases = [
            ({'standing':True}, {}), ({'boot_finish':False}, {}),
            ({'robot_ready':False}, {}), ({'error':1}, {}), ({'warning':1}, {}),
            ({'estop':1}, {}), ({'estop':2}, {}), ({'action':2}, {}),
            ({'action':99}, {}), ({'action':True}, {}), ({}, {'z':.041}),
            ({}, {'z':-.01}), ({}, {'z':float('nan')}), ({}, {'roll':.151}),
            ({}, {'pitch':-.151}), ({}, {'vx':.03}), ({}, {'vy':-.03}),
            ({}, {'wz':.03}), ({}, {'yaw':None}),
        ]
        for state_change, body_change in cases:
            with self.subTest(state=state_change, body=body_change):
                agentech = self.relaxed_damped_robot()
                agentech.state.update(state_change)
                agentech.body.update(body_change)
                with patch.object(runner, 'configure_navi', return_value=agentech), \
                     patch.object(runner.time, 'sleep'):
                    with self.assertRaises((RuntimeError, ValueError)):
                        runner.check_home_ready()
                self.assertEqual(motions(agentech), [])

    def test_relaxed_damped_admission_requires_consecutive_matching_samples(self):
        for changed in ({'action':0, 'estop':1}, {'action':3, 'standing':True}, {'warning':1}):
            agentech = self.relaxed_damped_robot()
            states = [copy.deepcopy(agentech.state),
                      {**agentech.state, **changed}, copy.deepcopy(agentech.state)]
            with patch.object(runner, 'configure_navi', return_value=agentech), \
                 patch.object(agentech, 'status', side_effect=states), \
                 patch.object(runner.time, 'sleep'):
                with self.assertRaises(RuntimeError):
                    runner.check_home_ready()
            self.assertEqual(motions(agentech), [])
        agentech = self.relaxed_damped_robot()
        bodies = [copy.deepcopy(agentech.body), {**agentech.body, 'wz':.1},
                  copy.deepcopy(agentech.body)]
        with patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(agentech, 'body_status', side_effect=bodies), \
             patch.object(runner.time, 'sleep'):
            with self.assertRaises(RuntimeError):
                runner.check_home_ready()
        self.assertEqual(motions(agentech), [])

    def test_relaxed_damped_admission_rejects_lost_feedback_and_late_charging(self):
        for missing in ('status', 'body_status'):
            agentech = self.relaxed_damped_robot()
            value = agentech.state if missing == 'status' else agentech.body
            with patch.object(runner, 'configure_navi', return_value=agentech), \
                 patch.object(agentech, missing, side_effect=[copy.deepcopy(value), TimeoutError('stale')]), \
                 patch.object(runner.time, 'sleep'):
                with self.assertRaises(TimeoutError):
                    runner.check_home_ready()
            self.assertEqual(motions(agentech), [])
        agentech = self.relaxed_damped_robot()
        with patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(agentech, 'get_battery_status',
                          side_effect=[agentech.battery, {**agentech.battery, 'power_supply_status':1}]), \
             patch.object(runner.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'charging'):
                runner.check_home_ready()
        self.assertEqual(motions(agentech), [])

    def test_relaxed_damped_rest_leaves_the_low_robot_unchanged(self):
        agentech = self.relaxed_damped_robot()
        with patch.object(runner.time, 'sleep'):
            result = runner.rest_after_program(agentech)
        self.assertEqual(result['status'], 'unchanged_low')
        self.assertEqual(motions(agentech), [])

    def test_relaxed_damped_booked_cleanup_still_requires_actual_damping(self):
        for stop_first in (False, True):
            agentech = self.relaxed_damped_robot()
            with patch.object(runner, 'configure_navi', return_value=agentech), \
                 patch.object(runner.time, 'sleep'):
                result = runner.end_session_cleanup(return_home=False, stop_first=stop_first)
            self.assertEqual(motions(agentech), ['stop', 'damping'] if stop_first else ['damping'])
            self.assertTrue(result['damping_completed'])
            self.assertEqual(result['final_state']['action'], 0)
            self.assertEqual(result['final_state']['estop'], 1)

    def test_relaxed_damped_mode_cannot_fabricate_completed_cleanup(self):
        agentech = self.relaxed_damped_robot()
        def ineffective_damping():
            agentech.calls.append('damping')
        with patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(agentech, 'damping', side_effect=ineffective_damping), \
             patch.object(runner.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'lowered/damped'):
                runner.end_session_cleanup(return_home=False)
        self.assertEqual(motions(agentech), ['damping', 'stop'])

    def test_relaxed_damped_mode_does_not_change_return_home_qualification(self):
        agentech = self.relaxed_damped_robot()
        with self.assertRaises(RuntimeError):
            runner._posture(agentech.state, agentech.body, damped=True)
        with patch.object(runner, 'configure_navi', return_value=agentech), \
             patch.object(runner, 'verify_home_binding', return_value='test-calibrated-boot'):
            with self.assertRaises(RuntimeError):
                runner.end_session_cleanup(return_home=True)
        self.assertEqual(motions(agentech), ['stop'])


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

    def test_home_binding_refuses_disabled_legacy_and_preserves_boot_guard(self):
        valid = {'schema_version': 2, 'mode': 'cell_return_to_home', 'motion_enabled': True,
                 'motion': {'enabled': True, 'run_id': 'calibration-boot'}}
        for mutate, live in [({'schema_version': 1}, 'calibration-boot'),
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
        with patch.object(runner, '_load_home_calibration', return_value=valid), \
             patch.object(runner, '_current_run_id', return_value='other-boot'):
            with self.assertRaisesRegex(RuntimeError, 'boot identity'):
                runner.verify_home_binding(FakeCleanupAgentech())

    def test_automatic_home_preparation_is_not_in_this_release(self):
        self.assertFalse(hasattr(runner, 'ensure_home_ready'))
        self.assertFalse(hasattr(runner, 'run_home_preparation'))
        self.assertNotIn('--prepare-home', RUNNER_PATH.read_text())

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
