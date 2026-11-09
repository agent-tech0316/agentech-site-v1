"""Pin EAIC's public command inventory to the maintained Agentech SDK source."""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
OPERATOR = {
    'master': {'teach_standing_action', 'replay_standing_action', 'update_seated_controller',
               'recover_seated_hold', 'release_sit', 'sit', 'damp_arm_joints',
               'prepare_motion_connection', 'close_motion_connection', 'replay_taught_wrist',
               'check_heart_support', 'restore_heart_start', 'teach_wrist',
               'teach_elbow', 'damp_wrist', 'watch_motion_readiness'},
    'navi': {'joint_trajectory', 'set_user_mode', 'set_collision_protect', 'do_action', 'do_behavior'},
    'aegis': {'robot'},
}
LOCAL = {'read', 'report', 'native_sdk_info', 'analyze_joint_log', 'action_catalog', 'catalog',
         'plan_upper_body_torque_assist', 'arm_stiffness_interface', 'plan_arm_stiffness_transition'}
OBSERVE = {'status', 'get_status', 'battery', 'get_battery_status', 'body_status', 'joint_states',
           'diagnose', 'get_motion_readiness', 'watch_motion_readiness', 'seated_status',
           'wrist_teach_status', 'assess_arm_hold', 'get_imu', 'get_body_state'}


def entries(root, revision, filename, owner, robot, prefix=''):
    raw = subprocess.check_output(['git', '-C', str(root), 'show', f'{revision}:{filename}'])
    tree = ast.parse(raw.decode('utf-8'))
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == owner)
    result = []
    for fn in cls.body:
        if not isinstance(fn, ast.FunctionDef) or fn.name.startswith('_'):
            continue
        if any(isinstance(d, ast.Name) and d.id == 'property' for d in fn.decorator_list):
            continue
        args = fn.args
        positional = args.posonlyargs + args.args
        defaults = [None] * (len(positional) - len(args.defaults)) + args.defaults
        params = []
        for arg, default, kind in ([(a,d,'positional') for a,d in zip(positional, defaults)] +
                                   [(a,d,'keyword') for a,d in zip(args.kwonlyargs,args.kw_defaults)]):
            if arg.arg in {'self', 'cls'}:
                continue
            item = {'name': arg.arg, 'kind': kind, 'required': default is None,
                    'annotation': ast.unparse(arg.annotation) if arg.annotation else ''}
            if default is not None:
                item['defaultSource'] = ast.unparse(default)
                try: item['default'] = ast.literal_eval(default)
                except (ValueError, TypeError): pass
            params.append(item)
        method = prefix + fn.name
        policy, reason = 'customer', None
        for statement in fn.body:
            if isinstance(statement, ast.Raise) and isinstance(statement.exc, ast.Call) and statement.exc.args:
                try: message = ast.literal_eval(statement.exc.args[0])
                except (ValueError, TypeError): continue
                if isinstance(message, str) and (getattr(statement.exc.func,'id','') == 'NotImplementedError' or
                        any(x in message for x in ('permanently disabled', 'not connected to the runtime', 'under development'))):
                    policy, reason = 'disabled', message
        base = fn.name
        if policy == 'customer' and (base in OPERATOR[robot] or base in {'teach', 'replay'}):
            policy, reason = 'operator', 'Requires the separate on-site operator workflow; customer code cannot change controller deployment, ownership, or teaching state.'
        if robot=='master' and method=='seated_actions.heart':
            policy,reason='operator','Seated heart is a qualification/characterization workflow, not a customer action.'
        if robot=='navi' and method in {'do_action','do_behavior'}:
            reason='Raw catalog dispatch requires the operator workflow; customer programs use the named SDK wrappers and their posture, preparation and qualification guards.'
        effect = 'local' if base in LOCAL else 'observe' if base in OBSERVE else 'action'
        result.append({'id': robot+':'+method, 'robot': robot, 'method': method,
                       'parameters': params, 'varargs': args.vararg.arg if args.vararg else None,
                       'policy': policy, 'reason': reason, 'effect': effect,
                       'description': ast.get_docstring(fn) or method, 'source': filename, 'line': fn.lineno})
    return result, hashlib.sha256(raw).hexdigest()


def generate(root, revision):
    revision = subprocess.check_output(['git', '-C', str(root), 'rev-parse', revision], text=True).strip()
    all_entries, files = [], {}
    for robot, owner in [('master','Master'), ('navi','Navi'), ('aegis','Agentech')]:
        name = f'agentech/robots/{robot}/api.py'
        found, digest = entries(root, revision, name, owner, robot)
        all_entries += found
        files[name] = digest
        if robot == 'master':
            for prefix in ('standing_actions.', 'seated_actions.'):
                found, _ = entries(root, revision, name, 'PostureActions', robot, prefix)
                all_entries += found
    # Navi's fleet facade has always exposed this stable status alias.
    alias = dict(next(e for e in all_entries if e['id'] == 'navi:status'))
    alias.update(id='navi:get_status', method='get_status', target='status')
    all_entries.append(alias)
    contract = {'version': 1, 'repository': 'https://github.com/agent-tech0316/agentech_sdk',
                'revision': revision, 'apiFiles': files, 'entries': all_entries}
    contract['hash'] = hashlib.sha256(json.dumps(contract,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    data = (json.dumps(contract, ensure_ascii=False, indent=2)+'\n').encode('utf-8')
    (HERE/'eaic-sdk-contract.json').write_bytes(data)
    print(json.dumps({'revision':revision, 'entries':len(all_entries),
                      'customer':sum(e['policy']=='customer' for e in all_entries),
                      'contract_sha256':hashlib.sha256(data).hexdigest()}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', type=Path, required=True)
    parser.add_argument('--revision', required=True)
    args = parser.parse_args()
    generate(args.sdk, args.revision)
