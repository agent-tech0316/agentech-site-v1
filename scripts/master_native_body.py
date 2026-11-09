"""One pinned Master Ultra play_body request with its bundled audio and a measured receipt."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import posixpath
import re
import shlex
import time
from urllib.parse import urlencode

HERE = Path(__file__).resolve().parent
SPEC = json.loads((HERE / 'master-happy-dance.json').read_text(encoding='utf8'))
ASSETS = '/agibot/nfs/soc0/var/robot_proxy/resources/linkcraft_resource_onnx_ffkuaile/0.0.1/unzip'
AUDIO_PATH = ASSETS + '/audio.wav'
AUDIO_BOARD = '/agibot/nfs/soc2'
AUDIO_OBSERVATION_SECONDS = 75
MISSING_SPEAKER_END = 'Missing full speaker HAL playback evidence for the bundled WAV'
ROBOT_TIMEZONE = timezone(timedelta(hours=8))
OUTER_HOST_KEY_SHA256 = '48dc8321a96ec7603649588758ca2f6836ff136377f00505fb55c465b2e033d0'
SOURCE_HASH = sha256(SPEC['source'].encode()).hexdigest()
ARGS = {'motion_name':SPEC['motion'], 'audio_path':''}


def validate(config, plan):
    if str(plan.get('submission_id','')).startswith('master-body-v2-') or 'native_body_manifest' in config or 'native_body_manifest' in plan:
        from master_booked_body import validate_plan
        return validate_plan(config, plan)
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
        if 'native_body_manifest' in config:
            yield client
            return
        _,out,_ = client.exec_command('cd '+shlex.quote(ASSETS)+' && sha256sum policy.onnx audio.wav',timeout=8)
        expected = [SPEC['policy'],'policy.onnx',SPEC['audio'],'audio.wav']
        if out.read(512).decode().split() != expected or out.channel.recv_exit_status() != 0:
            raise RuntimeError('Installed Happy Dance policy or bundled WAV does not match the submitted ZIP')
        yield client


def event(out, *, evidence=None, motion=SPEC["motion"]):
    line = out.readline(8192)
    if not line:
        raise RuntimeError('Master telemetry observer disconnected')
    value = json.loads(line)
    if 'error' in value:
        partial = value.get('partial_observation')
        if (evidence is not None and isinstance(partial,dict) and partial.get('native_motion') == motion
                and partial.get('joints_fault_free') is False):
            evidence['partial_observation'] = partial
        raise RuntimeError(value['error'])
    return value


@contextmanager
def observer(client,watch=False,*,handoff=False,motion=SPEC["motion"],seconds=None):
    script = (HERE/'master_body_observer.py').read_text(encoding='utf8')
    command = ("source /opt/ros/humble/setup.bash && source /agibot/software/common/share/aimdk_msgs/local_setup.bash && "
               "export FASTRTPS_DEFAULT_PROFILES_FILE=/agibot/software/entry/cfg/ros_dds_configuration.xml && "
               "exec python3 -u - "+shlex.quote(motion)+(' watch' if watch else ' handoff' if handoff else ' check') +
               ((' '+str(float(seconds))) if seconds is not None else ''))
    stdin,out,_ = client.exec_command('bash -c '+shlex.quote(command),timeout=12)
    try:
        stdin.write(script); stdin.flush(); stdin.channel.shutdown_write()
        ready = event(out)['ready']
        yield ready,out
    finally:
        out.channel.close()


@contextmanager
def speaker_output(client,audio_hash=SPEC["audio"]):
    # 'latest' is absolute on the speaker board. A direct traversal from the gateway board reads its own log tree.
    with client.open_sftp() as sftp:
        sftp.get_channel().settimeout(4)
        directory = posixpath.basename(sftp.readlink(AUDIO_BOARD+'/log/latest'))
        if not re.fullmatch(r'log_\d{8}_\d{6}',directory):
            raise RuntimeError('Cannot locate the current Master speaker-board HAL log')
        with sftp.open(AUDIO_BOARD+'/var/hal_audio/config/audio_config.json','rb') as f:
            cfg = json.loads(f.read(2048))
        volume = cfg.get('playback_volume')
        if cfg.get('is_mute') is not False or type(volume) is not int or not 0 < volume <= 100:
            raise RuntimeError('Master speaker is muted or lacks a positive configured playback volume')
        with sftp.open(f'{AUDIO_BOARD}/log/{directory}/hal_audio/hal_audio.log','rb') as log:
            # SFTPFile.seek(..., SEEK_END) silently substitutes zero when stat fails.
            log.seek(log.stat().st_size)
            yield log, dict(board='soc2',file='audio.wav',sha256=audio_hash,volume=volume,muted=False,completed=False)


def parse_audio_output(lines, path=AUDIO_PATH, seconds=65):
    """Bind HAL playback-state transitions to the exact decoded WAV, within one dispatch's log window."""
    result = {'completed':False}
    started = None
    play_owner = None
    pcm_bytes = round(seconds*32000)
    min_duration = seconds - min(2,seconds*.1)
    max_duration = seconds + (3 if path == AUDIO_PATH else min(2,seconds*.1))
    wav = f'WAV params: sr=16000Hz, ch=1, bps=16, bytes={pcm_bytes} file:{path}'
    for line in lines.splitlines():
        _, separator, message = line.rpartition('] ')
        if not separator or not line.startswith('['):
            continue
        if message == wav and 'opened_at_robot' not in result:
            stamp = datetime.fromisoformat(line[1:line.index(']')]).replace(tzinfo=ROBOT_TIMEZONE)
            result.update(opened_at_robot=stamp.isoformat(),sample_rate_hz=16000,channels=1,bits_per_sample=16,pcm_bytes=pcm_bytes)
            continue
        if 'opened_at_robot' not in result:
            continue
        stamp = datetime.fromisoformat(line[1:line.index(']')]).replace(tzinfo=ROBOT_TIMEZONE)
        if re.search(r'\[(?:Error|Fatal|Critical)\].*\[(?:audio_player|audio_playback_driver)\.cpp:',line,re.I):
            result['error'] = 'Speaker HAL playback error: '+message[:300]
            break
        if message in ('get_volume 0','playback volume 0','get_playback_device 1') or message.startswith('Setting volume: 0 '):
            result['error'] = 'Built-in speaker was silent or deselected during playback'
            break
        if message == 'StopAudioPlay Enter' or message.startswith(('PlayFile ', 'WAV params:')):
            result['error'] = 'Speaker playback interrupted or replaced before the WAV finished'
            break
        if message.startswith('pcm_started successfully'):
            result['pcm_device_started_at_robot'] = stamp.isoformat()
            continue
        if message == 'pcm_started false' and started is not None and (stamp-started).total_seconds() < min_duration:
            result['error'] = 'Speaker PCM output stopped early'
            break
        state = re.fullmatch(r'AudioPlayer::pub_play_state (.+) state ([12])',message)
        if state is None:
            continue
        owner, phase = state.groups()
        if phase == '1':
            if owner not in ('tts',path) or (play_owner is not None and play_owner != owner):
                result['error'] = 'A different speaker source started before the WAV finished'
                break
            if started is None:
                started, play_owner = stamp, owner
                result['started_at_robot'] = stamp.isoformat()
        elif started is not None:
            if owner != play_owner:
                result['error'] = 'Speaker reported the end of a different playback source'
                break
            duration = (stamp-started).total_seconds()
            result.update(finished_at_robot=stamp.isoformat(),playing_seconds=duration,completed=min_duration <= duration <= max_duration)
            if not result['completed']:
                result['error'] = f'Speaker played {duration:g}s of the {seconds:g}s WAV'
            break
    return result


def collect_speaker_output(log, evidence, wait_seconds, path=AUDIO_PATH, seconds=65):
    deadline = time.monotonic()+wait_seconds
    data = bytearray()
    try:
        while True:
            chunk = log.read(65536)
            if chunk:
                data.extend(chunk)
                if len(data) > 2*1024*1024:
                    raise RuntimeError('Speaker HAL log exceeded the booked observation window')
                evidence.update(parse_audio_output(data.decode('utf8',errors='replace'),path,seconds))
            if evidence.get('completed'):
                evidence['transport_status'] = 'confirmed'
                return
            if evidence.get('error'):
                evidence['transport_status'] = 'failed'
                return
            if len(chunk) == 65536:
                continue
            remaining = deadline-time.monotonic()
            if remaining <= 0:
                evidence.update(transport_status='end_not_observed',diagnostic=MISSING_SPEAKER_END)
                return
            time.sleep(min(.3,remaining))
    except Exception as exc:
        evidence['transport_status'] = 'failed'
        evidence['error'] = f'Speaker HAL observation failed: {exc}'


def fault_free_motion(result, before, after):
    return (all(b.get('mode') == 'STAND_DEFAULT' and b.get('settled') is True and b.get('player') == 0 for b in (before,after))
            and before.get('owner') == after.get('owner') and re.fullmatch(r'mc_ros2_node\d+',before.get('owner') or '') is not None
            and result.get('native_motion') == SPEC['motion'] and result.get('terminal_standing_observed') is True
            and result.get('joints_fault_free') is True and result.get('joint_fault_count') == 0 and result.get('joint_faults') == []
            and 55 <= result.get('playing_seconds',0) <= 75 and result.get('peak_travel_rad',0) > .1)


def music_played(audio, result, observed_seconds):
    if (audio.get('board') != 'soc2' or audio.get('file') != 'audio.wav' or audio.get('sha256') != SPEC['audio']
            or audio.get('muted') is not False or type(audio.get('volume')) is not int or not 0 < audio['volume'] <= 100
            or (audio.get('pcm_bytes'),audio.get('sample_rate_hz'),audio.get('channels'),audio.get('bits_per_sample')) != (2080000,16000,1,16)
            or audio.get('error')):
        return False
    if audio.get('completed') is True:
        return audio.get('transport_status') == 'confirmed'
    if (audio.get('transport_status') != 'end_not_observed' or audio.get('diagnostic') != MISSING_SPEAKER_END
            or 'finished_at_robot' in audio or 'playing_seconds' in audio or observed_seconds < AUDIO_OBSERVATION_SECONDS-.01):
        return False
    # The file-open, player and physical PCM timestamps are native robot time. Correlate them with the same dance.
    transitions = result.get('native_transitions',[])
    if not isinstance(transitions,list) or any(not isinstance(t,dict) for t in transitions):
        return False
    modes = [t.get('mode') for t in transitions]
    if modes not in (['BMIMIC','STAND_DEFAULT'],['BMIMIC','BMIMIC_STEP','STAND_DEFAULT']):
        return False
    if (transitions[0].get('motion') != SPEC['motion'] or transitions[0].get('player') != 2
            or any(t.get('motion') != '' or t.get('player') != 0 for t in transitions[1:])):
        return False
    try:
        times = [int(t['stamp_ns']) / 1e9 for t in transitions]
        opened,started,pcm = (datetime.fromisoformat(audio[k]).timestamp()
                              for k in ('opened_at_robot','started_at_robot','pcm_device_started_at_robot'))
    except (KeyError,TypeError,ValueError,OverflowError):
        return False
    return (all(a < b for a,b in zip(times,times[1:])) and opened <= started <= pcm and times[0] <= pcm
            and times[-1]-pcm >= 55 and 0 <= times[1]-times[0]-result.get('playing_seconds',0) <= .501)


def preflight(config):
    if 'native_body_manifest' in config:
        from master_booked_body import preflight_booked
        return preflight_booked(config)
    from master_booked_body import cell_readiness
    with connection(config) as client, speaker_output(client) as (_,audio), observer(client) as (ready,_):
        cell_readiness(time.time)
        return {'ready':True,'robot_model':'master','plan_sha256':config['plan_sha256'],'robot_commands_sent':False,
                'standing':ready,'native_motion':SPEC['motion'],'policy_sha256':SPEC['policy'],'audio_sha256':SPEC['audio'],
                'speaker_volume':audio['volume']}


def play_once(client,motion=SPEC["motion"],audio_path=AUDIO_PATH):
    # The submitted empty selector means this approved ZIP's WAV. The installed proxy requires its absolute path.
    query = urlencode({'motion_name':motion,'audio_path':audio_path})
    url = 'http://10.0.1.40:5000/lingxi/interaction/play_body?'+query
    _,out,_ = client.exec_command("curl --noproxy '*' --max-time 10 --silent --show-error --write-out '\\n%{http_code}' "+shlex.quote(url),timeout=12)
    raw = out.read(4096).decode()
    if out.channel.recv_exit_status() != 0: raise RuntimeError('Native request outcome unknown')
    payload,_,status = raw.strip().rpartition('\n')
    response = json.loads(payload)
    if status != '200' or response.get('message') != 'Play success' or response.get('robot_sn') != SPEC['serial']:
        raise RuntimeError('Native player did not accept the request on the qualified Master')
    return response


def execute(config, receipt, open_dispatch, admitted, confirmed, end, now, iso):
    if 'native_body_manifest' in config:
        from master_booked_body import execute_booked
        return execute_booked(config, receipt, open_dispatch, admitted, confirmed, end, now, iso)
    # The single HTTP request follows the viewer and start-authorization checks.
    cmd = {'command_index':1,'line':1,'name':'play_body','args':ARGS,'source_args':ARGS,'status':'failed',
           'started_at':iso(now()),'duration_ms':0,'result':{},'error':None}
    receipt.update(owner_hold_preserved=False)
    receipt['commands'].append(cmd)
    evidence = cmd['result']
    evidence.update(motion_complete=False,music_played=False)
    started = time.monotonic()
    try:
        with connection(config) as client:
            open_dispatch()
            with speaker_output(client) as (log,audio), observer(client,True) as (ready,out):
                admitted()
                if confirmed is None or not 0 <= now()-confirmed <= 90 or end-now() < 75:
                    raise RuntimeError('Start authorization or remaining booked time expired before playback')
                from master_booked_body import cell_readiness
                cell_readiness(now)
                receipt['owner_binding'] = ready
                cmd['sdk_call_started_at'] = iso(now())
                dispatched = time.monotonic()
                audio_deadline = dispatched+AUDIO_OBSERVATION_SECONDS
                evidence.update(asset_id=config['native_body_asset_id'],zip_sha256=SPEC['zip'],policy_sha256=SPEC['policy'],
                                audio_sha256=SPEC['audio'],bundled_audio='audio.wav',audio_output=audio,request_attempted=True)
                ended_standing = False
                try:
                    response = play_once(client)
                    evidence.update(play_response=response['message'],serial=response['robot_sn'])
                    out.channel.settimeout(min(80,max(1,end-now())))
                    observation = event(out,evidence=evidence)
                    receipt['final_owner_binding'] = observation.pop('final')
                    evidence.update(observation)
                    ended_standing = True
                    evidence['motion_complete'] = fault_free_motion(evidence, ready, receipt['final_owner_binding'])
                    if not evidence['motion_complete']:
                        raise RuntimeError('Missing fault-free native playback and settled standing evidence')
                finally:
                    # A completed standing transition permits passive audio tracking even when the motion faulted.
                    partial = evidence.get('partial_observation',{})
                    terminal = ended_standing or partial.get('terminal_standing_observed') is True
                    remaining = max(0,min(audio_deadline-time.monotonic(),end-now())) if terminal else 0
                    collect_speaker_output(log,audio,remaining)
                    evidence['music_played'] = music_played(audio,evidence,time.monotonic()-dispatched)
                if not evidence['music_played']:
                    raise RuntimeError(audio.get('error') or audio.get('diagnostic') or MISSING_SPEAKER_END)
                admitted()
        cmd['status'] = 'completed'
        receipt.update(outcome='completed',completed_count=1,handoff_ready=True,handoff_mode='native-body-playback',handoff_blocker=None)
    except Exception as exc:
        cmd['error'] = {'type':type(exc).__name__,'message':str(exc)}
        raise
    finally:
        cmd['duration_ms'] = (time.monotonic()-started)*1000
