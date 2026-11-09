"""Literal SDK plans shared by the compiler and all three trusted runners.

No customer Python is imported or executed. Connection settings, controller
maintenance and operator workflows are never accepted as customer arguments.
"""
from __future__ import annotations
import ast
from copy import deepcopy
import hashlib
import inspect
import json
import keyword
import math
from pathlib import Path
import re

CONTRACT = json.loads(Path(__file__).with_name('eaic-sdk-contract.json').read_text(encoding='utf-8'))
ENTRIES = {e['id']:e for e in CONTRACT['entries']}
CONSTANTS = {x:x for x in ('left','right','both','stand','sit','master')}
RESERVED = {'Agentech', 'agentech', 'dog', *CONSTANTS}
PRIVATE = {'__proto__', 'constructor', 'prototype', '$sdk_result'}
CONNECTION = {'host','port','backend','target','variant','dry_run','timeout','client_factory',
              'native_executor','connect_kwargs','ssh_username','ssh_password','ssh_port',
              'relay_url','relay_token','repository_root'}
PATHS = {'path','output','csv_path','log_path','metadata_path','recording','recording_path'}
RAW = {'adjust_right_shoulder','adjust_left_shoulder','adjust_right_elbow','adjust_left_elbow',
       'adjust_both_elbows','adjust_elbow','adjust_right_wrist','adjust_left_wrist','adjust_wrist',
       'adjust_upper_body','adjust_waist','return_waist_to_neutral','move_arms_to','move_elbows_to',
       'move_mirrored_arms_to','mirror_arm_pose','movement_b','showcase','restore_wrist','restore_elbow',
       'hold_arm_pose'}
REFERENCE = re.compile(r'^[A-Za-z][A-Za-z0-9_]{0,63}$')


def entry_for(model, method):
    entry = ENTRIES.get(str(model)+':'+str(method))
    if entry is None: raise ValueError(f'{model} SDK command is unknown: {method}')
    if entry['policy'] != 'customer':
        raise ValueError(f'{method}: {entry["reason"] or "SDK command is disabled"}')
    return entry


def _is_ref(value):
    return isinstance(value,dict) and set(value) == {'$sdk_result'}


def _literal(value, depth=0, references=frozenset()):
    if depth > 8: raise ValueError('SDK arguments are nested too deeply')
    if _is_ref(value):
        if value['$sdk_result'] not in references: raise ValueError('SDK result is not from an earlier command')
        return
    if value is None or type(value) in (str,bool,int):
        if isinstance(value,str) and len(value)>8192: raise ValueError('SDK string exceeds maximum length')
        return
    if type(value) is float and math.isfinite(value): return
    if isinstance(value,list) and len(value)<=100:
        for item in value: _literal(item,depth+1,references)
        return
    if isinstance(value,dict) and len(value)<=100:
        for key,item in value.items():
            if not isinstance(key,str) or key in PRIVATE or key.startswith('__'):
                raise ValueError('Unsupported SDK map key')
            _literal(item,depth+1,references)
        return
    raise ValueError('SDK arguments must be bounded finite JSON literals')


def bind(model, method, positional, arguments, *, references=frozenset()):
    entry = entry_for(model,method)
    if not isinstance(positional,list) or not isinstance(arguments,dict): raise ValueError('Invalid SDK arguments')
    _literal(positional,references=references);_literal(arguments,references=references)
    params = {p['name']:p for p in entry['parameters'] if not p['name'].startswith('_')}
    slots = [p['name'] for p in entry['parameters'] if p['kind']=='positional' and not p['name'].startswith('_')]
    if len(positional)>len(slots) and not entry['varargs']: raise ValueError(f'{method} has too many positional arguments')
    bound = dict(arguments)
    for name,value in zip(slots,positional):
        if name in bound: raise ValueError('SDK argument supplied twice: '+name)
        bound[name] = value
    for name,value in bound.items():
        if name not in params or name in CONNECTION or name.startswith('_'):
            raise ValueError('Unknown or runtime-bound SDK parameter: '+name)
        if _is_ref(value): continue
        p=params[name];annotation=p['annotation']
        if value is None and ('None' in annotation or p.get('defaultSource')=='None'): continue
        if annotation=='bool' and type(value) is not bool: raise ValueError(name+' must be boolean')
        if annotation=='int' and type(value) is not int: raise ValueError(name+' must be integer')
        if annotation=='float' and (type(value) not in (int,float) or not math.isfinite(value)): raise ValueError(name+' must be finite numeric')
        if annotation in {'str','str | Path'} and not isinstance(value,str): raise ValueError(name+' must be text')
        if name in PATHS and value is not None:
            if not isinstance(value,str) or not value or len(value)>240 or '\\' in value or ':' in value or value.startswith('/') or any(x in {'..','.'} for x in value.split('/')):
                raise ValueError('Use an ordinary path relative to the session workspace')
        if name=='data' and value is not None:
            raise ValueError('Report data must reference an earlier trusted SDK read result')
    missing=[p['name'] for p in params.values() if p['required'] and p['name'] not in bound]
    if missing: raise ValueError('Missing SDK parameter: '+', '.join(missing))
    if model=='navi' and method in {'do_action','do_behavior'}:
        key=bound.get('action' if method=='do_action' else 'behavior')
        normalized=re.sub(r'[\s_-]','',str(key).lower())
        if normalized in {'260','backflip','recoverystand'}: raise ValueError('Navi action is disabled by the SDK')
    if model=='master' and method=='heart' and (bound.get('posture')=='sit' or bound.get('hand')=='sit'):
        raise ValueError('Seated heart requires the separate operator qualification workflow')
    if model=='aegis' and method=='run_sequence':
        actions=bound.get('actions')
        if not isinstance(actions,list) or not 1<=len(actions)<=100: raise ValueError('Sequence requires 1 through 100 SDK actions')
        for action in actions:
            if not isinstance(action,dict) or set(action)-{'action','params'} or action.get('action') in {'run_sequence','emergency_stop'}: raise ValueError('Nested sequences are not allowed; emergency_stop must be a terminal top-level call')
            bind(model,action.get('action'),[],action.get('params',{}),references=references)
    return entry, bound, positional[len(slots):]


def _name(node):
    parts=[]
    while isinstance(node,ast.Attribute): parts.insert(0,node.attr);node=node.value
    if not isinstance(node,ast.Name): raise ValueError('Only direct SDK calls are accepted')
    if node.id=='agentech' and parts[:1]==['Agentech']: parts.pop(0)
    elif node.id not in {'Agentech','dog'}: raise ValueError('Only the selected SDK robot may be called')
    return '.'.join(parts)


def compile_sdk_plan(source, submission_id, model):
    if not isinstance(source,str) or len(source.encode('utf-8'))>64000: raise ValueError('SDK program exceeds maximum size')
    if model not in {'master','navi','aegis'}: raise ValueError('Unknown SDK robot model')
    tree=ast.parse(source);commands=[];references=set();constants={};selected=False
    def value(node):
        if isinstance(node,ast.Name) and node.id in references:return {'$sdk_result':node.id}
        class ConstantNames(ast.NodeTransformer):
            def visit_Name(self,n):
                if n.id not in constants: raise ValueError('Use literals or earlier SDK results')
                return ast.copy_location(ast.Constant(constants[n.id]),n)
        result=ast.literal_eval(ConstantNames().visit(deepcopy(node)))
        # Reserved markers can only be created from an earlier captured call.
        _literal(result)
        return result
    for statement in tree.body:
        if isinstance(statement,ast.ImportFrom) and statement.module=='agentech' and not statement.level:
            if commands or selected or any(a.asname or a.name not in {'Agentech',*CONSTANTS} for a in statement.names):raise ValueError('Use canonical Agentech imports before commands')
            constants.update({a.name:CONSTANTS[a.name] for a in statement.names if a.name in CONSTANTS});continue
        if isinstance(statement,ast.Import) and not commands and not selected and all(a.name=='agentech' and not a.asname for a in statement.names):continue
        capture=None
        if isinstance(statement,ast.Assign) and len(statement.targets)==1 and isinstance(statement.targets[0],ast.Name):
            capture=statement.targets[0].id
            if not REFERENCE.fullmatch(capture) or keyword.iskeyword(capture) or capture in RESERVED or capture in references:raise ValueError('Use one unique ordinary SDK result name')
        elif not isinstance(statement,ast.Expr):raise ValueError('Only literal SDK calls and captured SDK results are accepted')
        call=statement.value
        if not isinstance(call,ast.Call):raise ValueError('Only direct SDK calls are accepted')
        method=_name(call.func)
        if method=='use':
            if capture or selected or commands or len(call.args)!=1 or call.keywords or value(call.args[0])!=model:raise ValueError('Robot selection must match the reviewed model and precede commands')
            selected=True;continue
        kwargs={}
        for item in call.keywords:
            if item.arg is None or item.arg in kwargs:raise ValueError('SDK keyword expansion and duplicate parameters are not allowed')
            kwargs[item.arg]=value(item.value)
        entry,bound,extra=bind(model,method,[value(x) for x in call.args],kwargs,references=references)
        command={'name':method,'args':bound,'positional':extra,'sdk':True,'line':statement.lineno}
        if capture:command['save_result_as']=capture;references.add(capture)
        commands.append(command)
    plan={'version':2,'robot_model':model,'submission_id':submission_id,
          'source_sha256':hashlib.sha256(source.encode()).hexdigest(),
          'sdk_contract':CONTRACT['hash'],'sdk_revision':CONTRACT['revision'],'commands':commands}
    validate_plan(plan)
    return plan


def validate_plan(plan):
    if not isinstance(plan,dict) or set(plan)-{'version','robot_model','submission_id','source_sha256','sdk_contract','sdk_revision','commands'}:
        raise ValueError('Invalid SDK plan fields')
    if plan.get('sdk_contract')!=CONTRACT['hash'] or plan.get('sdk_revision')!=CONTRACT['revision']:
        raise ValueError('EAIC SDK contract differs from the installed gateway; update the gateway before dispatch')
    if plan.get('version')!=2 or plan.get('robot_model') not in {'master','navi','aegis'}:raise ValueError('Unsupported SDK plan')
    commands=plan.get('commands')
    if not isinstance(commands,list) or not 1<=len(commands)<=100:raise ValueError('SDK plans require 1 through 100 commands')
    refs=set();result_sources={};raw_entry=False
    master_modes=set()
    for index,command in enumerate(commands):
        if not isinstance(command,dict) or set(command)-{'name','args','positional','sdk','line','save_result_as'} or command.get('sdk') is not True:raise ValueError('Invalid SDK plan command')
        if type(command.get('line')) is not int or command['line']<1:raise ValueError('Invalid SDK source line')
        entry,bound,extra=bind(plan['robot_model'],command['name'],[],command['args'],references=refs)
        # Keep the existing reviewed value/profile rules wherever they apply.
        # Expanded signatures are never an escape from a legacy numeric limit.
        base=command['name'].split('.')[-1]
        if plan['robot_model']=='master':
            if entry['effect']=='action':master_modes.add('sit' if command['name'].startswith('seated_actions.') or bound.get('posture')=='sit' else 'stand')
            if len(master_modes)>1:raise ValueError('Customer plans cannot change between seated and standing owners; use separate operator setup')
            from master_gateway_spec import MASTER_COMMANDS,validate_master_command,_check_type
            legacy=MASTER_COMMANDS.get(base)
            if legacy and legacy['validator']!='sdk':
                normalized=dict(bound)
                if '.' in command['name'] and base in {'turn_head','shake_head'}:
                    normalized['angle_degrees']=normalized.pop('degrees',None)
                checked={k:v for k,v in normalized.items() if k in legacy['parameters']}
                if base=='undo_waist' and _is_ref(checked.get('movement')):
                    checked['movement']={'$master_result':checked['movement']['$sdk_result']}
                # New optional SDK fields must not disable the reviewed value rules.
                # Namespace-only defaults (such as standing head posture) are
                # supplied by the SDK; validate all explicitly supplied old fields.
                if set(legacy['required'])<=set(checked):
                    validate_master_command(base,checked)
                else:
                    for key,value in checked.items():_check_type(value,legacy['parameters'][key],key)
        elif plan['robot_model']=='navi':
            from navi_gateway_spec import NAVI_COMMAND_PARAMETERS, validate_navi_command
            if base in NAVI_COMMAND_PARAMETERS and set(bound)<=NAVI_COMMAND_PARAMETERS[base]:
                validate_navi_command(base,bound)
        elif plan['robot_model']=='aegis':
            from aegis_gateway_spec import ALLOWED_COMMANDS, AEGIS_192_168_4_88, validate_aegis_command
            if base in ALLOWED_COMMANDS:
                validate_aegis_command(base,bound,device_profile=AEGIS_192_168_4_88)
        _literal(command.get('positional'),references=refs)
        if command['positional'] and not entry['varargs']:raise ValueError('Unexpected SDK positional arguments')
        base=command['name'].split('.')[-1]
        if plan['robot_model']=='master':
            if base=='undo_waist':
                movement=bound.get('movement')
                if not _is_ref(movement) or result_sources.get(movement['$sdk_result'])!='adjust_waist':
                    raise ValueError('undo_waist requires an earlier captured adjust_waist result')
            seated=command['name'].startswith('seated_actions.') or bound.get('posture')=='sit'
            if base in RAW and not seated and not raw_entry:raise ValueError('Master adjustments require enter_stand_hand_guide("both") before adjustment commands')
            if base=='enter_stand_hand_guide':
                if bound.get('side','both')!='both':raise ValueError('EAIC requires the existing bilateral standing owner')
                raw_entry=True
            elif base in {'restore_stand_hand_guide','restore_stand_default','release_returned_hold','release_return_hold','golf','golf_put'}:raw_entry=False
        if base=='emergency_stop' and index!=len(commands)-1:raise ValueError('Emergency stop must be terminal')
        saved=command.get('save_result_as')
        if saved is not None:
            if not isinstance(saved,str) or not REFERENCE.fullmatch(saved) or keyword.iskeyword(saved) or saved in RESERVED or saved in refs:raise ValueError('Invalid SDK result capture')
            refs.add(saved)
            result_sources[saved]=base
    return plan


def generic_backend(method):
    base=method.split('.')[-1]
    entry=ENTRIES.get('master:'+method,{})
    if entry.get('effect') in {'local','observe'}:return 'passive'
    if base in RAW:return 'raw_upper_body'
    if base in {'return_head_to_center','center_head','center'}:return 'native_head'
    if base in {'golf','golf_put','stiff'}:return 'native_golf'
    return 'sdk_guarded'


def verify_runtime(root, model):
    root=Path(root).resolve()
    relative=f'agentech/robots/{model}/api.py'
    raw=(root/relative).read_text(encoding='utf-8').replace('\r\n','\n').encode('utf-8')
    if hashlib.sha256(raw).hexdigest()!=CONTRACT['apiFiles'][relative]:
        raise ValueError('Installed SDK API differs from the reviewed EAIC command contract')


def resolve_arguments(command, results, workspace):
    def resolve(value):
        if _is_ref(value):return results[value['$sdk_result']]
        if isinstance(value,list):return [resolve(v) for v in value]
        if isinstance(value,dict):return {k:resolve(v) for k,v in value.items()}
        return value
    kwargs=resolve(command['args']);args=resolve(command['positional'])
    root=Path(workspace).resolve()
    for key in PATHS & set(kwargs):
        if kwargs[key] is None:continue
        path=(root/kwargs[key]).resolve()
        if not path.is_relative_to(root):raise ValueError('SDK file escapes the session workspace')
        if key in {'path','output'}:path.parent.mkdir(parents=True,exist_ok=True)
        kwargs[key]=str(path)
    return args,kwargs


def invoke(robot, model, command, results, workspace, *, before_call=lambda:None, trusted_transform=None, result_validator=None):
    entry=entry_for(model,command['name'])
    args,kwargs=resolve_arguments(command,results,workspace)
    before_call()
    if model=='aegis' and entry['method']=='run_sequence':
        result=[]
        for action in kwargs['actions']:
            result.append(invoke(robot,model,{'name':action['action'],'args':action.get('params',{}),'positional':[]},results,workspace,before_call=before_call,trusted_transform=trusted_transform,result_validator=result_validator))
        return result
    method=entry.get('target',entry['method'])
    if trusted_transform is not None:
        method,kwargs=trusted_transform(method,kwargs)
        entry_for(model,method)
    target=target_for(robot,model,method)
    inspect.signature(target).bind(*args,**kwargs)
    seated=model=='master' and (method.startswith('seated_actions.') or kwargs.get('posture')=='sit'
        or (method=='center' and robot.seated_status().get('active') is True))
    old_factory=None
    if seated:
        before=seated_owner(robot)
        old_factory=robot._seated_control
        class ExistingSeated:
            def __init__(self,control):self.control=control
            def __getattr__(self,name):
                if name in {'update_controller','release','recover','maintenance'}:
                    raise RuntimeError('Customer actions cannot change the seated controller')
                if name=='start':
                    def retain(*a,**k):
                        status=self.control.status()
                        if status.get('phase')!='holding' or status.get('pid')!=before['pid'] or status.get('upper_body_powered') is not True:
                            raise RuntimeError('Existing seated owner changed; controller start refused')
                        return status
                    return retain
                return getattr(self.control,name)
        robot._seated_control=lambda:ExistingSeated(old_factory())
    try:value=target(*args,**kwargs)
    finally:
        if old_factory is not None:robot._seated_control=old_factory
    if seated:
        after=seated_owner(robot)
        if before!=after:raise RuntimeError('Persistent seated owner changed during the customer action')
        if isinstance(value,dict):value={**value,'gateway_seated_owner_before':before,'gateway_seated_owner_after':after}
    if isinstance(value,dict) and any(value.get(k) is False for k in ('success','succeeded')):
        raise RuntimeError('SDK reported command failure')
    if isinstance(value,dict) and ((entry['effect']=='action' and value.get('dry_run') is True) or value.get('outcome')=='failed' or value.get('status')=='failed'):
        raise RuntimeError('SDK did not report a successful live call')
    if result_validator is not None:result_validator(entry['method'],value)
    return value


def target_for(robot, model, method):
    entry=entry_for(model,method)
    target=robot
    for part in entry.get('target',method).split('.'):target=getattr(target,part)
    return target


def seated_owner(robot):
    state=robot.seated_status()
    if not isinstance(state,dict) or state.get('phase')!='holding' or state.get('active') is not True or state.get('upper_body_powered') is not True or type(state.get('pid')) is not int or state['pid']<=0 or state.get('failure') or state.get('watchdog_trip'):
        raise RuntimeError('Customer seated actions require an already healthy persistent powered seated owner; use the operator setup workflow')
    return {k:state.get(k) for k in ('pid','phase','active','upper_body_powered','controller_version')}


def public_result(value):
    """Preserve data structure with explicit bounds; never emit connection secrets."""
    from itertools import islice
    from dataclasses import is_dataclass,asdict
    from datetime import date,datetime
    from enum import Enum
    secret={'host','port','password','token','secret','ssh_password','ssh_username','relay_url','repository_root','local_path'}
    def safe_text(value):
        value=re.sub(r'\b(?:\d{1,3}\.){3}\d{1,3}\b','[private address]',value)
        value=re.sub(r'(?i)\b(?:password|token|secret|authorization)\s*[:=]\s*[^\s,;]+','[redacted credential]',value)
        if re.match(r'^(?:[A-Za-z]:[\\/]|/)',value):return {'artifact_name':Path(value.replace('\\','/')).name}
        return value
    def clean(item,depth=0):
        if depth>20:raise ValueError('SDK result exceeds maximum nesting')
        if isinstance(item,str):return safe_text(item)
        if item is None or type(item) in (bool,int):return item
        if isinstance(item,float):return item if math.isfinite(item) else None
        if isinstance(item,Enum):return clean(item.value,depth+1)
        if isinstance(item,(date,datetime)):return item.isoformat()
        if is_dataclass(item) and not isinstance(item,type):return clean(asdict(item),depth+1)
        if isinstance(item,Path):return {'artifact_name':item.name}
        if isinstance(item,dict):return {str(k):clean(v,depth+1) for k,v in item.items() if str(k).lower() not in secret and not re.search(r'password|token|secret|credential',str(k),re.I)}
        if isinstance(item,(tuple,list)):return [clean(v,depth+1) for v in item]
        if type(item).__name__=='NaviReport':return {'snapshot':clean(item.snapshot,depth+1),'tables':list(item.tables)}
        if type(item).__name__=='RecordingReport':return {'manifest':clean(item.manifest,depth+1),'recording_available':True}
        if type(item).__name__=='RecordTable':
            rows=list(islice(iter(item),1001));return {'rows':clean(rows[:1000],depth+1),'truncated':len(rows)>1000}
        raise ValueError('SDK returned an unsupported result type: '+type(item).__name__)
    result=clean(value)
    if len(json.dumps(result,allow_nan=False).encode())>32*1024:raise ValueError('SDK result exceeds 32 KB; select fewer telemetry columns or read a smaller recording')
    return result
