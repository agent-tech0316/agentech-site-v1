"""Observe native standing after an expired failed preset. Never replay it."""
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


def check_idle(root, cfg):
    records = json.loads(bounded(root/'state.json',64*1024*1024))['sessions']
    row = records[cfg['session_id']]
    if (row.get('executionAttemptId') != cfg['attempt_id'] or row.get('executionStatus') != 'failed'
            or row.get('status') != 'finished' or row.get('masterHandoffReady') is not False):
        raise ValueError('Historical Master attempt changed')
    if any(r.get('executionModel') == 'master' and (r.get('status') in {'staged','running','publishing'} or
           r.get('endCleanupStatus') == 'running') for r in records.values()):
        raise ValueError('Another Master session owns the gateway')


def verify_native_handoff(plan_path, deployment_path, failed_result, output, *,
                          adapter_factory=runner.SDKAdapter, now=time.time):
    config = runner.load_deployment(deployment_path)
    gateway = Path(__file__).resolve().parent.parent
    root = gateway/'.robot-stream-runtime'
    active_path = gateway/'master-config/master-deployment.json'
    active_bytes = bounded(active_path,1024*1024)
    selected = json.loads(active_bytes.decode('utf-8-sig'))
    session_id,attempt = config.get('session_id'),config.get('attempt_id')
    if (not isinstance(session_id,str) or not re.fullmatch(r'\d+',session_id) or
        not isinstance(attempt,str) or not re.fullmatch(r'[A-Za-z0-9-]{1,128}',attempt)
        or any(config.get(k) != value for k,value in selected.items())):
        raise ValueError('Observation must use the current selected Master deployment')
    base = f'session-{session_id}.{attempt}'
    expected = (root/f'session-{session_id}.plan.json', root/f'{base}.master-result.json',
                root/'master-native-handoffs'/f"{base}.{config['sdk_api_sha256'][:12]}.json")
    if any(Path(p).resolve() != target for p,target in zip((plan_path,failed_result,output),expected)):
        raise ValueError('Observation must use the canonical historical gateway paths')
    origin = json.loads(bounded(root/(base+'.master.json'),1024*1024))
    if any(origin.get(k)!=config.get(k) for k in ('session_id','attempt_id','submission_id','plan_sha256','source_sha256',
        'scheduled_start','scheduled_end','host','port','ssh_port','ssh_username','relay_url','lease_file','standing_deployment')):
        raise ValueError('Historical deployment and command identity do not agree')
    check_idle(root,config)
    plan, _, end = runner.load_bound_plan(plan_path, config)
    started = now()
    if started < end: raise ValueError('Native handoff requires an expired booking')
    if Path(output).exists(): raise ValueError('Native handoff proof already exists; preserve its audit record')
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
        or runner._timestamp(failed.get('finished_at')) > started
        or not native_control(failed.get('owner_binding'))):
        raise ValueError('Native handoff requires the exact failed attempt with verified initial native ownership')
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
    if (not isinstance(error, dict) or error.get('command') not in {records[-1]['name'], 'verify_master_hold'}
        or (records[-1]['status'] == 'completed' and error.get('command') != 'verify_master_hold')):
        raise ValueError('Native handoff requires an identified failed native command or final observation')
    target_key = hashlib.sha256(config['host'].encode()).hexdigest()[:20]
    lease = Path(config.get('lease_file', Path(tempfile.gettempdir())/f'agentech-master-{target_key}.lock'))
    with runner.master_lease(lease):
        adapter = adapter_factory(config)
        # Verify the prior animation is idle without moving Master. The next
        # booking performs its own fresh, command-specific admission.
        check_idle(root,config)
        heart = any(c['name']=='heart' for c in plan['commands'])
        first = adapter.native_gesture_ready(include_heart=heart)
        terminal = None
        if error.get('command') == 'heart' and error.get('message') == 'SetMcPresetMotion returned invalid task id 0':
            with adapter.robot._client() as client:
                terminal = terminal_zero_task(client)
        current = adapter.native_gesture_ready(include_heart=heart)
        finished = now()
        left,right = first['nativeIdleObservation'],current['nativeIdleObservation']
        keys = ('inputSource','mcNode','bootId','installedBuild','waistReference') if heart else ('inputSource',)
        if (not all(native_control(x) and x.get('nativeGestureOwnerVerified') is True and x.get('nativeMotionIdleVerified') is True
                    and (not heart or x.get('heartStartPoseVerified') is True) for x in (first,current))
            or not all(isinstance(left.get(k),str) and left[k] and left[k] == right.get(k) for k in keys)
            or right['firstSequence'] <= left['lastSequence'] or not started <= runner._timestamp(first.get('observed_at'))
                < runner._timestamp(current.get('observed_at')) <= finished or not 0 <= finished-started <= 90):
            raise ValueError('Fresh qualified native ownership is required; no robot command was sent')
        check_idle(root,config)
        if bounded(failed_result,16*1024*1024) != raw or bounded(active_path,1024*1024) != active_bytes:
            raise ValueError('The failed receipt or selected deployment changed during observation')
        runner.load_bound_plan(plan_path, config)
        report = dict(schema_version=1, kind='native-control-handoff', robot_model='master',
            previous_session_id=str(config['session_id']), previous_attempt_id=config['attempt_id'],
            submission_id=config['submission_id'], source_sha256=config['source_sha256'],
            plan_sha256=config['plan_sha256'], failed_result_sha256=hashlib.sha256(raw).hexdigest(),
            sdk_api_sha256=config['sdk_api_sha256'], target_sha256=target_digest(config),
            observed_at=runner._iso(finished), native_binding_before=first,native_binding=current,unkeyed_terminal=terminal, read_only=True,
            robot_commands_sent=False, failed_outcome_preserved=True)
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
    args = parser.parse_args()
    proof = verify_native_handoff(args.plan,args.deployment,args.failed_result,args.output)
    print(json.dumps(dict(handoff_verified=True, session_id=proof['previous_session_id'],
        read_only=True, robot_commands_sent=False, failed_outcome_preserved=True)))


if __name__ == '__main__': main()
