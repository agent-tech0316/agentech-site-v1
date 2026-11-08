"""Passive ROS observation for the qualified Master Ultra native body package."""
import json
import math
from pathlib import Path
import re
import sys
import time
import uuid


def bilateral(names):
    return {f'{side}_{name}_joint' for side in ('left','right') for name in names}


JOINTS = {'arm':bilateral(('shoulder_pitch','shoulder_roll','shoulder_yaw','elbow','wrist_yaw','wrist_pitch','wrist_roll')),
          'leg':bilateral(('hip_pitch','hip_roll','hip_yaw','knee','ankle_pitch','ankle_roll')),
          'waist':{'waist_yaw_joint','waist_pitch_joint','waist_roll_joint'}, 'head':{'head_yaw_joint','head_pitch_joint'}}
STREAMS = (*JOINTS,'hand','torso','chest','mc')


def stamp_ns(header):
    stamp = header.stamp
    if not (stamp.sec > 0 and 0 <= stamp.nanosec < 1_000_000_000):
        raise RuntimeError('Missing native frame timestamp')
    return stamp.sec * 1_000_000_000 + stamp.nanosec


def check_joint_feedback(group, msg):
    names = {j.name for j in msg.joints}
    expected = JOINTS[group]
    problems = []
    if msg.state.value:
        problems.append(f'frame_state={msg.state.value}')
    if names != expected or len(msg.joints) != len(expected):
        problems.append(f'count={len(msg.joints)} missing={sorted(expected-names)} unexpected={sorted(names-expected)}')
    for joint in msg.joints:
        if joint.error_code:
            problems.append(f'{joint.name}.error_code={joint.error_code}')
        for field in ('position','velocity','effort'):
            value = getattr(joint,field)
            if not math.isfinite(value):
                problems.append(f'{joint.name}.{field}={value!r}')
    if problems:
        stamp = msg.header.stamp
        raise RuntimeError(f'Invalid joint feedback: {group} stamp_ns={stamp.sec*1_000_000_000+stamp.nanosec} '+', '.join(problems))


def imu_motion(msg):
    a,g = msg.linear_acceleration,msg.angular_velocity
    return math.hypot(a.x,a.y,a.z),math.hypot(g.x,g.y,g.z)


class BodyWindow:
    """Terminal, stationary source frames collected by one newly opened receiver."""
    def __init__(self, baseline):
        self.baseline = baseline
        self.frames, self.joints, self.imus = {}, {}, {}
        self.input_source = None
        self.hand_types = None

    def add(self,key,msg):
        stamp = stamp_ns(msg.header)
        if stamp <= self.baseline and key not in self.frames:
            return
        frame = self.frames.get(key)
        if frame:
            gap = (stamp-int(frame['last_ns']))/1e6
            if not 0 < gap <= 150:
                raise RuntimeError(f'{key} frame timestamp stalled or skipped {gap:g} ms')
            frame.update(last_ns=str(stamp),count=frame['count']+1,max_gap_ms=max(frame['max_gap_ms'],gap))
        else:
            self.frames[key] = dict(first_ns=str(stamp),last_ns=str(stamp),count=1,max_gap_ms=0.)
        if key == 'mc':
            mode,status,body = msg.action_info.action_desc,msg.action_info.status.value,msg.body_status.value
            player,motion,source = msg.motion_status.player_state.value,msg.motion_status.motion,msg.input_source.name
            if (mode != 'STAND_DEFAULT' or status != 100 or body != 1 or player != 0 or motion != ''
                    or not source.strip() or self.input_source not in (None,source)):
                raise RuntimeError(f'Body player not in terminal native standing: mode={mode} status={status} body={body} player={player} motion={motion!r} input={source!r}')
            self.input_source = source
        elif key == 'hand':
            self.hand_types = [msg.left_hand_type.value,msg.right_hand_type.value]
            if self.hand_types != [0,0] or msg.left_hands or msg.right_hands:
                raise RuntimeError('Hand configuration differs from the pinned native body package')
        elif key in JOINTS:
            velocity = max(abs(j.velocity) for j in msg.joints)
            if velocity >= .12:
                raise RuntimeError(f'{key} is not settled: peak joint velocity={velocity:g} rad/s')
            state = self.joints.setdefault(key,dict(names=sorted(JOINTS[key]),peak_velocity=0.,frame_state=0,max_error_code=0))
            state['peak_velocity'] = max(state['peak_velocity'],velocity)
        else:
            acc,gyro = imu_motion(msg)
            if not (8 < acc < 11.5 and gyro < .15):
                raise RuntimeError(f'{key} IMU not settled: acceleration={acc:g} gyro={gyro:g}')
            state = self.imus.setdefault(key,dict(min_acc=acc,max_acc=acc,peak_gyro=gyro))
            state.update(min_acc=min(state['min_acc'],acc),max_acc=max(state['max_acc'],acc),peak_gyro=max(state['peak_gyro'],gyro))

    def complete(self):
        return len(self.frames) == len(STREAMS) and all(f['count'] >= 3 and int(f['last_ns'])-int(f['first_ns']) >= 400_000_000
                                                        for f in self.frames.values())


class BodyPlayback:
    """Track the native player on its own messages and retain faults independently of its endpoint."""
    def __init__(self,motion):
        self.motion = motion
        self.first = self.last = self.previous = None
        self.transitions, self.faults = [], []
        self.fault_count = 0

    def add_mc(self,msg):
        stamp = stamp_ns(msg.header)
        mode,status = msg.action_info.action_desc,msg.action_info.status.value
        player,name = msg.motion_status.player_state.value,msg.motion_status.motion
        if name and name != self.motion: raise RuntimeError('A different native motion is active')
        playing = mode == 'BMIMIC' and player == 2 and name == self.motion and status in (100,200)
        if self.first is None and not playing: return
        if self.previous is not None and not 0 < stamp-self.previous <= 500_000_000:
            raise RuntimeError('Native playback source timestamps stalled or skipped')
        self.previous = stamp
        prior = self.transitions[-1]['mode'] if self.transitions else None
        if playing:
            if prior not in (None,'BMIMIC'): raise RuntimeError('Native playback was interrupted and restarted')
            if self.first is None: self.first = stamp
            self.last = stamp
        elif (mode not in ('BMIMIC_STEP','STAND_DEFAULT') or player != 0 or name or status not in (100,200)
                or (prior == 'STAND_DEFAULT' and mode == 'BMIMIC_STEP')):
            raise RuntimeError(f'Unexpected native player transition: mode={mode} player={player} motion={name!r} status={status}')
        if mode != prior:
            self.transitions.append(dict(mode=mode,player=player,motion=name,stamp_ns=str(stamp)))

    def joint_fault(self,detail):
        self.fault_count += 1
        if len(self.faults) < 6: self.faults.append(detail[:600])

    def evidence(self,peak,terminal):
        dt = (self.last-self.first)/1e9 if self.first is not None else 0.
        return dict(native_motion=self.motion,playing_seconds=dt,peak_travel_rad=peak,native_transitions=self.transitions,
                    terminal_standing_observed=terminal,joints_fault_free=not self.fault_count,
                    joint_fault_count=self.fault_count,joint_faults=self.faults)


def body_owners(node):
    def publishers(topic): return [p.node_name for p in node.get_publishers_info_by_topic(topic)]
    command_topics = {key:'/aima/hal/joint/'+key+'/command' for key in (*JOINTS,'hand')}
    command_topics['mc'] = '/aima/mc/common/state'
    owners = {key:publishers(topic) for key,topic in command_topics.items()}
    native = owners['mc']
    if len(native) != 1 or not re.fullmatch(r'mc_ros2_node\d+',native[0]) or any(names != native for names in owners.values()):
        raise RuntimeError(f'Native MC does not exclusively own arm, leg, waist and common state: {owners}')
    manipulation = publishers('/aima/mc/manipulation')
    pose = '/aima/mc/body_pose'
    competing = [p for p in publishers(pose) if p != 'app_proxy' and not re.fullmatch(r'soc0_rc\d+',p)]
    subscribers = [sub.node_name for sub in node.get_subscriptions_info_by_topic(pose)]
    if manipulation or competing or native[0] not in subscribers:
        raise RuntimeError(f'Body pose control is not exclusively native: manipulation={manipulation} competing={competing} subscribers={subscribers}')
    return dict(owner=native[0],command_owners={k:v[0] for k,v in owners.items()},manipulation_publishers=0,
                competing_body_pose_publishers=0,mc_body_pose_subscriber=True)


def observe(motion, watch, handoff=False):
    import rclpy
    from aimdk_msgs.msg import HandStateArray, JointStateArray, McCommonState
    from aimdk_msgs.srv import GetMcAction
    from rclpy.qos import qos_profile_sensor_data
    from sensor_msgs.msg import Imu

    rclpy.init()
    receiver = uuid.uuid4()
    node = rclpy.create_node('eaic_body_observer_'+receiver.hex, enable_rosout=False, start_parameter_services=False)
    # A permanently ready high-rate sensor subscription must not starve the service response.
    mode_node = rclpy.create_node('eaic_body_mode_'+receiver.hex,enable_rosout=False,start_parameter_services=False) if handoff else node
    samples, seen, baseline = {}, {}, {}
    groups = tuple(JOINTS) if handoff else ('arm','leg','waist')
    window = None
    playback = None
    invalid_groups = set()
    peak = 0.0

    def sample(key, msg):
        nonlocal peak
        if key in JOINTS:
            try:
                check_joint_feedback(key,msg)
            except RuntimeError as error:
                if playback is None or playback.first is None: raise
                # The only request already went to the native player. Continue passive
                # observation so its final state and this latched failure both survive.
                playback.joint_fault(str(error))
                invalid_groups.add(key)
            else:
                invalid_groups.discard(key)
                if key in baseline:
                    peak = max(peak, *(abs(j.position-baseline[key][j.name]) for j in msg.joints))
        if playback is not None and key == 'mc':
            playback.add_mc(msg)
        if window is not None:
            window.add(key,msg)
        samples[key], seen[key] = msg, time.monotonic()

    def ownership():
        owners = [[p.node_name for p in node.get_publishers_info_by_topic('/aima/hal/joint/'+key+'/command')]
                  for key in groups]
        if (len(owners[0]) != 1 or not owners[0][0].startswith('mc_ros2_node') or
                any(v != owners[0] for v in owners) or node.get_publishers_info_by_topic('/aima/mc/manipulation')):
            raise RuntimeError('Native MC does not exclusively own arm, leg and waist commands')
        return owners[0][0]

    def signature():
        m = samples['mc']
        return (m.action_info.action_desc, m.action_info.status.value, m.body_status.value,
                m.motion_status.player_state.value, m.motion_status.motion)

    def settled():
        mode, status, body, player, name = signature()
        if invalid_groups or mode != 'STAND_DEFAULT' or status not in (100, 200) or body != 1 or player != 0 or name:
            return False
        for key in ('torso', 'chest'):
            acc,gyro = imu_motion(samples[key])
            if not (8 < acc < 11.5 and gyro < .15):
                return False
        return all(abs(j.velocity) < .12 for key in groups for j in samples[key].joints)

    def fresh():
        return len(seen) == (len(STREAMS) if handoff else 6) and max(time.monotonic()-t for t in seen.values()) < .15

    def spin():
        rclpy.spin_once(node, timeout_sec=.025)

    def query_standing(phase):
        future = query.call_async(GetMcAction.Request())
        rclpy.spin_until_future_complete(mode_node,future,timeout_sec=2)
        if not future.done() or future.result() is None:
            raise RuntimeError('Native mode query timed out '+phase)
        response = future.result()
        if (response.header.code or response.info.action_desc != 'STAND_DEFAULT'
                or (handoff and response.info.status.value != 100)):
            raise RuntimeError(f'Native mode query returned {response.info.action_desc!r}, code {response.header.code}, status {response.info.status.value}; settled STAND_DEFAULT required')
        return response.header

    try:
        for key in groups:
            node.create_subscription(JointStateArray, '/aima/hal/joint/'+key+'/state',
                                     lambda m,k=key: sample(k,m), qos_profile_sensor_data)
        if handoff:
            node.create_subscription(HandStateArray,'/aima/hal/joint/hand/state',lambda m:sample('hand',m),qos_profile_sensor_data)
        for key in ('torso','chest'):
            node.create_subscription(Imu, '/aima/hal/imu/'+key+'/state',
                                     lambda m,k=key: sample(k,m), qos_profile_sensor_data)
        node.create_subscription(McCommonState, '/aima/mc/common/state',lambda m: sample('mc',m),qos_profile_sensor_data)
        query = mode_node.create_client(GetMcAction,'/aimdk_5Fmsgs/srv/GetMcAction')
        if not query.wait_for_service(timeout_sec=3):
            raise RuntimeError('Native mode query unavailable')
        if handoff:
            # DDS may discover the endpoint GID before its ROS node name. Require a
            # complete live graph before anchoring either end of the measured dwell.
            discovery = time.monotonic()+3
            while True:
                try:
                    initial = body_owners(node)
                    break
                except RuntimeError:
                    if time.monotonic() >= discovery: raise
                    spin()
                    time.sleep(.025)
            header = query_standing('before observation')
            before = stamp_ns(header)
            window = BodyWindow(before)
            begin = time.monotonic()
            next_owner = begin+.15
            while time.monotonic()-begin < 5:
                spin()
                elapsed = time.monotonic()-begin
                if time.monotonic() >= next_owner:
                    if body_owners(node) != initial: raise RuntimeError('Native body ownership changed during observation')
                    next_owner = time.monotonic()+.15
                if elapsed >= .4 and fresh() and window.complete(): break
            else:
                raise RuntimeError(f'Incomplete fresh body observation: {window.frames}')
            measured,window = window,None
            after = stamp_ns(query_standing('after observation'))
            if (not 0 < after-before <= 6_000_000_000 or body_owners(node) != initial or
                    any(not 0 <= after-int(f['last_ns']) <= 150_000_000 for f in measured.frames.values())):
                raise RuntimeError('Body observation no longer bounded by fresh native mode and ownership')
            binding = dict(**initial,receiver_id=str(receiver),boot_id=Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
                serial=Path('/agibot/data/info/sn').read_text().strip(),mode='STAND_DEFAULT',status=100,body=1,player=0,motion='',settled=True,
                input_source=measured.input_source,mode_before_ns=str(before),mode_after_ns=str(after),dwell_ms=elapsed*1000,
                frames=measured.frames,joints=measured.joints,imus=measured.imus,hand_types=measured.hand_types)
            print(json.dumps({'ready':binding},allow_nan=False),flush=True)
            return
        query_standing('before observation')
        deadline, steady = time.monotonic()+5, None
        while time.monotonic() < deadline:
            spin()
            if fresh() and settled():
                if steady is None: steady = time.monotonic()
                if time.monotonic()-steady >= .4: break
            else:
                steady = None
        else:
            raise RuntimeError('Master did not reach fresh settled native standing')
        owner = ownership()
        binding = {'owner':owner,'mode':'STAND_DEFAULT','player':0,'settled':True}
        baseline.update({k:{j.name:j.position for j in samples[k].joints} for k in groups})
        print(json.dumps({'ready':binding}),flush=True)
        if not watch: return
        begin = time.monotonic()
        playback,steady = BodyPlayback(motion),None
        check_owner_at = begin + 1
        while time.monotonic()-begin < 78:
            spin()
            now = time.monotonic()
            if not fresh(): raise RuntimeError('Lost fresh body playback telemetry')
            if now >= check_owner_at:
                if ownership() != owner: raise RuntimeError('Native MC owner changed')
                check_owner_at = now+1
            if playback.first is not None and signature()[1] == 100 and settled():
                if steady is None: steady = now
                if now-steady >= .4:
                    if ownership() != owner:
                        raise RuntimeError('Native MC owner changed at playback endpoint')
                    result = playback.evidence(peak,True)
                    if playback.fault_count:
                        print(json.dumps({'error':playback.faults[0],'partial_observation':result},allow_nan=False),flush=True)
                        return
                    if not 55 <= result['playing_seconds'] <= 75 or peak <= .1:
                        raise RuntimeError('Incomplete dance duration, displacement or final ownership')
                    print(json.dumps({'final':binding,**result},allow_nan=False),flush=True)
                    return
            else:
                steady = None
            if playback.first is None and now-begin > 8: raise RuntimeError('Native player did not start the booked motion')
        raise RuntimeError('Native player did not return to settled standing in time')
    except Exception as error:
        if playback is None or not playback.fault_count: raise
        print(json.dumps({'error':playback.faults[0]+'; '+str(error),'partial_observation':playback.evidence(peak,False)},allow_nan=False),flush=True)
    finally:
        if mode_node is not node: mode_node.destroy_node()
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    try:
        observe(sys.argv[1],sys.argv[2]=='watch',sys.argv[2]=='handoff')
    except Exception as exc:
        print(json.dumps({'error':str(exc)}),flush=True)
        sys.exit(1)
