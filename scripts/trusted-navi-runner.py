"""Trusted local Navi executor. It accepts inert JSON, never customer Python."""
from __future__ import annotations

import json
import importlib.util
import math
import os
import sys
import subprocess
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from navi_gateway_spec import validate_navi_command  # noqa: E402

MAX_COMMANDS = 200
RECOVERABLE_TURN_COMMANDS = frozenset({"turn", "turn_left", "turn_right", "u_turn"})
TURN_TIMEOUT_PREFIX = "Navi yaw-feedback turn timed out at "

# Reuse the established execution schema, not a second customer result format.
_result_spec = importlib.util.spec_from_file_location('navi_execution_schema', Path(__file__).with_name('aegis-runner-result.py'))
_result_schema = importlib.util.module_from_spec(_result_spec)
_result_spec.loader.exec_module(_result_schema)


def _program_base(plan_path, attempt_id):
    raw = Path(plan_path).read_bytes()
    plan = json.loads(raw)
    return {**_result_schema.build_final_result(plan=plan, plan_path=Path(plan_path), plan_bytes=raw,
        commands=[], started_at=_result_schema.utc_timestamp(), finished_at=_result_schema.utc_timestamp(),
        error={'type':'ProgramIncomplete', 'message':'No completed program outcome', 'command':'stop'},
        diary_path=Path(plan_path).with_suffix('.navi.log')), 'attempt_id':attempt_id}


def _bounded_result(value):
    def clean(item, depth=0):
        if item is None or isinstance(item, (bool, int)):
            return item
        if isinstance(item, float):
            return item if math.isfinite(item) else None
        if isinstance(item, str):
            return item[:256]
        if depth >= 4:
            return {'truncated':True}
        if isinstance(item, dict):
            return {str(key)[:80]:clean(data,depth+1) for key,data in list(item.items())[:24]
                    if str(key) not in ('host','port','password','token','secret')}
        if isinstance(item, (list,tuple)):
            return [clean(data,depth+1) for data in item[:16]]
        return {'unserializable_type':type(item).__name__[:80]}
    result = clean(value)
    if len(json.dumps(result, allow_nan=False).encode('utf-8')) > 1536:
        fields = ('operation','measured_angle_rad','measured_angle_deg','feedback_samples','rotation_observed')
        measured = {key:result[key] for key in fields if isinstance(result,dict) and key in result
                    and isinstance(result[key],(str,int,float,bool,type(None)))}
        if isinstance(result,dict) and isinstance(result.get('turn'),dict):
            measured['turn'] = {key:result['turn'][key] for key in fields if key in result['turn']
                               and isinstance(result['turn'][key],(str,int,float,bool,type(None)))}
        return {**measured, 'truncated':True, 'reason':'SDK result exceeded bounded evidence size'}
    return result


def _program_error(error, command='stop', index=None, line=None):
    result = _result_schema.error_value(error, command=command, command_index=index, line=line)
    result['message'] = result['message'][:2000]
    return result


def _assert_sdk_result(name, value):
    if isinstance(value, dict) and (value.get('success') is False or value.get('succeeded') is False
            or value.get('stalled') is True or value.get('timed_out') is True or value.get('dry_run') is True
            or value.get('outcome') == 'failed' or value.get('status') == 'failed'):
        raise RuntimeError(f'{name} SDK reported failure or non-live execution')
    return value


def _finalize_program(plan_path, program_path, child_path, attempt_id, child, deadline, booked_end, expired):
    result = _program_base(plan_path, attempt_id)
    # A pre-deadline JSON timestamp is not proof the child actually exited on time.
    expired = expired or datetime.now(timezone.utc).timestamp() >= deadline
    try:
        if Path(child_path).stat().st_size > 512*1024:
            raise ValueError('Program child result exceeds bounded size')
        saved = json.loads(Path(child_path).read_text(encoding='utf-8'))
        if not isinstance(saved, dict):
            raise ValueError('Program child result must be an object')
        for field in ('attempt_id','session_id','submission_id','source_sha256','plan_sha256','robot_model'):
            if saved.get(field) != result[field]:
                raise ValueError('Program child result identity mismatch: '+field)
        if saved.get('schema_version') != 1 or saved.get('outcome') not in ('completed','failed'):
            raise ValueError('Program child result schema/outcome is invalid')
        _deadline_seconds(saved['started_at'])
        _deadline_seconds(saved['finished_at'])
        if saved['outcome'] == 'failed' and not isinstance(saved.get('error'),dict):
            raise ValueError('Failed program child result requires a structured error')
        result = saved
    except (OSError, ValueError, TypeError, KeyError, AttributeError) as error:
        result['error'] = _program_error(RuntimeError('MissingOrInvalidProgramResult: '+str(error)))
    exited = child is not None and type(child.returncode) is int
    if expired or not exited or child.returncode != 0:
        if result['outcome'] != 'failed' or result.get('error', {}).get('type') == 'ProgramIncomplete':
            result['error'] = _program_error(RuntimeError('Program deadline expired or child exit was not successful'))
        result['outcome'] = 'failed'
    if result['outcome'] == 'completed' and _deadline_seconds(result['finished_at']) > deadline:
        result.update(outcome='failed', error=_program_error(RuntimeError('Program completed after booked deadline')))
        expired = True
    result['navi_supervision'] = {'version':1, 'guardian_pid':os.getpid(),
        'program_pid':child.pid if child is not None else None,
        'program_return_code':child.returncode if child is not None else None,
        'child_exited':exited, 'deadline_expired':bool(expired), 'booked_end':booked_end}
    try:
        _atomic_json(program_path, result)
    except Exception as error:
        error.program_result = result  # Preserve any original SDK fault on a failed persistence attempt.
        raise
    return result


def _guardian_fault(metadata, field, error):
    metadata[field] = _program_error(error)
    try:
        print(f'[navi-runner] guardian {field}: {type(error).__name__}: {str(error)[:2000]}',
              file=sys.stderr, flush=True)
    except Exception:
        pass  # A broken log destination must not cancel the booked cleanup duty.


def _guardian_metadata(owner_path, metadata):
    try:
        _atomic_json(owner_path, metadata)
    except Exception as error:
        _guardian_fault(metadata, 'owner_persistence_error', error)


def _guardian_finalize(plan_path, program_path, child_path, attempt_id, child, deadline, booked_end, expired, metadata):
    try:
        _finalize_program(plan_path, program_path, child_path, attempt_id, child, deadline, booked_end, expired)
    except Exception as error:
        _guardian_fault(metadata, 'program_outcome_error', error)
        # A transient failed promotion must never leave a completed program receipt.
        # Retry a failed receipt, preserving an SDK error if it was already known.
        try:
            failed = getattr(error, 'program_result', None) or _program_base(plan_path, attempt_id)
            if failed['outcome'] != 'failed' or failed['error']['type'] == 'ProgramIncomplete':
                failed['error'] = _program_error(error)
            failed.update(outcome='failed', persistence_error=_program_error(error))
            failed['navi_supervision'] = {'version':1,'guardian_pid':os.getpid(),
                'program_pid':child.pid if child is not None else None,
                'program_return_code':child.returncode if child is not None else None,
                'child_exited':child is not None and type(child.returncode) is int,
                'deadline_expired':bool(expired or datetime.now(timezone.utc).timestamp() >= deadline),
                'booked_end':booked_end}
            _atomic_json(program_path, failed)
        except Exception as retry_error:
            _guardian_fault(metadata, 'program_outcome_retry_error', retry_error)


@contextmanager
def navi_owner():
    """OS-released exclusive SDK owner, including detached/orphan processes."""
    path = Path(os.environ.get('AGENTECH_NAVI_OWNER_LOCK',
                               str(Path(__file__).resolve().parent.parent/'.robot-stream-runtime'/'navi-owner.lock')))
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as handle:
        if os.fstat(handle.fileno()).st_size == 0:
            handle.write(b'\0'); handle.flush()
        handle.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise RuntimeError('Another Navi SDK owner is active; operation refused') from error
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _atomic_json(path, value):
    target = Path(path)
    temporary = target.with_name(target.name+'.'+uuid.uuid4().hex+'.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as handle:
            json.dump(value, handle, separators=(',', ':'), allow_nan=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
    finally:
        try: temporary.unlink()
        except FileNotFoundError: pass


def _deadline_seconds(value):
    deadline = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if deadline.tzinfo is None:
        raise ValueError('Booked deadline must include UTC/timezone')
    return deadline.timestamp()


def _failed_outcome(result_path, attempt_id, error):
    try:
        _atomic_json(result_path, {'version':1, 'attempt_id':attempt_id,
                                  'outcome':'failed', 'error':str(error)})
    except BaseException as write_error:
        # Missing durable evidence stays blocked; never mask the causal fault.
        if isinstance(error, BaseException):
            error.outcome_write_error = write_error


def _hidden_child(arguments):
    return subprocess.Popen([sys.executable, str(Path(__file__).resolve()), *arguments],
                            stdin=subprocess.DEVNULL, stdout=sys.stdout, stderr=sys.stderr,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)


def _terminate_plan_child(child):
    # Only this supervisor's child is targeted, never another robot/service.
    if os.name == 'nt':
        subprocess.run(['taskkill', '/PID', str(child.pid), '/T', '/F'],
                       capture_output=True, timeout=5, creationflags=subprocess.CREATE_NO_WINDOW)
    else:
        child.kill()


def _run_cleanup_child(plan_path, result_path, owner_path, attempt_id, metadata):
    metadata.update(phase='starting_cleanup', cleanup_pid=None)
    _guardian_metadata(owner_path, metadata)
    child = _hidden_child(['--cleanup-attempt', plan_path, result_path, attempt_id])
    metadata.update(phase='cleanup', cleanup_pid=child.pid)
    _guardian_metadata(owner_path, metadata)
    try:
        child.wait(timeout=120)
    except subprocess.TimeoutExpired:
        _terminate_plan_child(child)
        try: child.wait(timeout=5)
        except subprocess.TimeoutExpired as error:
            raise RuntimeError('Navi cleanup child did not exit; retry blocked') from error
        _failed_outcome(result_path, attempt_id, 'Navi cleanup exceeded its bounded deadline')
    metadata['phase'] = 'finished'
    _guardian_metadata(owner_path, metadata)


def supervise_booked_session(plan_path, booked_end, result_path, owner_path, attempt_id):
    """Deadline and cleanup survive a blocked/restarted bridge; no SDK IO here."""
    load_plan(plan_path)
    deadline = _deadline_seconds(booked_end)
    metadata = {'version':1, 'attempt_id':attempt_id, 'guardian_pid':os.getpid(),
                'program_pid':None, 'cleanup_pid':None, 'phase':'starting'}
    _atomic_json(owner_path, metadata)
    program_path = str(result_path)+'.program.json'
    child_path = program_path+'.child.json'
    child = None
    expired = False
    try:
        remaining = max(0., deadline-time.time())
        if remaining > 0:
            child = _hidden_child(['--execute-until', plan_path, booked_end, child_path, attempt_id])
            metadata.update(phase='program', program_pid=child.pid)
            _guardian_metadata(owner_path, metadata)
            try:
                child.wait(timeout=remaining)
            except subprocess.TimeoutExpired:
                expired = True
                _terminate_plan_child(child)
                try: child.wait(timeout=5)
                except subprocess.TimeoutExpired as error:
                    raise RuntimeError('Navi plan child did not exit; reset blocked') from error
            if type(child.returncode) is not int:
                raise RuntimeError('Navi plan child exit is unknown; reset blocked')
            _guardian_finalize(plan_path, program_path, child_path, attempt_id, child, deadline, booked_end, expired, metadata)
            metadata.update(phase='waiting_for_booked_end', program_return_code=child.returncode)
            _guardian_metadata(owner_path, metadata)
            # Completing a program early does not end its booked ownership.
            remaining = deadline-time.time()
            while remaining > 0:
                time.sleep(remaining)
                remaining = deadline-time.time()
        else:
            _guardian_finalize(plan_path, program_path, child_path, attempt_id, None, deadline, booked_end, True, metadata)
        _run_cleanup_child(plan_path, result_path, owner_path, attempt_id, metadata)
    except BaseException as error:
        _failed_outcome(result_path, attempt_id, error)
        raise


def supervise_cleanup(plan_path, result_path, owner_path, attempt_id):
    metadata = {'version':1, 'attempt_id':attempt_id, 'guardian_pid':os.getpid(),
                'program_pid':None, 'cleanup_pid':None, 'phase':'starting_cleanup'}
    try:
        _run_cleanup_child(plan_path, result_path, owner_path, attempt_id, metadata)
    except BaseException as error:
        _failed_outcome(result_path, attempt_id, error)
        raise


def execute_until(plan_path, booked_end, result_path=None, attempt_id=None):
    deadline = _deadline_seconds(booked_end)
    remaining = deadline-time.time()
    if remaining <= 0:
        raise RuntimeError('Booked session has expired; customer plan refused')
    # Kill only this action process, not an SDK stop concurrent with an action.
    # The supervisor verifies exit and then the cleanup owner issues SDK stop.
    timer = threading.Timer(remaining, lambda: os._exit(124))
    timer.daemon = True
    timer.start()
    try:
        with navi_owner():
            # Cloud claim/spawn may outlive the earlier readiness snapshot.
            check_home_ready()
            if result_path is None:
                execute(plan_path)
            else:
                execute(plan_path, result_path=result_path, attempt_id=attempt_id)
    finally:
        timer.cancel()


def run_cleanup_attempt(plan_path, result_path, attempt_id):
    try:
        with navi_owner():
            result = end_session_cleanup(return_home=False, session_plan=plan_path, stop_first=True)
        _atomic_json(result_path, {'version':1, 'attempt_id':attempt_id, 'outcome':'verified',
                                  'verified_at':datetime.now(timezone.utc).isoformat(), 'result':result})
    except BaseException as error:
        _failed_outcome(result_path, attempt_id, error)
        raise


def configure_navi():
    sdk_root = os.environ.get('AGENTECH_SDK_ROOT', '').strip()
    path = Path(sdk_root)
    if not sdk_root or not path.is_absolute() or not (path/'agentech'/'__init__.py').is_file():
        raise ValueError('AGENTECH_SDK_ROOT must name an explicit existing SDK deployment')
    sys.path.insert(0, str(path.resolve()))
    from agentech import Agentech

    host = os.environ.get("AGENTECH_NAVI_HOST", "192.168.4.65").strip()
    port = int(os.environ.get("AGENTECH_NAVI_PORT", "9090"))
    if not host:
        raise ValueError("AGENTECH_NAVI_HOST must not be empty")
    Agentech.use("navi", host=host, port=port, dry_run=False)
    return Agentech


def load_plan(path: str) -> list[dict]:
    plan = json.loads(Path(path).read_text(encoding="utf-8"))
    commands = plan.get("commands")
    if plan.get("version") != 2 or plan.get("robot_model") != "navi" or not isinstance(commands, list):
        raise ValueError("unsupported Navi command plan")
    if not 1 <= len(commands) <= MAX_COMMANDS:
        raise ValueError(f"Navi command plan must contain 1 through {MAX_COMMANDS} commands")
    for command in commands:
        if not isinstance(command, dict):
            raise ValueError("invalid Navi command plan entry")
        validate_navi_command(command.get("name"), command.get("args"))
    return commands


def is_recoverable_turn_timeout(name: str, error: BaseException) -> bool:
    return (
        name in RECOVERABLE_TURN_COMMANDS
        and isinstance(error, TimeoutError)
        and str(error).startswith(TURN_TIMEOUT_PREFIX)
    )


def execute(path: str, *, result_path=None, attempt_id=None) -> None:
    commands = load_plan(path)
    agentech = configure_navi()
    result = _program_base(path, attempt_id) if result_path is not None else None
    failure = None
    recoverable_timeouts = 0
    try:
        for index, command in enumerate(commands, start=1):
            name = command["name"]
            arguments = command["args"]
            print(f"[navi-runner] {index}/{len(commands)} Agentech.{name}({arguments})", flush=True)
            started = time.monotonic()
            record = {'command_index':index,'name':name,'args':arguments,
                      'source_args':command.get('source_args',arguments),'line':command.get('line'),
                      'status':'completed','result':None,'error':None,
                      'started_at':_result_schema.utc_timestamp(),'duration_ms':0}
            try:
                sdk_result = getattr(agentech, name)(**arguments)
                record['result'] = _bounded_result(sdk_result)
                _assert_sdk_result(name, sdk_result)
            except BaseException as error:
                record.update(status='failed',error=_program_error(error,name,index,command.get('line')))
                trace = getattr(error, 'feedback_trace_tail', None)
                if isinstance(trace, (list,tuple)):
                    evidence = _bounded_result({'feedback_trace_tail':list(trace[-6:])})
                    record['result'] = evidence if record['result'] is None else {
                        'sdk_result':record['result'], 'failure_feedback':evidence}
                if result is not None or not is_recoverable_turn_timeout(name, error):
                    if result is not None: result['error'] = record['error']
                    raise
                print(
                    f"[navi-runner] recoverable {name} timeout: {error}; "
                    "sending a safety stop, then continuing",
                    flush=True,
                )
                agentech.stop()
                recoverable_timeouts += 1
            finally:
                if result is not None:
                    record['duration_ms'] = max(0., (time.monotonic()-started)*1000)
                    result['commands'].append(record)
                    result['completed_count'] = sum(item['status']=='completed' for item in result['commands'])
                    result['finished_at'] = _result_schema.utc_timestamp()
                    active_error = sys.exc_info()[1]
                    try:
                        _atomic_json(result_path,result)
                    except BaseException as write_error:
                        if active_error is None: raise
                        active_error.outcome_write_error = write_error
        print(f"[navi-runner] command plan completed: {len(commands)} commands", flush=True)
        if recoverable_timeouts:
            print(
                f"[navi-runner] completed {len(commands)} commands with "
                f"{recoverable_timeouts} recoverable turn timeout(s)",
                flush=True,
            )
    except BaseException as error:
        failure = error
        raise
    finally:
        try:
            _assert_sdk_result('stop', agentech.stop())
            if result is not None:
                result['resting_stand'] = rest_after_program(agentech)
        except BaseException as cleanup_error:
            if result is not None:
                result['cleanup_error'] = _program_error(cleanup_error)
            if failure is None:
                failure = cleanup_error
                if result is not None: result['error'] = _program_error(cleanup_error)
                raise
        finally:
            if result is not None:
                result['outcome'] = 'failed' if failure is not None else 'completed'
                if failure is None: result['error'] = None
                result['finished_at'] = _result_schema.utc_timestamp()
                try:
                    _atomic_json(result_path,result)
                except BaseException as write_error:
                    if failure is None: raise
                    failure.outcome_write_error = write_error


def rest_after_program(agentech):
    """No wake/recovery: normal mode only from fresh stationary healthy standing."""
    _battery_guard(agentech)
    state, _, kind, still = _fresh_posture(agentech, allow_relaxed=True)
    if kind == 'low':
        return {'status':'unchanged_low','final_state':_safe_state(state)}
    if not still:
        raise RuntimeError('Program stop did not verify stationary standing')
    if state['action'] == 3:
        return {'status':'already_normal','final_state':_safe_state(state)}
    controller = agentech._selected_controller
    if controller is None or controller.dry_run is not False:
        raise RuntimeError('Resting stand requires the selected live controller')
    with controller._client() as client:
        # Same OS SDK owner; do not invoke stand(), which can wake a low robot.
        state, _, kind, still = _fresh_posture(agentech)
        _battery_guard(agentech)
        if kind != 'standing' or not still or state['action'] != 4:
            raise RuntimeError('Resting stand lost healthy stationary action-4 posture')
        _assert_sdk_result('normal_stand', controller._send_dog_action(client, 3))
    state, _, kind, still = _fresh_posture(agentech)
    if kind != 'standing' or not still or state['action'] != 3:
        raise RuntimeError('Program normal stand was not verified after dispatch')
    return {'status':'verified','final_state':_safe_state(state)}


def end_session_lie_down() -> None:
    agentech = configure_navi()
    try:
        print("[navi-runner] booked session ended; Agentech.lie_down({})", flush=True)
        agentech.lie_down()
    finally:
        agentech.stop()


def _number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be a finite number")
    return float(value)


def _posture(state, body, *, damped=False, allow_relaxed=False):
    if not isinstance(state, dict) or not isinstance(body, dict):
        raise RuntimeError("Missing fresh controller/body telemetry")
    if (state.get('boot_finish') is not True or state.get('robot_ready') is not True
            or type(state.get('standing')) is not bool):
        raise RuntimeError("Controller boot/readiness/standing is not known healthy")
    for field in ('error', 'warning', 'action', 'estop'):
        _number(state.get(field), f'controller {field}')
    if state['error'] != 0 or state['warning'] != 0:
        raise RuntimeError("Controller has active error or warning; autonomous reset refused")
    values = {field: _number(body.get(field), f'body {field}')
              for field in ('z', 'yaw', 'roll', 'pitch', 'vx', 'vy', 'wz')}
    if abs(values['roll']) > .15 or abs(values['pitch']) > .15:
        raise RuntimeError("Unsafe body attitude; autonomous recovery refused")
    if not (-.67 <= values['vx'] <= 1.34 and abs(values['vy']) <= .67 and abs(values['wz']) <= 6.3):
        raise RuntimeError("Body velocity exceeds known controller bounds")
    still = max(abs(values[field]) for field in ('vx', 'vy', 'wz')) < .03
    low = (state['standing'] is False and state['action'] in (0, 2)
           and 0 <= values['z'] <= .12 and still
           and (state['estop'] == 0 or state['action'] == 0 and state['estop'] == 1))
    standing = (state['standing'] is True and state['action'] in (3, 4)
                # SDK normal standing height is .285 m; allow 2 cm telemetry tolerance.
                and state['estop'] == 0 and .20 <= values['z'] <= .305)
    if damped:
        if not low or state['action'] != 0 or state['estop'] != 1:
            raise RuntimeError("Healthy lowered/damped terminal posture is not verified")
        return 'low', still
    # Operator-confirmed relaxed posture (2026-10-22) can retain Wake/action 1.
    # Recognize its very low, still pose for session handling, not as proof that
    # an SDK damping command completed. Return-home keeps its strict contract.
    if (allow_relaxed and state['standing'] is False and state['action'] == 1
            and state['estop'] == 0 and 0 <= values['z'] <= .04 and still):
        low = True
    if not low and not standing:
        raise RuntimeError("Unknown, fallen or active e-stop posture; autonomous recovery refused")
    return ('low' if low else 'standing'), still


def _fresh_posture(agentech, *, damped=False, allow_relaxed=False):
    state, body = agentech.status(), agentech.body_status()
    kind, still = _posture(state, body, damped=damped, allow_relaxed=allow_relaxed)
    if allow_relaxed and state['action'] == 1:
        # Do not admit a transient wake transition from one low sample.
        for _ in range(2):
            time.sleep(.1)
            state, body = agentech.status(), agentech.body_status()
            kind, still = _posture(state, body, damped=damped, allow_relaxed=True)
            if state['action'] != 1 or kind != 'low' or not still:
                raise RuntimeError("Relaxed damped posture changed during readiness observation")
    return state, body, kind, still


def _battery_guard(agentech):
    battery = agentech.get_battery_status()
    if not isinstance(battery, dict) or battery.get('present') is not True:
        raise RuntimeError('A present battery with known telemetry is required')
    percent = _number(battery.get('percent'), 'battery percent')
    supply = _number(battery.get('power_supply_status'), 'battery supply status')
    voltage = _number(battery.get('voltage'), 'battery voltage')
    _number(battery.get('current'), 'battery current')
    if not 0 <= percent <= 100 or voltage <= 0:
        raise RuntimeError('Battery telemetry is outside valid bounds')
    # sensor_msgs/BatteryState: 1=CHARGING, 2=DISCHARGING,
    # 3=NOT_CHARGING, 4=FULL. Unknown (0) is not permission to move.
    if supply == 1:
        raise RuntimeError('Battery is charging; autonomous reset/readiness refused')
    if supply not in (2, 3, 4):
        raise RuntimeError('Battery supply state is unknown; autonomous reset/readiness refused')


def _load_home_calibration():
    from agentech.robots.navi.movements.home import _load_cell_calibration
    from agentech.robots.navi.movements.cell_motion import _configuration

    config = _load_cell_calibration()
    _configuration(config)
    return config


def _current_run_id(agentech):
    controller = agentech._selected_controller
    if controller is None or controller.dry_run is not False:
        raise RuntimeError("A configured live Navi backend is required")
    with controller._client() as client:
        response = client.call_service('/rosapi/get_param', {'name': '/run_id'}, timeout=controller.timeout)
    try:
        run_id = json.loads(response['value'])
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError("Current ROS boot identity is unavailable") from error
    if not isinstance(run_id, str) or not run_id.strip():
        raise RuntimeError("Current ROS boot identity is invalid")
    return run_id


def verify_home_binding(agentech):
    config = _load_home_calibration()
    if (config.get('schema_version') != 2 or config.get('mode') != 'cell_return_to_home'
            or config.get('motion_enabled') is not True or config.get('motion', {}).get('enabled') is not True):
        raise RuntimeError("Enabled schema-2 home calibration is required")
    run_id = config['motion'].get('run_id')
    if not isinstance(run_id, str) or not run_id.strip() or _current_run_id(agentech) != run_id:
        raise RuntimeError("Current ROS boot identity does not match home calibration")
    return run_id


def _safe_state(state):
    # SDK status includes host/port; receipts must not expose transport config.
    return {field: state[field] for field in
            ('boot_finish', 'robot_ready', 'standing', 'action', 'error', 'warning', 'estop')}


def _verified_receipt(result, run_id):
    if (not isinstance(result, dict) or result.get('succeeded') is not True
            or result.get('damping_completed') is not True or result.get('terminal_state') != 'lowered_damped'
            or result.get('run_id') != run_id):
        raise RuntimeError("Original return-to-home did not provide a verified lowered/damped result")
    elapsed = _number(result.get('elapsed_s'), 'return elapsed seconds')
    position = _number(result.get('position_error_m'), 'return position error')
    heading = _number(result.get('final_heading_error_deg'), 'return heading error')
    if elapsed < 0 or not 0 <= position <= .06 or not 0 <= heading <= 4:
        raise RuntimeError("Return-to-home result exceeds readiness bounds")
    _posture(result.get('final_state'), result.get('final_body_status'), damped=True)
    return {'version': 1, 'ready_for_next_user': True, 'operation': 'return_to_home',
            'succeeded': True, 'damping_completed': True, 'terminal_state': 'lowered_damped',
            'run_id': run_id, 'elapsed_s': elapsed, 'position_error_m': position,
            'final_heading_error_deg': heading, 'final_state': _safe_state(result['final_state'])}


def check_home_ready():
    """Legacy CLI name: read-only session readiness, not home readiness.

    Scheduled movement does not require home calibration, camera matching, a
    boot-bound yaw reference, or a successful return-to-home receipt.
    """
    agentech = configure_navi()
    _battery_guard(agentech)
    state, body, _, _ = _fresh_posture(agentech, allow_relaxed=True)
    if state['action'] == 1:
        evidence = 'operator_confirmed_relaxed_mode'
    else:
        _posture(state, body, damped=True)
        evidence = 'controller_damping'
    _battery_guard(agentech)
    result = {'ready_for_session': True, 'posture': 'lowered_damped',
              'posture_evidence': evidence, 'final_state': _safe_state(state)}
    print('[navi-runner] session-ready verified; return-home not required; '
          +json.dumps(result, separators=(',', ':'), allow_nan=False), flush=True)
    return result


def end_session_cleanup(*, return_home: bool, session_plan: str | None = None, stop_first=False):
    started = time.monotonic()
    if session_plan is not None:
        commands = load_plan(session_plan)
        if return_home and any(command['name'] == 'emergency_stop' for command in commands):
            raise RuntimeError("Session plan contains emergency_stop; autonomous reset refused")
    agentech = configure_navi()
    # Charge/unknown-battery refusal is read-only: do not even issue a stop
    # on an attached charger as a side effect of this preflight failure.
    _battery_guard(agentech)
    try:
        run_id = verify_home_binding(agentech) if return_home else None
        state, _, kind, still = _fresh_posture(agentech, allow_relaxed=not return_home)
        if stop_first:
            agentech.stop()
            state, _, kind, still = _fresh_posture(agentech, allow_relaxed=not return_home)
        if return_home and kind == 'low':
            agentech.stand()
            state, _, kind, still = _fresh_posture(agentech)
            if kind != 'standing':
                raise RuntimeError("Stand did not verify healthy standing before return")
        if kind == 'standing' and (state['action'] == 4 or not still):
            agentech.stop()
            _, _, kind, still = _fresh_posture(agentech)
            if kind != 'standing' or not still:
                raise RuntimeError("Current gait did not stop in healthy bounded standing")
        if return_home:
            print("[navi-runner] booked session ended; Agentech.return_to_home({})", flush=True)
            result = agentech.return_to_home()
            receipt = _verified_receipt(result, run_id)
            current_state, _, _, _ = _fresh_posture(agentech, damped=True)
            receipt['final_state'] = _safe_state(current_state)
            print('[navi-runner] cleanup-result '+json.dumps(receipt, separators=(',', ':'), allow_nan=False), flush=True)
            return receipt
        elif state['action'] != 0 or state['estop'] != 1:
            print("[navi-runner] booked session cleanup; Agentech.damping({})", flush=True)
            agentech.damping()
        current_state, _, _, _ = _fresh_posture(agentech, damped=True)
        receipt = {'version': 1, 'ready_for_next_user': True, 'operation': 'damping',
                   'succeeded': True, 'damping_completed': True, 'home_verified': False,
                   'terminal_state': 'lowered_damped', 'elapsed_s': time.monotonic()-started,
                   'final_state': _safe_state(current_state)}
        print('[navi-runner] cleanup-result '+json.dumps(receipt, separators=(',', ':'), allow_nan=False), flush=True)
        return receipt
    except BaseException:
        try:
            agentech.stop()
        except BaseException:
            pass  # Never replace the reset failure with a secondary stop error.
        raise


def main() -> None:
    if len(sys.argv) == 7 and sys.argv[1] == '--booked-session':
        supervise_booked_session(*sys.argv[2:])
        return
    if len(sys.argv) == 6 and sys.argv[1] == '--cleanup-supervisor':
        supervise_cleanup(*sys.argv[2:])
        return
    if len(sys.argv) == 5 and sys.argv[1] == '--cleanup-attempt':
        run_cleanup_attempt(*sys.argv[2:])
        return
    if len(sys.argv) in (4,6) and sys.argv[1] == '--execute-until':
        execute_until(*sys.argv[2:])
        return
    if len(sys.argv) == 2 and sys.argv[1] == '--check-home-ready':
        with navi_owner(): check_home_ready()
        return
    if len(sys.argv) == 4 and sys.argv[1] == '--return-home-and-damp' and sys.argv[2] == '--session-plan':
        with navi_owner(): end_session_cleanup(return_home=True, session_plan=sys.argv[3])
        return
    if len(sys.argv) == 2 and sys.argv[1] == "--return-home-and-damp":
        with navi_owner(): end_session_cleanup(return_home=True)
        return
    if len(sys.argv) == 2 and sys.argv[1] == "--damp":
        with navi_owner(): end_session_cleanup(return_home=False)
        return
    if len(sys.argv) == 2 and sys.argv[1] == "--lie-down":
        with navi_owner(): end_session_lie_down()
        return
    if len(sys.argv) == 2 and sys.argv[1] == "--stop":
        with navi_owner():
            agentech = configure_navi()
            agentech.stop()
        return
    if len(sys.argv) == 3 and sys.argv[1] == "--validate":
        commands = load_plan(sys.argv[2])
        print(f"validated {len(commands)} Navi commands")
        return
    if len(sys.argv) != 2:
        raise SystemExit(
            "usage: trusted-navi-runner.py PLAN.json | --validate PLAN.json | "
            "--return-home-and-damp [--session-plan PLAN.json] | --check-home-ready | --damp | --lie-down | --stop"
        )
    with navi_owner(): execute(sys.argv[1])


if __name__ == "__main__":
    main()
