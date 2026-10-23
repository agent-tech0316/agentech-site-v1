"""Trusted gateway binding for the preserved SDK Movement A launcher.

Only trusted deployment paths and connection options are bound here. The SDK
files, launch sequence, native mode, publisher, and endpoint checks are retained.
"""
from __future__ import annotations

import hashlib
import importlib.util
import os
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile


_SHA256 = re.compile(r'^[0-9a-f]{64}$')
_REMOTE_PATH = re.compile(r'^/[A-Za-z0-9_./-]+$')


class MovementAAdapter:
    def __init__(self, config, *, inspect_owner, admission_check=None,
                 bridge_module=None, password_provider=None, recording_validator=None):
        self.config = config
        self.settings = config.get('movement_a')
        if not isinstance(self.settings, dict) or self.settings.get('enabled') is not True:
            raise ValueError('Movement A requires an enabled trusted deployment')
        for key in ('deployment', 'recording_root', 'recording'):
            value = self.settings.get(key)
            if not isinstance(value, str) or not _REMOTE_PATH.fullmatch(value) or '..' in PurePosixPath(value).parts:
                raise ValueError('Movement A trusted remote path is invalid: ' + key)
        if not PurePosixPath(self.settings['recording']).is_relative_to(PurePosixPath(self.settings['recording_root'])):
            raise ValueError('Movement A recording escapes its trusted recording root')
        for key in ('recording_sha256', 'runner_sha256', 'qualification_sha256', 'bridge_sha256'):
            if not _SHA256.fullmatch(str(self.settings.get(key, ''))):
                raise ValueError('Movement A requires a pinned ' + key)
        if not callable(inspect_owner):
            raise TypeError('Movement A requires the existing SDK read-only owner inspector')
        self.inspect_owner = inspect_owner
        self.admission_check = admission_check
        self.password_provider = password_provider or (lambda: os.environ.get('AGENTECH_MASTER_SSH_PASSWORD'))
        self.bridge = bridge_module if bridge_module is not None else self._load_bridge()
        self.recording_validator = recording_validator or self._validate_recording
        self.bridge.MOVEMENT_A_DEPLOYMENT = self.settings['deployment']
        self.bridge.MOVEMENT_A_RECORDING_ROOT = self.settings['recording_root']
        self.bridge.MOVEMENT_A_RECORDING = self.settings['recording']
        self.bridge.MOVEMENT_A_RECORDING_SHA256 = self.settings['recording_sha256']
        # Bind the SDK's existing SSH client to this manifest, never its default host.
        self.bridge.master_connection_options_from_environment = self._connection_options

    def _load_bridge(self):
        root = Path(self.config['sdk_root']).resolve(strict=True)
        path = root / 'scripts' / 'master' / 'right_arm_cli_bridge.py'
        if hashlib.sha256(path.read_bytes()).hexdigest() != self.settings['bridge_sha256']:
            raise ValueError('Movement A local SDK bridge hash does not match')
        sys.path.insert(0, str(root))
        spec = importlib.util.spec_from_file_location('_gateway_preserved_movement_a_bridge', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def _connection_options(self, side='right'):
        if side != 'right':
            raise ValueError('The retained Movement A recording is right-arm only')
        password = self.password_provider()
        if not password:
            raise ValueError('AGENTECH_MASTER_SSH_PASSWORD is required')
        return {'host': self.config['host'], 'port': self.config.get('port', 21274),
            'dry_run': False, 'ssh_username': self.config.get('ssh_username', 'run'),
            'ssh_password': password, 'ssh_port': self.config.get('ssh_port', 22),
            'seated_timeout': 25.0, 'standing_guided_sides': 'right'}

    def _admit(self):
        if self.admission_check is not None:
            self.admission_check()

    @staticmethod
    def _binding(owner):
        if not isinstance(owner, dict) or owner.get('ownerMode') != 'movement-a' or owner.get('aimdkMcMode') != 'MANIPULATE_DEFAULT':
            raise RuntimeError('Movement A cannot replace an incompatible active owner')
        if (owner.get('nativeOwner') != 'native-mc' or 'right' not in owner.get('guidedSides', [])
                or owner.get('phase') not in {'top-hold', 'adjusted-hold'}
                or owner.get('fault') is not None or owner.get('accepted') is not True
                or owner.get('topHoldReady') is not True or owner.get('adjustmentReady') is not True
                or not owner.get('requestId') or type(owner.get('publisherPid')) is not int
                or owner['publisherPid'] <= 0):
            raise RuntimeError('Movement A owner is not a verified ready endpoint')
        return {**owner, 'sdk_fresh_ready_verified': True}

    def check_ready(self):
        """Fresh SDK owner validation only; never launch or change a mode."""
        return self._binding(self.inspect_owner())

    def _validate_recording(self):
        """Read exact remote bytes and use the unchanged SDK's offline loader."""
        from agentech.robots.master.standing_action_replay import StandingActionReplay
        qualification = self.settings['deployment'] + '/agentech/robots/master/reference/standing-replay-qualifications.json'
        with self.bridge._client() as client:
            with client.open_sftp() as sftp:
                with sftp.open(self.settings['recording'], 'rb') as handle:
                    recording_bytes = handle.read(2 * 1024 * 1024 + 1)
                with sftp.open(qualification, 'rb') as handle:
                    qualification_bytes = handle.read(2 * 1024 * 1024 + 1)
        for data, key in ((recording_bytes, 'recording_sha256'), (qualification_bytes, 'qualification_sha256')):
            if len(data) > 2 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != self.settings[key]:
                raise RuntimeError('Movement A offline validation input hash does not match: ' + key)
        with tempfile.TemporaryDirectory(prefix='master-movement-a-validate-') as folder:
            root = Path(folder)
            recording = root / PurePosixPath(self.settings['recording']).name
            recording.write_bytes(recording_bytes)
            qualified = root / 'qualification.json'
            qualified.write_bytes(qualification_bytes)
            replay = StandingActionReplay.load(recording, qualification_path=qualified,
                recording_root=root, speed=0.32)
            return {'name': replay.name, 'speed': replay.speed, 'duration_seconds': replay.duration_s,
                'recording_sha256': replay.recording_sha256, 'offline_validated': True}

    def preflight(self):
        """Verify the existing artifacts and owner without sending a command."""
        owner = self.inspect_owner()
        binding = self._binding(owner) if owner is not None else None
        result = self.bridge.movement_a_preflight_payload()
        if not isinstance(result, dict) or result.get('ok') is not True or result.get('robotCommandsSent') is not False:
            raise RuntimeError('Movement A deployment preflight is incomplete')
        if result.get('recordingHashVerified') is not True:
            raise RuntimeError('Movement A recording hash does not match')
        if result.get('runnerSha256') != self.settings['runner_sha256']:
            raise RuntimeError('Movement A runner hash does not match')
        if result.get('qualificationSha256') != self.settings['qualification_sha256']:
            raise RuntimeError('Movement A qualification hash does not match')
        if result.get('existingReplayProcess') and binding is None:
            raise RuntimeError('An unverified existing Movement A process prevents launch')
        recording = self.recording_validator()
        return {'ready': True, 'owner': binding, 'mode_entry_required': binding is None,
            'recording': recording, 'robot_commands_sent': False}

    def execute(self):
        self._admit()
        initial = self.preflight()['owner']
        self._admit()
        result = self.bridge.movement_a_payload()
        if (not isinstance(result, dict) or result.get('ok') is not True
                or result.get('reachedTopHold') is not True or result.get('fault') is not None):
            raise RuntimeError('Movement A did not return a verified top hold; existing hold preserved without retry')
        final = self.check_ready()
        if initial is not None and any(initial.get(key) != final.get(key) for key in ('requestId', 'publisherPid')):
            raise RuntimeError('Movement A existing owner identity changed')
        return {**result, 'operation': 'movement-a', 'dry_run': False,
            'endpointVerified': True, 'ownerBinding': final,
            'ownerMode': 'movement-a', 'aimdkMcMode': 'MANIPULATE_DEFAULT'}
