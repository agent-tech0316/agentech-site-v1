"""Literal upper-body contract; the pinned SDK remains the range authority."""
from __future__ import annotations

import json
import math
from pathlib import Path

MASTER_CONTRACT = json.loads(Path(__file__).with_name('master-command-contract.json').read_text(encoding='utf-8'))
MASTER_COMMANDS = MASTER_CONTRACT['commands']
ARM_AXES = frozenset({'shoulder_pitch', 'shoulder_roll', 'shoulder_yaw', 'elbow', 'wrist_yaw', 'wrist_pitch', 'wrist_roll'})
AXES = frozenset({'pitch', 'roll', 'yaw'})


def _number(value):
    return type(value) in (int, float) and math.isfinite(value)


def _numeric_tree(value, depth=0):
    if _number(value):
        return True
    return (depth < 3 and isinstance(value, dict) and bool(value) and len(value) <= 32
            and all(isinstance(k, str) and not k.startswith('_') and _numeric_tree(v, depth+1)
                    for k, v in value.items()))


def _check_type(value, spec, name):
    if value is None and spec.get('nullable'):
        return
    kind = spec['type']
    good = False
    if kind == 'number': good = _number(value)
    elif kind == 'axis': good = isinstance(value, str) and value in AXES
    elif kind == 'side': good = isinstance(value, str) and value in {'left', 'right'}
    elif kind == 'guide_side': good = value == 'both'
    elif kind == 'boolean': good = type(value) is bool
    elif kind == 'wrist_axis': good = _number(value) or isinstance(value, str) and value in AXES
    elif kind in {'arm_map', 'waist_map'}:
        axes = ARM_AXES if kind == 'arm_map' else AXES
        good = isinstance(value, dict) and bool(value) and set(value) <= axes and all(_number(v) for v in value.values())
    elif kind == 'torque': good = _numeric_tree(value)
    if not good:
        raise ValueError(f'Master {name} must satisfy {kind}')


def validate_master_command(name: object, arguments: object) -> None:
    if not isinstance(name, str) or name not in MASTER_COMMANDS:
        if isinstance(name, str) and name in MASTER_CONTRACT.get('unsupported_commands', {}):
            raise ValueError('Master ' + name + ': ' + MASTER_CONTRACT['unsupported_commands'][name])
        raise ValueError(f'Master command is not approved: {name!r}')
    if not isinstance(arguments, dict):
        raise ValueError('Master command arguments must be an object')
    command = MASTER_COMMANDS[name]
    unknown = set(arguments) - set(command['parameters'])
    if unknown:
        raise ValueError(f'Master {name} has unapproved arguments: {sorted(unknown)}')
    if set(command['required']) - set(arguments):
        raise ValueError(f'Master {name} is missing required arguments')
    for key, value in arguments.items():
        _check_type(value, command['parameters'][key], key)
    present = {key for key, value in arguments.items() if value is not None}
    validator = command['validator']
    if validator == 'elbow_selector':
        if len(present & {'degrees', 'position'}) != 1:
            raise ValueError('Master adjust_elbow needs exactly one of degrees or position')
        if {'speed', 'duration_seconds'} <= present:
            raise ValueError('Master elbow speed and duration_seconds are alternatives')
    if validator in {'wrist', 'waist'}:
        axes = present & AXES
        positional = present & {'axis', 'degrees'}
        if axes and positional:
            raise ValueError('Master axes and axis/degrees forms are alternatives')
        if not axes:
            scalar_wrist = validator == 'wrist' and _number(arguments.get('axis')) and 'degrees' not in present
            if not scalar_wrist and positional != {'axis', 'degrees'}:
                raise ValueError('Master requires axis/degrees or named axes')
    if validator == 'upper_body':
        if not present & {'waist', 'right_arm', 'left_arm', 'both_elbows'}:
            raise ValueError('Master upper-body request has no selected joints')
        if 'both_elbows' in present and present & {'right_arm', 'left_arm'}:
            raise ValueError('Master both_elbows cannot be combined with arm maps')
    if validator == 'move_arms' and not present & {'left', 'right'}:
        raise ValueError('Master move_arms_to requires left or right targets')
    if validator == 'mirror_targets' and set(arguments['targets']) != ARM_AXES:
        raise ValueError('Master mirrored targets require all seven arm joints')


def bind_master_arguments(name, args, kwargs):
    if name not in MASTER_COMMANDS:
        raise ValueError(f'Master command is not approved: {name!r}')
    positional = MASTER_COMMANDS[name]['positional']
    if len(args) > len(positional):
        raise ValueError(f'Master {name} has too many positional arguments')
    result = dict(kwargs)
    for key, value in zip(positional, args):
        if key in result:
            raise ValueError(f'Master argument {key} supplied twice')
        result[key] = value
    validate_master_command(name, result)
    return result
