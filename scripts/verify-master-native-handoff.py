"""Observe current native control after a failed native booking without replaying it."""
from __future__ import annotations

import argparse
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import re
import tempfile
import time

spec = importlib.util.spec_from_file_location('native_handoff_runner', Path(__file__).with_name('trusted-master-runner.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

READY_FLAGS = ('noActivePublisher', 'sdk_fresh_ready_verified',
    'standingStateVerified', 'nativeCommandOwnersVerified', 'nativeBalanceEvidenceVerified',
    'completeArmCommandFrameVerified', 'completeArmStateFrameVerified')
SIGNING_DOMAIN = 'EAIC/Master/native-control-handoff/v1'


def native_control(binding):
    return (isinstance(binding, dict)
        and ((binding.get('ownerMode') == 'native-standing' and binding.get('presetActionsReady') is True)
             or (binding.get('ownerMode') == 'native-hold' and binding.get('presetActionsReady') is False))
        and binding.get('nativeOwner') == 'native-mc' and binding.get('aimdkMcMode') == 'STAND_DEFAULT'
        and all(binding.get(key) is True for key in READY_FLAGS)
        and type(binding.get('manipulationPublishers')) is int and binding['manipulationPublishers'] == 0
        and not binding.get('fault') and binding.get('requestId') is None and binding.get('publisherPid') is None)


def target_digest(config):
    identity = [config['host'], config.get('port', 21274), config.get('ssh_port', 22), config.get('ssh_username', 'run')]
    return hashlib.sha256(json.dumps(identity, separators=(',', ':')).encode()).hexdigest()


def bounded(path, cap):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= cap:
        raise ValueError('Invalid native handoff artifact path or size')
    with path.open('rb') as stream:
        raw = stream.read(cap+1)
    if len(raw) > cap:
        raise ValueError('Native handoff artifact exceeds bound')
    return raw


def terminal_zero_task(client):
    """Correlate unkeyed service state with two live native standing timestamps."""
    from master_native_gesture_readiness import stamp_ns
    def standing():
        packet = client.get_mode()
        if (type(packet.get('code')) is not int or packet['code'] != 0 or packet.get('action_desc') != 'STAND_DEFAULT'
                or type(packet.get('status')) is not int or packet['status'] != 100):
            raise ValueError('Native standing mode unavailable during terminal observation')
        return stamp_ns(packet['stamp'])
    started = time.monotonic()
    before = standing()
    task = client.get_preset_state(0)
    after = standing()
    if (type(task.get('code')) is not int or task['code'] != 0 or type(task.get('task_id')) is not int
            or task['task_id'] != 0 or type(task.get('state')) is not int or task['state'] != 1):
        raise ValueError('Unkeyed native task has no verified terminal state')
    native = stamp_ns(task['stamp'])
    if not (before <= native <= after and 0 < after-before <= 1_000_000_000 and time.monotonic()-started <= 1):
        raise ValueError('Unkeyed task timestamp is stale or uncorrelated')
    return {'task':0,'state':1,'before_ns':str(before),'terminal_ns':str(native),'after_ns':str(after)}


def check_idle(root, cfg, waiting_session=None):
    records = json.loads(bounded(root/'state.json',64*1024*1024))['sessions']
    row = records[cfg['session_id']]
    if (row.get('executionAttemptId') != cfg['attempt_id'] or row.get('executionStatus') != 'failed'
            or row.get('status') != 'finished' or row.get('masterHandoffReady') is not False):
        raise ValueError('Historical Master attempt changed')
    if waiting_session is not None:
        waiting = records.get(waiting_session, {})
        if (waiting_session == cfg['session_id'] or waiting.get('executionModel') != 'master'
                or waiting.get('status') != 'staged' or waiting.get('executionAttemptId') or waiting.get('pid')
                or waiting.get('endCleanupStatus') == 'running' or time.time() >= runner._timestamp(waiting['end'])
                or runner._timestamp(waiting['start']) < runner._timestamp(row['end'])):
            raise ValueError('The waiting Master booking changed or already owns a runner')
    if any(r.get('executionModel') == 'master' and (r.get('status') in {'staged','running','publishing'} or
           r.get('endCleanupStatus') == 'running') for i,r in records.items() if i != waiting_session):
        raise ValueError('Another Master session owns the gateway')

def check_observations(first, current, heart, started, finished):
    for binding in (first,current):
        if (not native_control(binding) or binding.get('nativeGestureOwnerVerified') is not True or
                binding.get('nativeMotionIdleVerified') is not True or
                (heart and binding.get('heartStartPoseVerified') is not True)):
            raise ValueError('Native ownership, idle player or required Heart start pose was not verified')
    left,right = first['nativeIdleObservation'],current['nativeIdleObservation']
    keys = ('inputSource','mcNode','bootId','installedBuild','waistReference') if heart else ('inputSource',)
    for key in keys:
        if not isinstance(left.get(key),str) or not left[key] or left[key] != right.get(key):
            raise ValueError('Native observations disagree on '+key)
    if right['firstSequence'] <= left['lastSequence']:
        raise ValueError('Native observation sequences overlap')
    # Both bindings are ISO timestamps with microsecond precision. Compare
    # the window endpoints at that same precision (rounding is not extra time).
    def instant(epoch): return runner._timestamp(runner._iso(epoch))
    if not (0 <= finished-started <= 90 and instant(started) <= runner._timestamp(first['observed_at'])
            < runner._timestamp(current['observed_at']) <= instant(finished)):
        raise ValueError('Native observation timestamps are outside the live measurement window')


def failed_body_package(config,plan,failed):
    import master_native_body as body
    body.validate(config,plan)
    package = dict(asset_id=plan['asset_id'],zip_sha256=body.SPEC['zip'],policy_sha256=body.SPEC['policy'],
                   audio_sha256=body.SPEC['audio'],serial=body.SPEC['serial'])
    records = failed.get('commands')
    if not isinstance(records,list) or len(records) != 1:
        raise ValueError('Failed native body receipt has no unique playback record')
    cmd = records[0]
    result, initial, error = cmd.get('result') or {}, failed.get('owner_binding') or {}, failed.get('error') or {}
    if (failed.get('command_count') != 1 or failed.get('completed_count') != 0 or failed.get('handoff_ready') is not False
            or failed.get('owner_hold_preserved') is not False or failed.get('owner_hold_verified') is not False
            or initial.get('mode') != 'STAND_DEFAULT' or initial.get('player') != 0 or initial.get('settled') is not True
            or not re.fullmatch(r'mc_ros2_node\d+',initial.get('owner','')) or cmd.get('command_index') != 1
            or cmd.get('line') != 1 or cmd.get('status') != 'failed' or cmd.get('name') != 'play_body'
            or cmd.get('args') != body.ARGS or cmd.get('source_args') != body.ARGS or not isinstance(cmd.get('error'),dict)
            or not error.get('type') or not error.get('message') or any(cmd['error'].get(k)!=error[k] for k in ('type','message'))
            or error.get('command','play_body') != 'play_body' or error.get('command_index',1) != 1
            or any(result.get(k) != v for k,v in package.items()) or result.get('bundled_audio') != 'audio.wav'
            or result.get('request_attempted') is not True or result.get('play_response') != 'Play success'):
        raise ValueError('Failed native body receipt does not identify the accepted, pinned playback')
    start,call,finish = (runner._timestamp(t) for t in (failed['started_at'],cmd['sdk_call_started_at'],failed['finished_at']))
    if not (runner._timestamp(config['scheduled_start']) <= start <= call <= finish and call < runner._timestamp(config['scheduled_end'])):
        raise ValueError('Body request timestamp is outside the failed booked attempt')
    return package


def observe_body_window(config,now):
    import master_native_body as body
    # Each connection verifies the pinned SSH host key and hashes the installed ONNX/WAV.
    with body.connection(config) as client, body.observer(client,handoff=True) as (binding,_):
        return {**binding,'observed_at':runner._iso(now())}


def check_body_windows(first,last,package,started,finished):
    from master_body_observer import JOINTS,STREAMS
    for binding in (first,last):
        before,after = int(binding['mode_before_ns']),int(binding['mode_after_ns'])
        owner = binding['owner']
        if (not re.fullmatch(r'mc_ros2_node\d+',owner) or binding['serial'] != package['serial'] or not binding['boot_id']
                or not binding['receiver_id'] or not binding['input_source'].strip() or binding['mode'] != 'STAND_DEFAULT'
                or binding['status'] != 100 or binding['body'] != 1 or binding['player'] != 0 or binding['motion'] != ''
                or binding['settled'] is not True or binding['mc_body_pose_subscriber'] is not True or binding['hand_types'] != [0,0]
                or binding['manipulation_publishers'] != 0 or binding['competing_body_pose_publishers'] != 0
                or binding['command_owners'] != {k:owner for k in (*JOINTS,'hand','mc')} or not 400 <= binding['dwell_ms'] <= 6000
                or not 0 < before < after <= before+6_000_000_000 or set(binding['frames']) != set(STREAMS)):
            raise ValueError('Native body player, receiver or exclusive command ownership was not verified')
        for stream in STREAMS:
            frame = binding['frames'][stream]
            a,b = int(frame['first_ns']),int(frame['last_ns'])
            if not (before < a < b <= after and b-a >= 400_000_000 and after-b <= 150_000_000
                    and frame['count'] >= 3 and 0 < frame['max_gap_ms'] <= 150):
                raise ValueError(f'Incomplete native body source timestamps for {stream}')
        for group,expected in JOINTS.items():
            sample = binding['joints'][group]
            if (sorted(sample['names']) != sorted(expected) or sample['frame_state'] != 0 or sample['max_error_code'] != 0
                    or not 0 <= sample['peak_velocity'] < .12):
                raise ValueError('Invalid or unsettled current body joints: '+group)
        for key in ('chest','torso'):
            imu = binding['imus'][key]
            if not (8 < imu['min_acc'] <= imu['max_acc'] < 11.5 and 0 <= imu['peak_gyro'] < .15):
                raise ValueError('Invalid or unsettled current body IMU: '+key)
    if (first['receiver_id'] == last['receiver_id'] or int(first['mode_after_ns']) >= int(last['mode_before_ns'])
            or any(first[k] != last[k] for k in ('owner','boot_id','input_source','serial'))
            or not (0 <= finished-started <= 90 and runner._timestamp(runner._iso(started)) <= runner._timestamp(first['observed_at'])
                    < runner._timestamp(last['observed_at']) <= runner._timestamp(runner._iso(finished)))):
        raise ValueError('Native body receivers did not independently observe the same settled controller')


def verify_native_handoff(plan_path, deployment_path, failed_result, output, *,
                          adapter_factory=runner.SDKAdapter, now=time.time, waiting_session=None):
    config = runner.load_deployment(deployment_path)
    gateway = Path(__file__).resolve().parent.parent
    # The release checkout can run this read-only tool without replacing a live
    # bridge. Anchor every input/output to the operator-selected installed config.
    selected_path = os.environ.get('AGENTECH_MASTER_DEPLOYMENT_FILE')
    if selected_path:
        target = Path(selected_path).resolve(strict=True)
        if (target.name, target.parent.name) != ('master-deployment.json', 'master-config'):
            raise ValueError('Unrecognized installed Master configuration')
        gateway = target.parent.parent
    root = gateway/'.robot-stream-runtime'
    active_path = gateway/'master-config/master-deployment.json'
    active_bytes = bounded(active_path,1024*1024)
    selected = json.loads(active_bytes.decode('utf-8-sig'))
    if waiting_session is not None:
        if not re.fullmatch(r'\d+', waiting_session):
            raise ValueError('Invalid waiting Master booking')
        # Use only the installed SDK on the same historical robot and lease.
        # The canonical historical manifest and the checks below bind both.
        config = {**config, **selected}
    session_id,attempt = config.get('session_id'),config.get('attempt_id')
    if (not isinstance(session_id,str) or not re.fullmatch(r'\d+',session_id) or
        not isinstance(attempt,str) or not re.fullmatch(r'[A-Za-z0-9-]{1,128}',attempt)
        or any(config.get(k) != value for k,value in selected.items())):
        raise ValueError('Observation must use the current selected Master deployment')
    base = f'session-{session_id}.{attempt}'
    if waiting_session is not None and Path(deployment_path).resolve() != root/(base+'.master.json'):
        raise ValueError('The automatic verifier requires the canonical prior deployment')
    expected = (root/f'session-{session_id}.plan.json', root/f'{base}.master-result.json',
                root/'master-native-handoffs'/f"{base}.{config['sdk_api_sha256'][:12]}.json")
    if any(Path(p).resolve() != target for p,target in zip((plan_path,failed_result,output),expected)):
        raise ValueError('Observation must use the canonical historical gateway paths')
    origin = json.loads(bounded(root/(base+'.master.json'),1024*1024))
    if any(origin.get(k)!=config.get(k) for k in ('session_id','attempt_id','submission_id','plan_sha256','source_sha256',
        'scheduled_start','scheduled_end','host','port','ssh_port','ssh_username','relay_url','lease_file','standing_deployment','native_body_asset_id')):
        raise ValueError('Historical deployment and command identity do not agree')
    check_idle(root,config,waiting_session)
    plan, _, end = runner.load_bound_plan(plan_path, config)
    started = now()
    if started < end: raise ValueError('Native handoff requires an expired booking')
    if Path(output).exists(): raise ValueError('Native handoff proof already exists; preserve its audit record')
    derived = os.environ.get('AGENTECH_MASTER_HANDOFF_SIGNING_KEY_V1')
    if derived is not None:
        if not re.fullmatch(r'[0-9a-fA-F]{64}',derived):
            raise ValueError('Invalid scoped Master handoff signing key')
        key = bytes.fromhex(derived)
    else:
        secret = os.environ.get('AGENTECH_MASTER_HANDOFF_EVIDENCE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
        if len(secret.encode()) < 32:
            raise ValueError('Master native handoff producer signing key is unavailable')
        key = hmac.digest(secret.encode(), SIGNING_DOMAIN.encode(), 'sha256')
    raw = bounded(failed_result,16*1024*1024)
    failed = json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite receipt')))
    if not isinstance(failed, dict): raise ValueError('Failed Master receipt must be an object')
    identities = ('session_id', 'attempt_id', 'submission_id', 'source_sha256', 'plan_sha256')
    if (any(failed.get(key) != config[key] for key in identities)
        or failed.get('robot_model') != 'master' or failed.get('outcome') != 'failed'
        or failed.get('booked_end') != config['scheduled_end']
        or runner._timestamp(failed.get('finished_at')) > started):
        raise ValueError('Native handoff requires the exact expired failed attempt')
    body_package = None
    if config.get('native_body_asset_id'):
        if Path(deployment_path).resolve() != root/(base+'.master.json'):
            raise ValueError('Body handoff requires the canonical failed deployment')
        body_package = failed_body_package(config,plan,failed)
    else:
        if not native_control(failed.get('owner_binding')):
            raise ValueError('Initial native ownership was not verified')
        allowed = {'native_preset', 'native_head', 'passive'}
        if any(runner.MASTER_COMMANDS[c['name']]['backend'] not in allowed for c in plan['commands']):
            raise ValueError('Raw guidance, golf and retained publishers require their separate qualified recovery')
    records = failed.get('commands')
    if (failed.get('command_count') != len(plan['commands']) or not isinstance(records, list)
        or not records or len(records) > len(plan['commands'])
        or any(c.get('name') != plan['commands'][i]['name'] or c.get('command_index') != i+1
               or c.get('status') not in {'completed', 'failed'} for i,c in enumerate(records))
        or any(c['status'] != 'completed' for c in records[:-1])):
        raise ValueError('Native handoff receipt is not a contiguous prefix of the authorized program')
    error = failed.get('error', {})
    if not body_package and (not isinstance(error, dict) or error.get('command') not in {records[-1]['name'], 'verify_master_hold'}
        or (records[-1]['status'] == 'completed' and error.get('command') != 'verify_master_hold')):
        raise ValueError('Native handoff requires an identified failed native command or final observation')
    target_key = hashlib.sha256(config['host'].encode()).hexdigest()[:20]
    lease = Path(config.get('lease_file', Path(tempfile.gettempdir())/f'agentech-master-{target_key}.lock'))
    with runner.master_lease(lease):
        # Verify the prior animation is idle without moving Master. The next
        # booking performs its own fresh, command-specific admission.
        check_idle(root,config,waiting_session)
        terminal = None
        if body_package:
            first = observe_body_window(config,now)
            check_idle(root,config,waiting_session)
            current = observe_body_window(config,now)
            finished = now()
            check_body_windows(first,current,body_package,started,finished)
        else:
            adapter = adapter_factory(config)
            heart = any(c['name']=='heart' for c in plan['commands'])
            first = adapter.native_gesture_ready(include_heart=heart)
            if error.get('command') == 'heart' and error.get('message') == 'SetMcPresetMotion returned invalid task id 0':
                with adapter.robot._client() as client:
                    terminal = terminal_zero_task(client)
            current = adapter.native_gesture_ready(include_heart=heart)
            finished = now()
            check_observations(first,current,heart,started,finished)
        check_idle(root,config,waiting_session)
        if (bounded(failed_result,16*1024*1024) != raw or bounded(active_path,1024*1024) != active_bytes
                or json.loads(bounded(root/(base+'.master.json'),1024*1024)) != origin):
            raise ValueError('The failed receipt or selected deployment changed during observation')
        runner.load_bound_plan(plan_path, config)
        report = dict(schema_version=1, kind='native-control-handoff', robot_model='master',
            previous_session_id=str(config['session_id']), previous_attempt_id=config['attempt_id'],
            submission_id=config['submission_id'], source_sha256=config['source_sha256'],
            plan_sha256=config['plan_sha256'], failed_result_sha256=hashlib.sha256(raw).hexdigest(),
            sdk_api_sha256=config['sdk_api_sha256'], target_sha256=target_digest(config),
            observed_at=runner._iso(finished), native_binding_before=first,native_binding=current,unkeyed_terminal=terminal, read_only=True,
            robot_commands_sent=False, failed_outcome_preserved=True)
        if body_package:
            report['body_package'] = body_package
        payload = json.dumps(report, separators=(',', ':'), allow_nan=False)
        envelope = {'format': SIGNING_DOMAIN, 'payload': payload,
                    'signature': hmac.new(key, payload.encode(), 'sha256').hexdigest()}
        # Publish once without replacing a prior proof, even if a second writer
        # creates the destination while this process is observing the controller.
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf8', dir=Path(output).parent, delete=False) as temp:
                temporary = Path(temp.name)
                json.dump(envelope, temp, separators=(',', ':'), allow_nan=False)
                temp.flush()
                os.fsync(temp.fileno())
            os.link(temporary, output)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('plan','deployment','failed-result','output'):
        parser.add_argument('--'+name, required=True)
    parser.add_argument('--waiting-session')
    args = parser.parse_args()
    proof = verify_native_handoff(args.plan,args.deployment,args.failed_result,args.output,waiting_session=args.waiting_session)
    print(json.dumps(dict(handoff_verified=True, session_id=proof['previous_session_id'],
        read_only=True, robot_commands_sent=False, failed_outcome_preserved=True)))


if __name__ == '__main__': main()
