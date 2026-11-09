"""Install and play only an immutable, booked Master native package."""
from contextlib import nullcontext
from datetime import datetime
from hashlib import sha256
import io
import json
import math
import os
from pathlib import Path
import posixpath
import re
import stat
import subprocess
import sys
import tempfile
import time
import uuid
import wave
import zipfile

import master_native_body as native

HERE = Path(__file__).resolve().parent
PROFILE = HERE / 'master-ultra-native-profile.json'
RESOURCES = '/agibot/nfs/soc0/var/robot_proxy/resources'
MAX = 64*1024**2
SHA = re.compile('[0-9a-f]{64}')
ID = re.compile(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}')


def need(condition, reason):
    if not condition: raise ValueError(reason)


def required_seconds(m):
    return math.ceil(max(m['frames']/50,(m['audio'] or {}).get('seconds',0)))+10


def validate_manifest(m):
    need(isinstance(m,dict) and ID.fullmatch(str(m.get('asset_id'))) and SHA.fullmatch(str(m.get('asset_sha256')))
         and m.get('motion') == 'linkcraft_resource_onnx_ffeaic'+m['asset_sha256']+'_0.0.1'
         and m.get('kind') in ('Motion','Package') and type(m.get('bytes')) is int and 0 < m['bytes'] <= MAX
         and type(m.get('frames')) is int and 0 < m['frames'] <= 50*24*3600
         and m.get('model') in ('Master Ultra','Master Edu'), 'Invalid booked motion manifest')
    for f in [m['policy']]+([m['audio']] if m['audio'] is not None else []):
        need(isinstance(f,dict) and SHA.fullmatch(str(f.get('sha256'))) and type(f.get('bytes')) is int and 0 < f['bytes'] <= MAX
             and isinstance(f.get('path'),str) and len(f['path']) <= 512 and not re.search(r'[\\:\x00-\x1f]',f['path'])
             and not any(x in ('','.','..') for x in f['path'].split('/')), 'Invalid booked package member')
    need(m['policy']['path'].lower().endswith('.onnx'), 'Missing booked ONNX')
    if m['audio'] is not None:
        a = m['audio']
        need(a['path'].lower().endswith('.wav') and m['kind'] == 'Package' and type(a.get('seconds')) in (float,int)
             and 0 < a['seconds'] <= MAX/32000, 'Invalid booked native WAV')
    if m['kind'] == 'Motion':
        need(m['bytes'] == m['policy']['bytes'] and m['asset_sha256'] == m['policy']['sha256'],'ONNX differs from upload')


def validate_plan(config, plan):
    m = plan.get('native_body_manifest')
    validate_manifest(m)
    need(config.get('native_body_manifest') == m and config.get('native_body_asset_id') == plan.get('asset_id') == m['asset_id']
         and config.get('native_body_start_policy') == 'signed_booking' and not config.get('recovery_owner_binding')
         and plan.get('native_body_required_seconds') == required_seconds(m)
         and plan.get('submission_id') == 'master-body-v2-'+m['asset_id']
         and plan.get('commands') == [{'name':'play_body','args':{'motion_name':m['motion'],'audio_path':''},'line':1}],
         'Booked native plan, claim or manifest has changed')
    files = config.get('native_body_files')
    need(isinstance(files,dict) and set(files) == {'motion'} and Path(files['motion']).is_absolute(), 'Missing staged upload')


def load_package(m, path):
    validate_manifest(m)
    path = Path(path)
    need(path.is_absolute() and not path.is_symlink() and path.is_file() and path.stat().st_size == m['bytes'],
         'Staged upload size or location changed')
    with path.open('rb') as f: raw = f.read(m['bytes']+1)
    need(sha256(raw).hexdigest() == m['asset_sha256'], 'Staged upload digest differs from booking')
    entries = {'policy.onnx':m['policy']}
    if m['audio']: entries['audio.wav'] = m['audio']
    if m['kind'] == 'Motion':
        files = {'policy.onnx':raw}
    else:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            members = archive.infolist()
            need(len(members) <= 64 and len({i.filename.casefold() for i in members}) == len(members)
                 and sum(i.file_size for i in members) <= 96*1024**2, 'Invalid booked ZIP directory')
            files = {}
            for dest,member in entries.items():
                info = archive.getinfo(member['path'])
                need(info.file_size == member['bytes'] and not info.flag_bits & 1 and not stat.S_ISLNK(info.external_attr >>16)
                     and info.compress_type in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED),'Invalid ZIP member')
                with archive.open(info) as f: files[dest] = f.read(member['bytes']+1)
    for dest,member in entries.items():
        need(len(files[dest]) == member['bytes'] and sha256(files[dest]).hexdigest() == member['sha256'],
             'Booked '+dest+' differs from immutable content manifest')
    if m['audio']:
        with wave.open(io.BytesIO(files['audio.wav']),'rb') as wav:
            need((wav.getnchannels(),wav.getsampwidth(),wav.getframerate(),wav.getcomptype()) == (1,2,16000,'NONE')
                 and wav.getnframes()/16000 == m['audio']['seconds'],'Bundled audio differs from booked native PCM')
    return files


def prepare(m, path):
    files = load_package(m,path)
    need(m['model'] == 'Master Ultra','No identity-bound native playback adapter installed for '+m['model'])
    probe = HERE/'master_policy_probe.py'
    scene = os.environ.get('AGENTECH_MASTER_ULTRA_SIM_SCENE','')
    from importlib.metadata import version
    dependencies = version('onnxruntime')+' '+version('numpy')
    known = m['policy']['sha256'] == native.SPEC['policy']
    if not known:
        from master_policy_probe import verify_scene
        verify_scene(scene,json.loads(PROFILE.read_bytes()))
        dependencies += ' '+version('mujoco')
    key = sha256(probe.read_bytes()+PROFILE.read_bytes()+json.dumps(m,sort_keys=True).encode()+
                 (sys.executable+sys.version+dependencies+scene).encode()).hexdigest()
    cache = Path(str(path)+'.'+key+'.probe.json')
    expected = {'policy_sha256':m['policy']['sha256'],'frames':m['frames'],'model':m['model'],
                'check':'exact-physically-recorded-policy' if known else 'ultra-closed-loop-simulation'}
    if cache.is_file() and not cache.is_symlink() and cache.stat().st_size <= 2048 and json.loads(cache.read_bytes()) == expected:
        return files,expected
    with tempfile.TemporaryDirectory() as temp:
        folder = Path(temp)
        (folder/'policy.onnx').write_bytes(files['policy.onnx'])
        (folder/'manifest.json').write_text(json.dumps(m))
        env = {k:v for k,v in os.environ.items() if k.upper() in ('SYSTEMROOT','WINDIR','TEMP','TMP','PATH','LOCALAPPDATA','APPDATA','USERPROFILE')}
        env.update(OPENBLAS_NUM_THREADS='1',OMP_NUM_THREADS='1')
        result = subprocess.run([sys.executable,'-I',str(probe),'policy.onnx','manifest.json',scene],
                                cwd=folder,env=env,timeout=75,capture_output=True,check=False)
        if result.returncode:
            detail = result.stderr.decode(errors='replace').splitlines()
            raise ValueError('Master policy runtime check failed: '+(detail[-1][:300] if detail else str(result.returncode)))
        need(json.loads(result.stdout) == expected,'Policy probe did not return the booked identity')
    tmp = cache.with_name(cache.name+'.'+uuid.uuid4().hex+'.part')
    try:
        tmp.write_text(json.dumps(expected))
        os.replace(tmp,cache)
    finally: tmp.unlink(missing_ok=True)
    return files,expected


def cell_readiness(now):
    path = os.environ.get('AGENTECH_MASTER_CELL_INTERLOCK')
    if not path:
        return None  # The site's commissioned signed-booking operation supplies no separate facility measurement.
    need(Path(path).is_absolute(),'Configured Master cell interlock path must be absolute')
    with Path(path).open('rb') as f: data = f.read(4097)
    need(len(data) <= 4096,'Invalid cell interlock record')
    signal = json.loads(data)
    stamp = datetime.fromisoformat(signal['observed_at'].replace('Z','+00:00'))
    need(signal.get('schema') == 'eaic-cell-interlock-v1' and signal.get('serial') == native.SPEC['serial']
         and stamp.tzinfo is not None and 0 <= now()-stamp.timestamp() <= 2 and signal.get('perimeter_clear') is True
         and signal.get('emergency_stop_ready') is True and signal.get('protective_stop_active') is False,
         'Fresh automatic clearance and emergency-stop readiness unavailable for booked Master')
    return signal['observed_at']


def require_target(sftp):
    expected = json.loads(PROFILE.read_bytes())['native_config_sha256']
    with sftp.open('/agibot/data/info/sn','rb') as f:
        need(f.read(128).decode().strip() == native.SPEC['serial'],'Selected robot serial differs from booked Ultra')
    for file,digest in expected.items():
        with sftp.open('/agibot/software/mc_param/robot/lx2501_3_t2d5/'+file,'rb') as f:
            need(sha256(f.read(1024*1024)).hexdigest() == digest,'Live Master Ultra model or native BMIMIC configuration changed')


def directory(sftp,path):
    try: mode = sftp.lstat(path).st_mode
    except FileNotFoundError: return False
    need(stat.S_ISDIR(mode),'Unexpected non-directory or symlink in native install path')
    return True


def exact_install(sftp, target, files):
    need(directory(sftp,target) and set(sftp.listdir(target)) == set(files),'Native install has missing or unexpected files')
    for name,expected in files.items():
        path = posixpath.join(target,name)
        meta = sftp.lstat(path)
        need(stat.S_ISREG(meta.st_mode) and meta.st_size == len(expected),'Invalid installed native member')
        with sftp.open(path,'rb') as f:
            digest = sha256()
            remaining = len(expected)
            while remaining:
                chunk = f.read(min(65536,remaining))
                need(chunk,'Truncated native member')
                digest.update(chunk)
                remaining -= len(chunk)
            need(not f.read(1) and digest.digest() == sha256(expected).digest(),'Installed native member digest changed')


def install(sftp, m, files):
    key = m['motion'].removesuffix('_0.0.1')
    root = posixpath.join(RESOURCES,key)
    version = posixpath.join(root,'0.0.1')
    target = posixpath.join(version,'unzip')
    need(directory(sftp,RESOURCES),'Native resource filesystem unavailable')
    for parent in (root,version):
        if not directory(sftp,parent):
            try: sftp.mkdir(parent)
            except OSError:
                if not directory(sftp,parent): raise
    if directory(sftp,target):
        exact_install(sftp,target,files)
        return target
    staging = posixpath.join(version,'.eaic-'+uuid.uuid4().hex)
    sftp.mkdir(staging)
    try:
        for name,data in files.items():
            with sftp.open(posixpath.join(staging,name),'wx') as out:
                out.write(data)
        exact_install(sftp,staging,files)
        try: sftp.rename(staging,target)  # Standard SFTP rename must refuse to overwrite an existing target.
        except OSError:
            if not directory(sftp,target): raise
        exact_install(sftp,target,files)
        return target
    finally:
        if directory(sftp,staging):
            for name in sftp.listdir(staging):
                if name in files: sftp.remove(posixpath.join(staging,name))
            sftp.rmdir(staging)


def preflight_booked(config):
    m = config['native_body_manifest']
    _,probe = prepare(m,config['native_body_files']['motion'])
    with native.connection(config) as client, client.open_sftp() as sftp:
        sftp.get_channel().settimeout(8)
        require_target(sftp)
        speaker = native.speaker_output(client,m['audio']['sha256']) if m['audio'] else nullcontext((None,None))
        with speaker, native.observer(client,motion=m['motion'],seconds=m['frames']/50) as (ready,_):
            return {'ready':True,'robot_model':'master','plan_sha256':config['plan_sha256'],'robot_commands_sent':False,
                    'standing':ready,'native_motion':m['motion'],'policy_probe':probe,'cell_observed_at':cell_readiness(time.time)}


def execute_booked(config,receipt,open_dispatch,admitted,confirmed,end,now,iso):
    m = config['native_body_manifest']
    args = {'motion_name':m['motion'],'audio_path':''}
    cmd = {'command_index':1,'line':1,'name':'play_body','args':args,'source_args':args,'status':'failed',
           'started_at':iso(now()),'duration_ms':0,'result':{},'error':None}
    receipt.update(owner_hold_preserved=False)
    receipt['commands'].append(cmd)
    result = cmd['result']
    result.update(asset_id=m['asset_id'],asset_sha256=m['asset_sha256'],model=m['model'],policy_sha256=m['policy']['sha256'],
        audio_sha256=m['audio']['sha256'] if m['audio'] else None,audio_output=None,motion_complete=False,
        music_played=False if m['audio'] else None,request_attempted=False)
    started = time.monotonic()
    def authorized():
        admitted()
        need(confirmed is not None and confirmed <= now() and end-now() >= required_seconds(m),
             'Signed claim or remaining booked time insufficient for native package')
    try:
        files,probe = prepare(m,config['native_body_files']['motion'])
        result['policy_probe'] = probe
        with native.connection(config) as client, client.open_sftp() as sftp:
            sftp.get_channel().settimeout(10)
            authorized()
            require_target(sftp)
            with native.observer(client,motion=m['motion'],seconds=m['frames']/50):
                cell_readiness(now)
            root = install(sftp,m,files)
            open_dispatch()
            exact_install(sftp,root,files)
            speaker = native.speaker_output(client,m['audio']['sha256']) if m['audio'] else nullcontext((None,None))
            with speaker as (log,audio), native.observer(client,True,motion=m['motion'],seconds=m['frames']/50) as (ready,out):
                authorized()
                cell = cell_readiness(now)
                receipt['owner_binding'] = ready
                result['cell_observed_at'] = cell
                result['audio_output'] = audio
                audio_path = posixpath.join(root,'audio.wav') if m['audio'] else ''
                cmd['sdk_call_started_at'] = iso(now())
                dispatched = time.monotonic()
                result['request_attempted'] = True
                response = native.play_once(client,m['motion'],audio_path)
                result.update(play_response=response['message'],serial=response['robot_sn'])
                try:
                    out.channel.settimeout(max(1,end-now()))
                    observed = native.event(out,evidence=result,motion=m['motion'])
                    final = observed.pop('final')
                    receipt['final_owner_binding'] = final
                    result.update(observed)
                    need(all(ready[k] == final[k] for k in ('settled','owner','mode','player')) and
                         int(ready['mc_stamp_ns']) <= int(observed['native_transitions'][0]['stamp_ns']) < int(final['mc_stamp_ns'])
                         and int(observed['native_transitions'][-1]['stamp_ns']) <= int(final['mc_stamp_ns'])
                         and observed['joints_fault_free'] is True and observed['terminal_standing_observed'] is True
                         and observed['joint_fault_count'] == 0 and observed['joint_faults'] == [] and observed['native_motion'] == m['motion']
                         and abs(observed['playing_seconds']-m['frames']/50) <= min(.5,m['frames']/500)
                         and observed['peak_travel_rad'] > 0,'Incomplete measured native motion or terminal ownership')
                    result['motion_complete'] = True
                finally:
                    if audio is not None:
                        native.collect_speaker_output(log,audio,max(0,min(end-now(),dispatched+m['audio']['seconds']+8-time.monotonic()))
                                                      if result['motion_complete'] else 0,
                                                      audio_path,m['audio']['seconds'])
                        result['music_played'] = audio.get('completed') is True and audio.get('transport_status') == 'confirmed'
                if audio is not None:
                    need(result['music_played'],audio.get('error') or 'Missing complete booked soundtrack evidence')
                admitted()
        cmd['status'] = 'completed'
        receipt.update(outcome='completed',completed_count=1,handoff_ready=True,handoff_mode='native-body-playback',handoff_blocker=None)
    except Exception as exc:
        cmd['error'] = {'type':type(exc).__name__,'message':str(exc)}
        raise
    finally:
        cmd['duration_ms'] = (time.monotonic()-started)*1000


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare',required=True,nargs=2,metavar=('PLAN','UPLOAD'))
    plan_path,upload = parser.parse_args().prepare
    _,receipt = prepare(json.loads(Path(plan_path).read_bytes())['native_body_manifest'],upload)
    print(json.dumps(receipt))
