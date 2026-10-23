"""Execute an identity-bound literal plan through the existing Master SDK.

This process is a client, never the robot publisher. Expiry/cancellation closes
admission; it never kills the persistent owner or sends a generic stop/damping.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
import uuid

from master_gateway_spec import validate_master_command

MAX_COMMANDS = 200
SHA256 = re.compile(r'^[0-9a-f]{64}$')
MOVEMENT_A_GAP = ('Movement A has no connected live public replay method in the selected current SDK; '
                  'the historical MANIPULATE_DEFAULT launcher is not an approved adapter')
HANDOFF_GAP = ('The current held owner has not been verified for the next session. '
               'Automatic cleanup leaves the existing controller unchanged; a failed, ambiguous or '
               'deliberately replaced owner requires fresh current-state handoff verification. '
               'This does not require an automatic pose return or stiffness change.')


def _timestamp(value):
    if not isinstance(value, str):
        raise ValueError('session timestamp must be an ISO string')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('session timestamp must include timezone')
    return parsed.timestamp()


def _iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat()


def _read_json(path):
    raw = Path(path).read_bytes()
    if len(raw) > 1024 * 1024:
        raise ValueError('Master input exceeds maximum size')
    value = json.loads(raw, parse_constant=lambda value: (_ for _ in ()).throw(ValueError('nonfinite JSON')))
    if not isinstance(value, dict):
        raise ValueError('Master input must be an object')
    return value, hashlib.sha256(raw).hexdigest()


def load_deployment(path):
    config, _ = _read_json(path)
    if config.get('schema_version') != 1 or config.get('robot_model') != 'master' or config.get('enabled') is not True:
        raise ValueError('Master deployment must be explicitly enabled schema 1')
    for key in ('host', 'sdk_root'):
        if not isinstance(config.get(key), str) or not config[key].strip():
            raise ValueError(f'Master deployment requires {key}')
    if not Path(config['sdk_root']).is_absolute():
        raise ValueError('Master sdk_root must be absolute')
    for key, default in (('port', 21274), ('ssh_port', 22)):
        value = config.get(key, default)
        if type(value) is not int or not 1 <= value <= 65535:
            raise ValueError(f'Master {key} is invalid')
    return config


def load_bound_plan(plan_path, config, session_end=None):
    plan, digest = _read_json(plan_path)
    if plan.get('version') != 2 or plan.get('robot_model') != 'master':
        raise ValueError('unsupported Master plan')
    for key in ('session_id', 'attempt_id'):
        if not isinstance(config.get(key), str) or not config[key]:
            raise ValueError(f'Master deployment requires {key}')
    if type(config.get('submission_id')) not in (str, int) or not str(config['submission_id']):
        raise ValueError('Master deployment requires submission_id')
    for key in ('source_sha256', 'plan_sha256'):
        if not SHA256.fullmatch(str(config.get(key, ''))):
            raise ValueError(f'Master {key} is invalid')
    if config['plan_sha256'] != digest:
        raise ValueError('Master plan hash differs from authorized manifest')
    if config['source_sha256'] != plan.get('source_sha256'):
        raise ValueError('Master source hash differs from authorized manifest')
    if str(config['submission_id']) != str(plan.get('submission_id')):
        raise ValueError('Master submission differs from authorized manifest')
    start = _timestamp(config.get('scheduled_start'))
    end = _timestamp(config.get('scheduled_end'))
    if end <= start:
        raise ValueError('Master scheduled end must follow start')
    if session_end is not None and _timestamp(session_end) != end:
        raise ValueError('Master session end differs from authorized manifest')
    commands = plan.get('commands')
    if not isinstance(commands, list) or not 1 <= len(commands) <= MAX_COMMANDS:
        raise ValueError(f'Master plan must contain 1 through {MAX_COMMANDS} commands')
    for command in commands:
        if not isinstance(command, dict) or set(command) - {'name', 'args', 'line', 'source_args'}:
            raise ValueError('invalid Master command record')
        validate_master_command(command.get('name'), command.get('args'))
        if command.get('line') is not None and (type(command['line']) is not int or command['line'] < 1):
            raise ValueError('invalid Master command line')
    return plan, start, end


@contextmanager
def master_lease(path):
    """One gateway client per target, independent of a surviving subprocess."""
    path = Path(path)
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
            raise RuntimeError('another Master gateway client holds the exclusive lease') from error
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt': msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else: fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _atomic_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as handle:
            json.dump(value, handle, allow_nan=False, separators=(',', ':'))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists(): temporary.unlink()


class ExistingOwnerControl:
    """Prevent a normal SDK client helper from bootstrapping an absent owner."""
    def __init__(self, control, adapter):
        self.control, self.adapter = control, adapter

    def inspect_active_ready(self, *, required_sides=('left', 'right')):
        if self.adapter.binding is None:
            owner = self.control.inspect_active_ready(required_sides=required_sides)
        else:
            owner = self.control.inspect_ready_binding(self.adapter.binding, required_sides=required_sides)
        if not isinstance(owner, dict) or owner.get('ownerMode') != 'current-hold' or owner.get('aimdkMcMode') != 'STAND_DEFAULT':
            raise RuntimeError('an existing qualified bilateral raw-STAND current-hold owner is required; no owner was started')
        if self.adapter.binding is None:
            self.adapter.binding = dict(owner)
        return owner

    def ensure_ready(self, *, required_sides=('left', 'right'), **kwargs):
        if getattr(self.adapter, 'entry_in_progress', False) is True:
            return self.control.ensure_ready(required_sides=required_sides, **kwargs)
        return self.inspect_active_ready(required_sides=required_sides)

    def __getattr__(self, name):
        return getattr(self.control, name)


class SDKAdapter:
    def __init__(self, config):
        root = Path(config['sdk_root']).resolve()
        api = root / 'agentech' / 'robots' / 'master' / 'api.py'
        expected = config.get('sdk_api_sha256')
        if not SHA256.fullmatch(str(expected or '')) or not api.is_file() or hashlib.sha256(api.read_bytes()).hexdigest() != expected:
            raise ValueError('Master sdk_api_sha256 must pin the selected existing SDK API')
        for relative, expected_file in config.get('sdk_files_sha256', {}).items():
            path = (root / relative).resolve()
            if not path.is_relative_to(root) or not SHA256.fullmatch(str(expected_file)) or hashlib.sha256(path.read_bytes()).hexdigest() != expected_file:
                raise ValueError('Master SDK file integrity check failed')
        sys.path.insert(0, str(root))
        import agentech
        if not Path(agentech.__file__).resolve().is_relative_to(root):
            raise RuntimeError('another SDK is already imported; refusing mixed deployment')
        from agentech import Master
        password = os.environ.get('AGENTECH_MASTER_SSH_PASSWORD')
        if not password:
            raise ValueError('AGENTECH_MASTER_SSH_PASSWORD is required')
        options = dict(host=config['host'], port=config.get('port', 21274),
            ssh_username=config.get('ssh_username', 'run'), ssh_port=config.get('ssh_port', 22),
            ssh_password=password, relay_url=config.get('relay_url'),
            standing_guided_sides='both')
        self.planner = Master(dry_run=True, **options)
        self.robot = Master(dry_run=False, **options)
        if config.get('standing_deployment') is not None:
            # Use the SDK's existing deployment selection. Its control factory
            # validates the absolute robot path before any bootstrap operation.
            os.environ['AGENTECH_MASTER_STANDING_DEPLOYMENT'] = config['standing_deployment']
        self.binding = None
        self.entry_in_progress = False
        self._owner_factory = self.robot._standing_current_hold_control
        deployment = config.get('standing_deployment')
        if deployment is not None:
            if not isinstance(deployment, str) or not deployment.startswith('/'):
                raise ValueError('standing_deployment must name an existing absolute robot deployment')
            os.environ['AGENTECH_MASTER_STANDING_DEPLOYMENT'] = deployment
        self.robot._standing_current_hold_control = lambda **kwargs: ExistingOwnerControl(self._owner_factory(**kwargs), self)

    def validate(self, commands):
        for command in commands:
            name = command['name']
            if name == 'movement_a': raise RuntimeError(MOVEMENT_A_GAP)
            method = getattr(self.planner, name, None)
            if not callable(method): raise ValueError(f'selected Master SDK has no {name} method')
            plan = method(**command['args'])
            if isinstance(plan, dict) and plan.get('qualificationState') == 'simultaneous-public-call-pending':
                raise RuntimeError('selected SDK supports this upper-body combination as a plan only; live path requires waist plus both_elbows or admitted arm torque')

    def check_ready(self):
        owner = self.robot._standing_current_hold_control().inspect_active_ready(required_sides=('left', 'right'))
        return {**{key: owner.get(key) for key in ('requestId', 'publisherPid', 'ownerMode', 'nativeOwner', 'aimdkMcMode', 'standingState', 'guidedSides', 'nonce')},
                'observed_at': _iso(time.time()), 'sdk_fresh_ready_verified': True}

    def preflight_mode(self):
        owner = self._owner_factory().inspect_active_ready(required_sides=('left', 'right'))
        if owner is None:
            # No launch or mode request here. Existing entry performs its live
            # balance/reference/deployment admission immediately before motion.
            return {'mode_entry_required': True, 'owner': None, 'robot_commands_sent': False}
        self.check_ready()
        return {'mode_entry_required': False, 'owner': self.check_ready(), 'robot_commands_sent': False}

    def _admit(self):
        callback = getattr(self, 'admission_check', None)
        if callback is not None:
            callback()

    def prepare_mode(self):
        self._admit()
        if self.binding is not None:
            return self.check_ready()
        current = self._owner_factory().inspect_active_ready(required_sides=('left', 'right'))
        if current is not None:
            return self.check_ready()
        self.entry_in_progress = True
        try:
            self._admit()
            self.robot.enter_stand_hand_guide('both')
        finally:
            self.entry_in_progress = False
        # Mode acceptance is not enough: the SDK must freshly verify the raw
        # STAND_DEFAULT bilateral owner before any adjustment can dispatch.
        return self.check_ready()

    def execute(self, name, arguments):
        self._admit()
        if name == 'movement_a': raise RuntimeError(MOVEMENT_A_GAP)
        # Bind every top-level SDK call to the same live owner. Each downstream
        # ensure_ready also uses ExistingOwnerControl, closing the bootstrap race.
        # Native stiffness restore has its own stricter no-publisher admission.
        if name == 'enter_stand_hand_guide':
            owner = self.prepare_mode()
            self._admit()
            return {'operation': 'enter-stand-hand-guide', 'rawModeVerified': True,
                    'dry_run': False, 'ownerBinding': owner}
        if name != 'restore_stand_default':
            self.prepare_mode()
        self._admit()
        result = getattr(self.robot, name)(**arguments)
        if isinstance(result, dict) and (result.get('ownerReleased') is True or result.get('ownerReleasedAfterBothReturnsVerified') is True):
            self.binding = None
        return result


def require_completed(name, result):
    if not isinstance(result, dict) or result.get('dry_run') is True or result.get('fault') or result.get('accepted') is False:
        raise RuntimeError('Master result is failed, dry-run, or lacks authoritative evidence')
    if result.get('status') in {'candidate', 'not-qualified'}:
        raise RuntimeError('Master result is an unqualified plan')
    if name == 'enter_stand_hand_guide':
        complete = result.get('rawModeVerified') is True and isinstance(result.get('ownerBinding'), dict)
    elif name == 'restore_stand_hand_guide':
        complete = result.get('upperBodyPoseVerified') is True and result.get('absoluteReturnVerified') is True
    elif name == 'restore_stand_default':
        complete = result.get('succeeded') is True
    elif name in {'adjust_waist', 'return_waist_to_neutral'}:
        complete = result.get('measuredEndpointVerified') is True and result.get('poweredHoldVerified') is True
    elif name == 'adjust_upper_body' and 'armAdjustment' in result:
        require_completed('adjust_both_elbows', result['armAdjustment'])
        require_completed('adjust_waist', result['waistAdjustment'])
        complete = result.get('phase') == 'adjusted-hold'
    else:
        complete = result.get('endpointVerified') is True or (
            result.get('phase') == 'adjusted-hold' and result.get('accepted') is True
            and isinstance(result.get('requestId'), str) and type(result.get('nonce')) is int
            and type(result.get('publisherPid')) is int)
    if not complete:
        raise RuntimeError('Master command did not return a verified measured endpoint; hold preserved and request not retried')


def preflight(plan_path, deployment_path, *, session_end=None, adapter_factory=SDKAdapter):
    config = load_deployment(deployment_path)
    plan, _, _ = load_bound_plan(plan_path, config, session_end)
    if any(command['name'] == 'movement_a' for command in plan['commands']):
        raise RuntimeError(MOVEMENT_A_GAP)
    adapter = adapter_factory(config)
    adapter.validate(plan['commands'])
    return {'ready': True, 'robot_model': 'master', **adapter.preflight_mode(),
            'plan_sha256': config['plan_sha256'], 'robot_commands_sent': False}


def execute_plan(plan_path, deployment_path, result_file, *, session_end=None, cancel_file=None,
                 adapter_factory=SDKAdapter, now=time.time):
    config = load_deployment(deployment_path)
    plan, start, end = load_bound_plan(plan_path, config, session_end)
    receipt = dict(schema_version=1, robot_model='master', outcome='failed',
        session_id=config['session_id'], submission_id=config['submission_id'],
        source_sha256=config['source_sha256'], plan_sha256=config['plan_sha256'],
        attempt_id=config['attempt_id'], booked_end=config['scheduled_end'],
        command_count=len(plan['commands']), completed_count=0, commands=[], error=None,
        started_at=_iso(now()), finished_at=None, handoff_ready=False,
        owner_hold_preserved=True, owner_hold_verified=False, handoff_blocker=HANDOFF_GAP)
    def admitted():
        if cancel_file is not None and Path(cancel_file).exists():
            raise RuntimeError('Master session cancelled; no further command admitted')
        current = now()
        if current < start: raise RuntimeError('Master scheduled session has not started')
        if current >= end: raise RuntimeError('Master scheduled session expired; no further command admitted')
    target_key = hashlib.sha256(config['host'].encode()).hexdigest()[:20]
    lease = Path(config.get('lease_file', Path(tempfile.gettempdir()) / f'agentech-master-{target_key}.lock'))
    active = None
    try:
        admitted()
        if any(command['name'] == 'movement_a' for command in plan['commands']):
            raise RuntimeError(MOVEMENT_A_GAP)
        with master_lease(lease):
            adapter = adapter_factory(config)
            adapter.admission_check = admitted
            adapter.validate(plan['commands'])
            admitted()
            if plan['commands'][0]['name'] != 'restore_stand_default':
                adapter.prepare_mode()
                receipt['owner_binding'] = adapter.check_ready()
            for index, command in enumerate(plan['commands'], 1):
                admitted()
                active = dict(command_index=index, name=command['name'], args=command['args'],
                    source_args=command.get('source_args', command['args']), line=command.get('line'),
                    status='failed', result=None, error=None, started_at=_iso(now()), duration_ms=0)
                tick = time.monotonic()
                try:
                    result = adapter.execute(command['name'], command['args'])
                    active['result'] = result
                    require_completed(command['name'], result)
                    active.update(result=result, status='completed')
                    receipt['completed_count'] += 1
                    if result.get('ownerReleased') is True or result.get('ownerReleasedAfterBothReturnsVerified') is True:
                        receipt['owner_hold_preserved'] = False
                    receipt['commands'].append(active)
                    active = None
                finally:
                    record = active if active is not None else receipt['commands'][-1]
                    record['duration_ms'] = max(0, (time.monotonic()-tick)*1000)
            receipt['outcome'] = 'completed'
            # Observation never changes ownership. A returned SDK call alone is
            # not evidence that the prior hold remains healthy at session end.
            try:
                receipt['final_owner_binding'] = adapter.check_ready()
                receipt['owner_hold_verified'] = True
                initial, final = receipt.get('owner_binding'), receipt['final_owner_binding']
                if (isinstance(initial, dict) and isinstance(final, dict)
                    and all(initial.get(key) == final.get(key) and final.get(key) is not None
                            for key in ('requestId', 'publisherPid', 'ownerMode'))
                    and final.get('ownerMode') == 'current-hold'
                    and final.get('aimdkMcMode') == 'STAND_DEFAULT'
                    and final.get('nativeOwner') == 'native-mc'
                    and final.get('sdk_fresh_ready_verified') is True):
                    receipt.update(handoff_ready=True, handoff_mode='retained-hold', handoff_blocker=None)
            except Exception as error:
                receipt['hold_observation_error'] = {'type': type(error).__name__, 'message': str(error)}
                if receipt['owner_hold_preserved']:
                    receipt['outcome'] = 'failed'
                    receipt['error'] = {**receipt['hold_observation_error'], 'command': 'verify_master_hold'}
                else:
                    receipt['owner_release_verified'] = True
    except Exception as error:
        failure = {'type': type(error).__name__, 'message': str(error)}
        if active is not None:
            failure.update(command=active['name'], command_index=active['command_index'])
            if active['line'] is not None: failure['line'] = active['line']
            active['error'] = failure
            receipt['commands'].append(active)
        receipt['error'] = failure
    receipt['finished_at'] = _iso(now())
    receipt['overrun_seconds'] = max(0, now()-end)
    _atomic_json(result_file, receipt)
    return receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--plan')
    parser.add_argument('--deployment', required=True)
    parser.add_argument('--result-file')
    parser.add_argument('--session-end')
    parser.add_argument('--cancel-file')
    parser.add_argument('--check-ready', action='store_true')
    args = parser.parse_args()
    if args.check_ready:
        if not args.plan: parser.error('--plan is required for plan-bound readiness')
        print(json.dumps(preflight(args.plan, args.deployment, session_end=args.session_end)))
        return 0
    if not args.plan or not args.result_file:
        parser.error('--plan and --result-file are required for execution')
    receipt = execute_plan(args.plan, args.deployment, args.result_file,
        session_end=args.session_end, cancel_file=args.cancel_file)
    print(json.dumps({'outcome': receipt['outcome'], 'handoff_ready': receipt['handoff_ready']}))
    return 0 if receipt['outcome'] == 'completed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
