"""Execute an identity-bound literal plan through the existing Master SDK.

This process is a client, never the robot publisher. Expiry/cancellation closes
admission; it never kills the persistent owner or sends a generic stop/damping.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
import uuid

from master_gateway_spec import MASTER_COMMANDS, validate_master_command, validate_master_plan

MAX_COMMANDS = 200
SHA256 = re.compile(r'^[0-9a-f]{64}$')
HANDOFF_GAP = ('The current held owner has not been verified for the next session. '
               'Automatic cleanup leaves the existing controller unchanged; a failed, ambiguous or '
               'deliberately replaced owner requires fresh current-state handoff verification. '
               'This does not require an automatic pose return or stiffness change.')


def _timestamp(value):
    if not isinstance(value, str):
        raise ValueError('session timestamp must be an ISO string')
    # Postgres omits trailing fractional zeroes; Python 3.10 accepts only
    # three or six digits. Pad, without changing the instant or timezone.
    normalized = re.sub(r'(?<=\d{2}:\d{2}:\d{2})\.(\d{1,6})(?=Z|[+-]|$)',
        lambda match: '.' + match.group(1).ljust(6, '0'), value)
    parsed = datetime.fromisoformat(normalized.replace('Z', '+00:00'))
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
        if not isinstance(command, dict) or set(command) - {'name', 'args', 'line', 'source_args', 'save_result_as'}:
            raise ValueError('invalid Master command record')
        validate_master_command(command.get('name'), command.get('args'))
        if command.get('line') is not None and (type(command['line']) is not int or command['line'] < 1):
            raise ValueError('invalid Master command line')
    validate_master_plan(commands)
    if config.get('recovery_owner_binding') is not None and (len(commands) != 1 or commands[0]['name'] != 'restore_stand_hand_guide'):
        raise ValueError('failed-session recovery permits only an explicit full upper-body restore')
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
        self.config = config
        self._movement_a = None
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
        from agentech.robots.master.standing_current_hold_control import StandingOwnerNotReady
        self._owner_not_ready = StandingOwnerNotReady
        password = os.environ.get('AGENTECH_MASTER_SSH_PASSWORD')
        if not password:
            raise ValueError('AGENTECH_MASTER_SSH_PASSWORD is required')
        options = dict(host=config['host'], port=config.get('port', 21274),
            ssh_username=config.get('ssh_username', 'run'), ssh_port=config.get('ssh_port', 22),
            ssh_password=password, relay_url=config.get('relay_url'),
            standing_guided_sides='both', seated_timeout=180.0)
        # This bounds client acknowledgment waiting, not motion speed or force.
        # Default adaptive trajectories may outlast the SDK's 25-second client
        # default. Never retry a relative command after an ambiguous timeout.
        self.planner = Master(dry_run=True, **options)
        self.robot = Master(dry_run=False, **options)
        if config.get('standing_deployment') is not None:
            # Use the SDK's existing deployment selection. Its control factory
            # validates the absolute robot path before any bootstrap operation.
            os.environ['AGENTECH_MASTER_STANDING_DEPLOYMENT'] = config['standing_deployment']
        self.binding = None
        self.explicit_raw_entry = False
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
            if name == 'movement_a':
                self.movement_a_adapter()
                continue
            method = getattr(self.planner, name, None)
            if not callable(method): raise ValueError(f'selected Master SDK has no {name} method')
            # These SDK methods perform real observations even on a dry client.
            # Undo requires the signed live result from this exact SDK instance.
            if name in {'status', 'get_status', 'get_motion_readiness', 'action_catalog', 'undo_waist'}:
                continue
            plan = method(**command['args'])
            if isinstance(plan, dict) and plan.get('qualificationState') == 'simultaneous-public-call-pending':
                raise RuntimeError('selected SDK supports this upper-body combination as a plan only; live path requires waist plus both_elbows or admitted arm torque')

    def movement_a_adapter(self):
        if self._movement_a is None:
            spec = importlib.util.spec_from_file_location('_master_gateway_movement_a',
                Path(__file__).with_name('master-movement-a-adapter.py'))
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            self._movement_a = module.MovementAAdapter(self.config,
                inspect_owner=lambda: self._owner_factory().inspect_active_ready(required_sides=('right',)),
                admission_check=self._admit)
        return self._movement_a

    def native_ready(self, *, require_presets=True):
        evidence = self.robot.get_motion_readiness()
        if (not isinstance(evidence, dict) or evidence.get('aimdkMcMode') != 'STAND_DEFAULT'
            or evidence.get('manipulationPublishers') != 0
            or any(evidence.get(key) is not True for key in ('standingStateVerified', 'nativeCommandOwnersVerified',
                'nativeBalanceEvidenceVerified', 'completeArmCommandFrameVerified', 'completeArmStateFrameVerified'))
            or evidence.get('fault')):
            raise RuntimeError('Master native standing ownership and fresh telemetry are not verified')
        presets = evidence.get('presetActionsReady') is True and evidence.get('standingStateVerified') is True
        if require_presets and not presets:
            raise RuntimeError(evidence.get('readinessReason') or 'Master native presets require verified native standing; explicit restoration may be needed')
        return {**evidence, 'ownerMode': 'native-standing' if presets else 'native-hold',
            'nativeOwner': 'native-mc', 'noActivePublisher': True,
            'observed_at': _iso(time.time()), 'sdk_fresh_ready_verified': True}

    def check_ready(self):
        if self.binding is not None and self.binding.get('ownerMode') == 'movement-a':
            owner = self.movement_a_adapter().check_ready()
            if any(owner.get(key) != self.binding.get(key) for key in ('requestId', 'publisherPid')):
                raise RuntimeError('Movement A owner identity changed')
            return owner
        if self.binding is None:
            control = self._owner_factory()
            try:
                owner = control.inspect_active_ready(required_sides=('left', 'right'))
            except self._owner_not_ready as bilateral_error:
                # The SDK binds raw guidance to the exact bilateral return sides.
                # Only the separate historical Movement A owner uses right-only.
                owner = control.inspect_active_ready(required_sides=('right',))
                if not isinstance(owner, dict) or owner.get('ownerMode') != 'movement-a':
                    raise bilateral_error
            if owner is None:
                return self.native_ready(require_presets=False)
            if owner.get('ownerMode') == 'movement-a':
                self.binding = self.movement_a_adapter().check_ready()
                return self.binding
        owner = self.robot._standing_current_hold_control().inspect_active_ready(required_sides=('left', 'right'))
        return {**{key: owner.get(key) for key in ('requestId', 'publisherPid', 'ownerMode', 'nativeOwner', 'aimdkMcMode', 'standingState', 'guidedSides', 'nonce')},
                'observed_at': _iso(time.time()), 'sdk_fresh_ready_verified': True}

    def preflight_mode(self, commands=None):
        if self.config.get('recovery_owner_binding') is not None:
            return {'mode_entry_required': False, 'owner': self.check_recovery_owner(), 'robot_commands_sent': False}
        if commands:
            first = commands[0]['name']
            backend = MASTER_COMMANDS[first]['backend']
            if backend == 'movement_a':
                return self.movement_a_adapter().preflight()
            if backend == 'native_preset':
                return {'mode_entry_required': False, 'owner': self.native_ready(), 'robot_commands_sent': False}
            if backend in {'passive', 'owner_control', 'native_golf'}:
                # Existing explicit recovery and golf methods own their own live
                # admission. A readiness observation must not block fault recovery.
                return {'mode_entry_required': False, 'owner': None,
                    'sdk_command_admission_required': True, 'robot_commands_sent': False}
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

    def check_recovery_owner(self):
        expected = self.config['recovery_owner_binding']
        if (not isinstance(expected, dict) or not expected.get('previous_session_id') or not expected.get('previous_attempt_id')
            or not expected.get('requestId') or type(expected.get('publisherPid')) is not int or expected['publisherPid'] <= 0
            or expected.get('ownerMode') != 'current-hold'):
            raise ValueError('recovery requires the exact previous failed owner identity')
        control = self._owner_factory()
        try:
            # A measured endpoint warning can leave a healthy stationary hold.
            # The original command remains failed; only full restore is admitted.
            owner = control.inspect_active_ready(required_sides=('left', 'right'))
        except self._owner_not_ready:
            owner = None
        if owner is None:
            owner = control.inspect_retained_fault(required_sides=('left', 'right'))
        if any(owner.get(key) != expected.get(key) for key in ('requestId', 'publisherPid', 'ownerMode')):
            raise RuntimeError('the failed Master owner changed; recovery was not sent')
        return owner

    def prepare_mode(self):
        self._admit()
        if self.binding is not None:
            if self.binding.get('ownerMode') != 'current-hold':
                raise RuntimeError('Raw adjustments require bilateral raw STAND_DEFAULT; explicitly restore the current preset owner first')
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
        if self.config.get('recovery_owner_binding') is not None:
            if name != 'restore_stand_hand_guide': raise ValueError('recovery permits only full upper-body restore')
            self.check_recovery_owner()
            self._admit()
        backend = MASTER_COMMANDS[name]['backend']
        if backend == 'movement_a':
            self.explicit_raw_entry = False
            result = self.movement_a_adapter().execute()
            self.binding = result['ownerBinding']
            return result
        # Bind every top-level SDK call to the same live owner. Each downstream
        # ensure_ready also uses ExistingOwnerControl, closing the bootstrap race.
        # Native stiffness restore has its own stricter no-publisher admission.
        if name == 'enter_stand_hand_guide':
            self.explicit_raw_entry = False
            owner = self.prepare_mode()
            self._admit()
            self.explicit_raw_entry = True
            return {'operation': 'enter-stand-hand-guide', 'rawModeVerified': True,
                    'dry_run': False, 'ownerBinding': owner}
        if backend == 'raw_upper_body':
            if not getattr(self, 'explicit_raw_entry', False):
                raise RuntimeError('Master adjustments require Agentech.enter_stand_hand_guide("both") before adjustment commands')
            self.check_ready()
        elif backend == 'native_preset':
            self.native_ready()
        self._admit()
        if backend in {'native_preset', 'native_golf'} or name in {
                'restore_stand_hand_guide', 'restore_stand_default', 'release_returned_hold', 'release_return_hold'}:
            self.explicit_raw_entry = False
        if backend == 'native_golf':
            # The existing composite SDK operation owns its explicit raw/native
            # transitions and admission. Do not replace them with a gateway mode
            # transition or manufacture any operator acknowledgments.
            wrapped = self.robot._standing_current_hold_control
            self.robot._standing_current_hold_control = self._owner_factory
            try:
                result = getattr(self.robot, name)(**arguments)
            finally:
                self.robot._standing_current_hold_control = wrapped
            self.binding = None
        else:
            result = getattr(self.robot, name)(**arguments)
        if isinstance(result, dict) and (result.get('ownerReleased') is True or result.get('ownerReleasedAfterBothReturnsVerified') is True):
            self.binding = None
        return result


def require_completed(name, result):
    if not isinstance(result, dict) or result.get('dry_run') is True or result.get('fault') or result.get('accepted') is False:
        raise RuntimeError('Master result is failed, dry-run, or lacks authoritative evidence')
    if result.get('status') in {'candidate', 'not-qualified'}:
        raise RuntimeError('Master result is an unqualified plan')
    backend = MASTER_COMMANDS[name]['backend']
    if backend == 'native_preset':
        complete = (result.get('succeeded') is True and type(result.get('task_id')) is int
            and result['task_id'] > 0 and result.get('task_state') == 1
            and result.get('posture_before') == 'STAND_DEFAULT' and result.get('posture_after') == 'STAND_DEFAULT')
    elif name == 'movement_a':
        complete = (result.get('ok') is True and result.get('reachedTopHold') is True
            and result.get('endpointVerified') is True and isinstance(result.get('ownerBinding'), dict))
    elif backend == 'passive':
        complete = name != 'stay' or (result.get('controller_owner_unchanged') is True
            and result.get('joint_targets_unchanged') is True and result.get('joint_gains_unchanged') is True)
    elif backend == 'native_golf':
        complete = result.get('succeeded') is True
    elif name == 'close_door':
        complete = result.get('allEndpointsVerified') is True and result.get('waistEndpointVerified') is True
    elif name == 'accept_current_hold':
        complete = (result.get('accepted') is True and result.get('motionCommandsSent') is False
            and type(result.get('nonce')) is int and isinstance(result.get('requestId'), str)
            and type(result.get('publisherPid')) is int and result['publisherPid'] > 0)
    elif name in {'release_returned_hold', 'release_return_hold'}:
        observation = result.get('releaseObservation', {})
        complete = (result.get('ownerReleased') is True
            and result.get('phase') == 'hold-released-waist-unverified'
            and observation.get('ownerProcessExited') is True
            and observation.get('publisherCount') == 0
            and observation.get('publisherLeaseReleased') is True
            and observation.get('rawMcMode') == 'STAND_DEFAULT')
    elif name == 'enter_stand_hand_guide':
        complete = result.get('rawModeVerified') is True and isinstance(result.get('ownerBinding'), dict)
    elif name == 'restore_stand_hand_guide':
        complete = result.get('upperBodyPoseVerified') is True and result.get('absoluteReturnVerified') is True
    elif name == 'restore_stand_default':
        complete = result.get('succeeded') is True
    elif name in {'adjust_waist', 'return_waist_to_neutral', 'undo_waist'}:
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
    adapter = adapter_factory(config)
    adapter.validate(plan['commands'])
    return {'ready': True, 'robot_model': 'master', **adapter.preflight_mode(plan['commands']),
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
        with master_lease(lease):
            adapter = adapter_factory(config)
            adapter.admission_check = admitted
            adapter.validate(plan['commands'])
            admitted()
            first_backend = MASTER_COMMANDS[plan['commands'][0]['name']]['backend']
            if config.get('recovery_owner_binding') is not None:
                receipt['owner_binding'] = adapter.check_recovery_owner()
            elif first_backend == 'mode_entry':
                adapter.prepare_mode()
                receipt['owner_binding'] = adapter.check_ready()
            elif first_backend == 'native_preset':
                receipt['owner_binding'] = adapter.native_ready()
                receipt['owner_hold_preserved'] = False
            saved_results = {}
            for index, command in enumerate(plan['commands'], 1):
                admitted()
                active = dict(command_index=index, name=command['name'], args=command['args'],
                    source_args=command.get('source_args', command['args']), line=command.get('line'),
                    status='failed', result=None, error=None, started_at=_iso(now()), duration_ms=0)
                tick = time.monotonic()
                try:
                    arguments = dict(command['args'])
                    if command['name'] == 'undo_waist':
                        arguments['movement'] = saved_results[arguments['movement']['$master_result']]
                    result = adapter.execute(command['name'], arguments)
                    active['result'] = result
                    require_completed(command['name'], result)
                    if command.get('save_result_as'):
                        saved_results[command['save_result_as']] = result
                    active.update(result=result, status='completed')
                    receipt['completed_count'] += 1
                    if command['name'] == 'restore_stand_hand_guide':
                        receipt['restore_verified'] = result.get('upperBodyPoseVerified') is True and result.get('absoluteReturnVerified') is True
                    if result.get('ownerReleased') is True or result.get('ownerReleasedAfterBothReturnsVerified') is True:
                        receipt['owner_hold_preserved'] = False
                        receipt['owner_release_verified'] = True
                    backend = MASTER_COMMANDS[command['name']]['backend']
                    if backend == 'movement_a':
                        receipt['owner_binding'] = result['ownerBinding']
                        receipt['owner_hold_preserved'] = True
                    elif backend in {'owner_control', 'native_golf'} or 'owner_binding' not in receipt:
                        receipt['owner_binding'] = adapter.check_ready()
                    elif (backend in {'raw_upper_body', 'mode_entry'}
                        and receipt['owner_binding'].get('ownerMode') != 'current-hold'):
                        # Explicit release/native operations may precede a new raw
                        # entry. Verify that new owner without pretending it was
                        # continuous with the earlier native or released owner.
                        receipt['owner_binding'] = adapter.check_ready()
                        receipt['owner_hold_preserved'] = True
                    if receipt.get('owner_binding', {}).get('noActivePublisher') is True:
                        receipt['owner_hold_preserved'] = False
                    receipt.setdefault('ownership_checkpoints', []).append({
                        'after_command': index, 'binding': receipt.get('owner_binding')})
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
                    and final.get('ownerMode') in {'current-hold', 'movement-a'}
                    and final.get('aimdkMcMode') == ('STAND_DEFAULT' if final.get('ownerMode') == 'current-hold' else 'MANIPULATE_DEFAULT')
                    and final.get('nativeOwner') == 'native-mc'
                    and final.get('sdk_fresh_ready_verified') is True):
                    receipt.update(handoff_ready=True, handoff_mode=('retained-hold' if final['ownerMode'] == 'current-hold' else 'retained-movement-a'), handoff_blocker=None)
                elif (isinstance(initial, dict) and isinstance(final, dict)
                    and receipt.get('restore_verified') is True and receipt.get('owner_release_verified') is True
                    and all(binding.get('ownerMode') == 'native-hold' and binding.get('noActivePublisher') is True
                        and binding.get('nativeOwner') == 'native-mc' and binding.get('aimdkMcMode') == 'STAND_DEFAULT'
                        and binding.get('sdk_fresh_ready_verified') is True for binding in (initial, final))):
                    receipt.update(handoff_ready=True, handoff_mode='native-hold', handoff_blocker=None)
                elif (isinstance(initial, dict) and isinstance(final, dict)
                    and all(binding.get('ownerMode') == 'native-standing'
                        and binding.get('presetActionsReady') is True
                        and binding.get('noActivePublisher') is True
                        and binding.get('sdk_fresh_ready_verified') is True for binding in (initial, final))):
                    receipt.update(handoff_ready=True, handoff_mode='native-standing', handoff_blocker=None)
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
