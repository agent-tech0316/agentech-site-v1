"""One pinned Master Ultra play_body request with its bundled audio and a measured receipt."""
from contextlib import contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shlex
import time

HERE = Path(__file__).resolve().parent
SPEC = json.loads((HERE / 'master-happy-dance.json').read_text(encoding='utf8'))
ASSETS = '/agibot/nfs/soc0/var/robot_proxy/resources/linkcraft_resource_onnx_ffkuaile/0.0.1/unzip'
OUTER_HOST_KEY_SHA256 = '48dc8321a96ec7603649588758ca2f6836ff136377f00505fb55c465b2e033d0'
SOURCE_HASH = sha256(SPEC['source'].encode()).hexdigest()
ARGS = {'motion_name':SPEC['motion'], 'audio_path':''}


def validate(config, plan):
    asset = config.get('native_body_asset_id')
    if (not isinstance(asset,str) or not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',asset)
            or config.get('recovery_owner_binding') or plan.get('asset_id') != asset
            or plan['submission_id'] != 'master-body-'+asset or plan['source_sha256'] != SOURCE_HASH
            or plan['commands'] != [{'name':'play_body','args':ARGS,'line':1}]):
        raise ValueError('Native plan does not match the approved Happy Dance ZIP')


@contextmanager
def connection(config):
    import paramiko
    with paramiko.SSHClient() as client:
        client.load_system_host_keys()
        client.connect(config['host'],port=config.get('ssh_port',22),username=config.get('ssh_username','run'),
                       password=os.environ['AGENTECH_MASTER_SSH_PASSWORD'],timeout=4,auth_timeout=5,banner_timeout=5,
                       look_for_keys=False,allow_agent=False)
        if sha256(client.get_transport().get_remote_server_key().asbytes()).hexdigest() != OUTER_HOST_KEY_SHA256:
            raise RuntimeError('Selected robot is not the qualified Master Ultra')
        _,out,_ = client.exec_command('cd '+shlex.quote(ASSETS)+' && sha256sum policy.onnx audio.wav',timeout=8)
        expected = [SPEC['policy'],'policy.onnx',SPEC['audio'],'audio.wav']
        if out.read(512).decode().split() != expected or out.channel.recv_exit_status() != 0:
            raise RuntimeError('Installed Happy Dance policy or bundled WAV does not match the submitted ZIP')
        yield client


def event(out):
    line = out.readline(8192)
    if not line:
        raise RuntimeError('Master telemetry observer disconnected')
    value = json.loads(line)
    if 'error' in value: raise RuntimeError(value['error'])
    return value


@contextmanager
def observer(client,watch=False):
    script = (HERE/'master_body_observer.py').read_text(encoding='utf8')
    command = ("source /opt/ros/humble/setup.bash && source /agibot/software/common/share/aimdk_msgs/local_setup.bash && "
               "export FASTRTPS_DEFAULT_PROFILES_FILE=/agibot/software/entry/cfg/ros_dds_configuration.xml && "
               "exec python3 -u - "+shlex.quote(SPEC['motion'])+(' watch' if watch else ' check'))
    stdin,out,_ = client.exec_command('bash -c '+shlex.quote(command),timeout=12)
    try:
        stdin.write(script); stdin.flush(); stdin.channel.shutdown_write()
        ready = event(out)['ready']
        yield ready,out
    finally:
        out.channel.close()


def preflight(config):
    with connection(config) as client, observer(client) as (ready,_):
        return {'ready':True,'robot_model':'master','plan_sha256':config['plan_sha256'],'robot_commands_sent':False,
                'standing':ready,'native_motion':SPEC['motion'],'policy_sha256':SPEC['policy'],'audio_sha256':SPEC['audio']}


def play_once(client):
    url = 'http://10.0.1.40:5000/lingxi/interaction/play_body?motion_name='+SPEC['motion']+'&audio_path='
    _,out,_ = client.exec_command("curl --noproxy '*' --max-time 10 --silent --show-error --write-out '\\n%{http_code}' "+shlex.quote(url),timeout=12)
    raw = out.read(4096).decode()
    if out.channel.recv_exit_status() != 0: raise RuntimeError('Native request outcome unknown')
    payload,_,status = raw.strip().rpartition('\n')
    response = json.loads(payload)
    if status != '200' or response.get('message') != 'Play success' or response.get('robot_sn') != SPEC['serial']:
        raise RuntimeError('Native player did not accept the request on the qualified Master')
    return response


def execute(config, receipt, open_dispatch, admitted, confirmed, end, now, iso):
    # Preparation does not dispatch; the single HTTP request follows the viewer and operator gates.
    cmd = {'command_index':1,'line':1,'name':'play_body','args':ARGS,'source_args':ARGS,'status':'failed',
           'started_at':iso(now()),'duration_ms':0,'result':{},'error':None}
    receipt.update(owner_hold_preserved=False)
    receipt['commands'].append(cmd)
    evidence = cmd['result']
    started = time.monotonic()
    try:
        with connection(config) as client:
            open_dispatch()
            with observer(client,True) as (ready,out):
                admitted()
                if confirmed is None or not 0 <= now()-confirmed <= 90 or end-now() < 75:
                    raise RuntimeError('On-site operator confirmation or remaining booked time expired before playback')
                receipt['owner_binding'] = ready
                cmd['sdk_call_started_at'] = iso(now())
                evidence.update(asset_id=config['native_body_asset_id'],zip_sha256=SPEC['zip'],policy_sha256=SPEC['policy'],
                                audio_sha256=SPEC['audio'],bundled_audio='audio.wav',request_attempted=True)
                response = play_once(client)
                evidence.update(play_response=response['message'],serial=response['robot_sn'])
                out.channel.settimeout(min(80,max(1,end-now())))
                observation = event(out)
                receipt['final_owner_binding'] = observation.pop('final')
                evidence.update(observation)
                admitted()
        cmd['status'] = 'completed'
        receipt.update(outcome='completed',completed_count=1,handoff_ready=True,handoff_mode='native-body-playback',handoff_blocker=None)
    except Exception as exc:
        cmd['error'] = {'type':type(exc).__name__,'message':str(exc)}
        raise
    finally:
        cmd['duration_ms'] = (time.monotonic()-started)*1000
