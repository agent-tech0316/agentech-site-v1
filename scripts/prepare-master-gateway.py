"""Prepare a disabled local SDK manifest. Never contacts or updates a robot."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess


def prepare(sdk_root, host):
    root = Path(sdk_root).resolve(strict=True)
    api = root / 'agentech' / 'robots' / 'master' / 'api.py'
    if not api.is_file():
        raise ValueError('sdk_root does not contain the existing Master SDK')
    candidates = [root / 'agentech' / '__init__.py']
    for folder in (root / 'agentech' / 'robots' / 'master', root / 'scripts' / 'master'):
        candidates.extend(path for path in folder.rglob('*') if path.is_file() and path.suffix in {'.py', '.json'})
    hashes = {path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
              for path in sorted(set(candidates))}
    try:
        head = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], check=True,
            capture_output=True, text=True, timeout=10).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        head = None
    return {'schema_version': 1, 'robot_model': 'master', 'enabled': False,
        'host': host, 'sdk_root': str(root), 'sdk_git_head': head,
        'sdk_api_sha256': hashlib.sha256(api.read_bytes()).hexdigest(),
        'sdk_files_sha256': hashes, 'port': 21274, 'ssh_username': 'run', 'ssh_port': 22,
        'relay_url': None, 'standing_deployment': os.environ.get('AGENTECH_MASTER_STANDING_DEPLOYMENT'),
        'note': 'Local file pins only. Robot installed build, owner, neutrality and live qualification are unverified. '
                'The bridge adds session_id, submission_id, source_sha256, plan_sha256, attempt_id, '
                'scheduled_start and scheduled_end per authorized booking. SSH password is environment-only.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sdk-root', required=True)
    parser.add_argument('--host', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    value = prepare(args.sdk_root, args.host)
    with Path(args.output).open('x', encoding='utf-8') as handle:
        json.dump(value, handle, indent=2, allow_nan=False)
        handle.write('\n')
    print(json.dumps({'prepared': True, 'enabled': False, 'sdk_git_head': value['sdk_git_head'],
        'sdk_api_sha256': value['sdk_api_sha256'], 'pinned_files': len(value['sdk_files_sha256']),
        'robot_commands_sent': False, 'robot_deployment_changed': False}))


if __name__ == '__main__':
    main()
