"""Passive ROS observation for the qualified Master Ultra native body package."""
import json
import math
import sys
import time


def observe(motion, watch):
    import rclpy
    from aimdk_msgs.msg import JointStateArray, McCommonState
    from aimdk_msgs.srv import GetMcAction
    from rclpy.qos import qos_profile_sensor_data
    from sensor_msgs.msg import Imu

    rclpy.init()
    node = rclpy.create_node('eaic_body_observer', enable_rosout=False, start_parameter_services=False)
    samples, seen, baseline = {}, {}, {}
    sizes = {'arm': 14, 'leg': 12, 'waist': 3}
    faults = set()
    peak = 0.0

    def sample(key, msg):
        nonlocal peak
        if key in sizes:
            names = {j.name for j in msg.joints}
            if (msg.state.value or len(names) != sizes[key] or len(msg.joints) != sizes[key]
                    or (key in baseline and names != baseline[key].keys()) or
                    any(j.error_code or not all(math.isfinite(v) for v in (j.position, j.velocity, j.effort))
                        for j in msg.joints)):
                faults.add(key)
            if key in baseline and not faults:
                peak = max(peak, *(abs(j.position-baseline[key][j.name]) for j in msg.joints))
        samples[key], seen[key] = msg, time.monotonic()

    def ownership():
        owners = [[p.node_name for p in node.get_publishers_info_by_topic('/aima/hal/joint/'+key+'/command')]
                  for key in sizes]
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
        if mode != 'STAND_DEFAULT' or status not in (100, 200) or body != 1 or player != 0 or name:
            return False
        for key in ('torso', 'chest'):
            a, g = samples[key].linear_acceleration, samples[key].angular_velocity
            if not (8 < math.hypot(a.x,a.y,a.z) < 11.5 and math.hypot(g.x,g.y,g.z) < .15):
                return False
        return all(abs(j.velocity) < .12 for key in sizes for j in samples[key].joints)

    def fresh():
        return len(seen) == 6 and max(time.monotonic()-t for t in seen.values()) < .15

    def spin():
        rclpy.spin_once(node, timeout_sec=.025)
        if faults:
            raise RuntimeError('Invalid joint feedback: '+', '.join(sorted(faults)))

    try:
        for key in sizes:
            node.create_subscription(JointStateArray, '/aima/hal/joint/'+key+'/state',
                                     lambda m,k=key: sample(k,m), qos_profile_sensor_data)
        for key in ('torso','chest'):
            node.create_subscription(Imu, '/aima/hal/imu/'+key+'/state',
                                     lambda m,k=key: sample(k,m), qos_profile_sensor_data)
        node.create_subscription(McCommonState, '/aima/mc/common/state',lambda m: sample('mc',m),qos_profile_sensor_data)
        query = node.create_client(GetMcAction,'/aimdk_5Fmsgs/srv/GetMcAction')
        if not query.wait_for_service(timeout_sec=3):
            raise RuntimeError('Native mode query unavailable')
        future = query.call_async(GetMcAction.Request())
        rclpy.spin_until_future_complete(node,future,timeout_sec=2)
        if not future.done() or future.result() is None:
            raise RuntimeError('Native mode query timed out')
        response = future.result()
        if response.header.code or response.info.action_desc != 'STAND_DEFAULT':
            raise RuntimeError(f'Native mode query returned {response.info.action_desc!r}, code {response.header.code}; STAND_DEFAULT required')
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
        baseline.update({k:{j.name:j.position for j in samples[k].joints} for k in sizes})
        print(json.dumps({'ready':binding}),flush=True)
        if not watch: return
        begin = time.monotonic()
        first = last = steady = None
        check_owner_at = begin + 1
        while time.monotonic()-begin < 78:
            spin()
            now = time.monotonic()
            if not fresh(): raise RuntimeError('Lost fresh body playback telemetry')
            if now >= check_owner_at:
                if ownership() != owner: raise RuntimeError('Native MC owner changed')
                check_owner_at = now+1
            mode,status,_,player,name = signature()
            if name and name != motion: raise RuntimeError('A different native motion is active')
            if mode == 'BMIMIC' and player == 2 and name == motion and status in (100,200):
                if last is not None and now-last > .5:
                    raise RuntimeError('Native playback was interrupted')
                if first is None: first = now
                last, steady = now, None
            elif first is not None and settled():
                if steady is None: steady = now
                if now-steady >= .4:
                    duration = last-first
                    if not 55 <= duration <= 75 or peak <= .1 or ownership() != owner:
                        raise RuntimeError('Incomplete dance duration, displacement or final ownership')
                    print(json.dumps({'final':binding,'playing_seconds':duration,'peak_travel_rad':peak,
                                      'native_motion':motion,'joints_fault_free':True}),flush=True)
                    return
            else:
                steady = None
            if first is None and now-begin > 8: raise RuntimeError('Native player did not start the booked motion')
        raise RuntimeError('Native player did not return to settled standing in time')
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    try:
        observe(sys.argv[1],sys.argv[2]=='watch')
    except Exception as exc:
        print(json.dumps({'error':str(exc)}),flush=True)
        sys.exit(1)
