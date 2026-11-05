"""Read-only admission and selector identity for EAIC's native standing gestures."""
import math
import time
from master_gateway_spec import MASTER_CONTRACT


PRESETS = MASTER_CONTRACT['native_presets']
ARM_PROFILES = MASTER_CONTRACT['native_preset_arm_gains']
COMMANDS = frozenset(PRESETS) | {'shake_head', 'turn_head'}
ARM_SUFFIXES = ('shoulder_pitch_joint', 'shoulder_roll_joint', 'shoulder_yaw_joint',
                'elbow_joint', 'wrist_yaw_joint', 'wrist_pitch_joint', 'wrist_roll_joint')
ARM_JOINTS = {side + '_' + suffix for side in ('left', 'right') for suffix in ARM_SUFFIXES}
HEART_FIRMWARE_1_0_10 = 'release-lx2501_3_t2d5-soc1-v1.0.10/lx2501_3_t2d5-soc1-v0.5.15_hotfix_v2'
WAIST_AXES = ('yaw', 'pitch', 'roll')
# Native offsets and encoder readings in the November 4 direct both-hand Heart
# receipts. These describe one stationary preset start, never a waist target.
RECORDED_HEART_OFFSETS = dict(zip(WAIST_AXES, map(math.degrees, (.04, -.044, 0.))))
RECORDED_HEART_POSE = {'yaw': (2.38, 2.64), 'pitch': (-3.86, -3.63), 'roll': (-.06, .22)}


def require(condition, message):
    if not condition:
        raise RuntimeError('Master native standing gesture: ' + message)


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def bilateral_heart(command):
    return command['name'] == 'heart' and command['args'].get('hand', 'both') in ('both', 'stand')


def needs_preset_profile(command):
    return command['name'] in PRESETS and not bilateral_heart(command)


def preset_identity(name, arguments):
    spec = PRESETS[name]
    expected = {'operation': name, 'required_posture': 'STAND_DEFAULT', 'motion_id': spec['motion_id']}
    if 'fixed_area' in spec:
        require('hand' not in arguments, name + ' has a fixed control area')
        return {**expected, 'control_area': spec['fixed_area']}
    hand = arguments.get('hand')
    if name == 'heart' and hand in (None, 'stand'):
        hand = 'both'
    require(hand in ('left', 'right') or (name == 'heart' and hand == 'both'), name + ' selector is unsupported')
    return {**expected, 'hand': hand, 'control_area': {'left':1, 'right':2, 'both':3}[hand]}


def verify_preset_identity(name, arguments, result, *, dry_run):
    expected = preset_identity(name, arguments)
    require(isinstance(result, dict) and result.get('dry_run') is dry_run and
            type(result.get('motion_id')) is int and type(result.get('control_area')) is int and
            all(result.get(k) == v for k,v in expected.items()) and result.get('hand') == expected.get('hand'),
            name + ' does not match its SDK selector, posture, motion ID or control area')


def arm_gains_match(gains, profile):
    if not isinstance(gains, dict) or set(gains) != ARM_JOINTS:
        return False
    for joint, gain in gains.items():
        axis = joint.split('_',1)[1].removesuffix('_joint')
        if not isinstance(gain,dict) or any(not finite(gain.get(k)) or abs(gain[k]-v) > .05
                for k,v in zip(('stiffness','damping'), ARM_PROFILES[profile][axis])):
            return False
    return True


def regular_preset_profile(binding, robot):
    require(all(binding.get(flag) is True for flag in ('commandPoseReady', 'standDefaultPoseVerified',
            'armPoseSettled', 'measuredPoseAtCanonical')) and type(binding.get('settleSampleCount')) is int
            and binding['settleSampleCount'] >= 3, 'preset arms have not settled at native standing')
    profile = binding.get('armGainProfile')
    gains = binding.get('armGains')
    if binding.get('presetActionsReady') is True and profile in ARM_PROFILES:
        require(arm_gains_match(gains, profile), 'measured preset gains disagree with the reported native profile')
        return {'nativePresetStartProfile': profile}
    # The robot-matched v1.0.10 classic/animation_player.yaml and all 25
    # supervised November 4 variants specify this exact bilateral start frame.
    require(arm_gains_match(gains, 'native-startup'),
            'preset needs a recognized SDK standing profile or the recorded v1.0.10 animation gains')
    control = robot._standing_waist_adjustment_control()
    actual = control.startup_compatibility_reader()
    require(actual.read_only_probe_complete is True and actual.robot_serial == control.calibration.robot_serial
            and actual.installed_build == HEART_FIRMWARE_1_0_10 and actual.arm_owner == 'native-mc'
            and all(isinstance(x,str) and x.strip() for x in (actual.boot_id,actual.native_mc_node))
            and not actual.active_diagnostic_faults and type(actual.manipulation_publishers) is int
            and actual.manipulation_publishers == 0, 'native preset firmware or owner identity differs')
    return {'nativePresetStartProfile':'v1.0.10-animation', 'nativePresetFirmware':actual.installed_build,
            'nativePresetBootId':actual.boot_id, 'nativePresetMcNode':actual.native_mc_node}


def verify_arm_observation(evidence, include_heart):
    for flag in ('standingStateVerified','nativeStandingControlActive','nativeBalanceEvidenceVerified',
                 'nativeBalanceRetained','nativeCommandOwnersVerified','completeArmCommandFrameVerified',
                 'completeArmStateFrameVerified','sdk_fresh_ready_verified','noActivePublisher'):
        require(evidence.get(flag) is True, 'missing ' + flag)
    require(evidence.get('rawGuidanceActive') is False and evidence.get('readinessObservationIncomplete') is False
            and evidence.get('manipulationPublisherNames') == [] and not evidence.get('armController')
            and not evidence.get('fault') and not evidence.get('activeFaults') and not evidence.get('guidedSides')
            and type(evidence.get('presetActionsReady')) is bool and type(evidence.get('manipulationPublishers')) is int
            and evidence['manipulationPublishers'] == 0 and evidence.get('aimdkMcMode') == 'STAND_DEFAULT'
            and evidence.get('nativeOwner') == 'native-mc', 'conflicting controller, fault or incomplete standing state')
    ages = evidence.get('telemetryAgeSeconds', {})
    require(all(finite(ages.get(k)) and 0 <= ages[k] <= .15 for k in ('state','arm','waist','head','common')),
            'missing or stale native telemetry')
    frame = evidence.get('armMeasurementFrame') or {}
    require(type(frame.get('domain_error')) is int and frame['domain_error'] == 0
            and finite(frame.get('source_stamp_unix')) and frame['source_stamp_unix'] > 0
            and finite(frame.get('source_age_seconds')) and 0 <= frame['source_age_seconds'] <= .15,
            'faulted or stale measured arm frame')
    data = [evidence.get(k) for k in ('positions','measuredArmPositions','measuredArmVelocities')]
    gains = evidence.get('armGains')
    require(all(isinstance(v,dict) and set(v) == ARM_JOINTS and all(map(finite,v.values())) for v in data)
            and isinstance(gains,dict) and set(gains) == ARM_JOINTS, 'incomplete arm frames')
    if include_heart:
        require(all(evidence.get(k) is True for k in ('commandPoseReady','standDefaultPoseVerified',
                    'armPoseSettled','measuredPoseAtCanonical')) and type(evidence.get('settleSampleCount')) is int
                and evidence['settleSampleCount'] >= 3, 'Heart needs a freshly settled bilateral neutral pose')
        if not evidence['presetActionsReady']:
            # Match the entire observed bilateral frame. Interpolating between
            # recognized profiles would also admit unobserved mixtures.
            for joint, gain in gains.items():
                expected = (20., 2.) if '_wrist_' in joint else (50., 3.)
                require(isinstance(gain, dict) and all(finite(gain.get(k)) and abs(gain[k]-v) <= .05
                        for k, v in zip(('stiffness', 'damping'), expected)),
                        'Heart arm gains differ from the observed native idle frame')
    for suffix in ARM_SUFFIXES:
        pair = [gains[side+'_'+suffix] for side in ('left','right')]
        maximum = 40 if suffix.startswith('wrist') else (100 if suffix in ('shoulder_pitch_joint','shoulder_roll_joint') else 50)
        for g in pair:
            require(isinstance(g,dict) and all(finite(g.get(k)) and g[k] > 0 for k in ('stiffness','damping'))
                    and g['stiffness'] <= maximum+.05 and g['damping'] <= 4.05
                    and not (abs(g['stiffness']-12.) <= .05 and abs(g['damping']-1.5) <= .05),
                    'unpowered, raw-guidance or invalid arm gain')
        # Only Heart uses these arm actuators. Its accepted range spans the installed
        # native startup/CPG gains and the observed 50/3 proximal, 20/2 wrist frame.
        if include_heart:
            minimum = 20 if suffix.startswith('wrist') else (50 if suffix == 'shoulder_pitch_joint' else 40)
            for side,g in zip(('left','right'),pair):
                require(minimum-.05 <= g['stiffness'] <= maximum+.05 and .95 <= g['damping'] <= 4.05,
                        'arm gains outside observed native control bounds')
                name = side+'_'+suffix
                target = .4 if suffix == 'shoulder_pitch_joint' else -1.2 if suffix == 'elbow_joint' else 0.
                require(abs(data[0][name]-target) <= .02 and abs(data[1][name]-target) <= math.radians(3.5)
                        and abs(data[2][name]) <= math.radians(2.), 'Heart arm endpoint outside native neutral bounds')
            require(all(abs(pair[0][k]-pair[1][k]) <= .05 for k in ('stiffness','damping')),
                    'asymmetric native arm gain frame')


def stamp_ns(stamp):
    require(isinstance(stamp,dict) and type(stamp.get('sec')) is int and stamp['sec'] > 0 and
            type(stamp.get('nanosec')) is int and 0 <= stamp['nanosec'] < 1_000_000_000, 'missing native timestamp')
    return stamp['sec']*1_000_000_000 + stamp['nanosec']


def check_waist(sample, axes):
    for axis, limits in axes.items():
        target = limits.standing_neutral_measured_degrees
        tolerance = limits.neutral_endpoint_tolerance_degrees or limits.endpoint_tolerance_degrees
        require(finite(target) and all(finite(value) and abs(value-target) <= tolerance for value in
                (sample.waist_position_degrees[axis],sample.waist_command_degrees[axis]))
                and abs(sample.native_offset_degrees[axis]) <= 1e-5 and
                abs(sample.waist_velocity_degrees_per_second[axis]) <= limits.settled_velocity_degrees_per_second,
                'commanded or measured waist outside native neutral bounds: ' + axis)


def check_native_waist(sample, axes):
    # MC may make balance corrections to its servo targets while its requested
    # body offset stays at zero. Servo targets are not absolute restore targets.
    require(set(axes) == set(WAIST_AXES), 'incomplete X2 waist limits')
    for axis in WAIST_AXES:
        limits = axes[axis]
        low, high = limits.native_offset_min_radians, limits.native_offset_max_radians
        measured, commanded = sample.waist_position_degrees[axis], sample.waist_command_degrees[axis]
        require(finite(low) and finite(high) and low < high and finite(measured) and finite(commanded)
                and finite(commanded-measured) and all(low <= math.radians(v) <= high for v in (measured,commanded)),
                'measured or commanded waist outside documented X2 bounds: ' + axis)
    offsets = sample.native_offset_degrees
    neutral = all(abs(offsets[a]) <= 1e-5 for a in WAIST_AXES)
    recorded = all(abs(offsets[a] - RECORDED_HEART_OFFSETS[a]) <= 1e-5
                   and RECORDED_HEART_POSE[a][0] <= sample.waist_position_degrees[a] <= RECORDED_HEART_POSE[a][1]
                   for a in WAIST_AXES)
    require(neutral or recorded, 'waist is outside the native neutral or recorded Heart start')
    require(all(abs(sample.waist_velocity_degrees_per_second[a]) <= 1.0 for a in WAIST_AXES),
            'native waist is moving')
    return 'zero-native-offset' if neutral else 'recorded-heart-offset'


def observe_idle(robot, *, include_heart):
    common = '/aima/mc/common/state'
    topics, telemetry, axes, identity = [common], None, None, {}
    if include_heart:
        from agentech.robots.master.standing_waist_adjustment_control import _validate_compatibility
        from agentech.robots.master.standing_waist_telemetry import STANDING_WAIST_TOPICS, StandingWaistTelemetry
        control = robot._standing_waist_adjustment_control()
        actual = control.startup_compatibility_reader()
        current_native = actual.installed_build == HEART_FIRMWARE_1_0_10
        require(actual.robot_serial == control.calibration.robot_serial and actual.read_only_probe_complete is True
                and actual.native_body_pose_subscriber is True and not actual.active_diagnostic_faults
                and (actual.arm_owner, actual.waist_owner, actual.leg_owner, actual.mc_common_owner) == ('native-mc',) * 4
                and all(type(count) is int and count == 0 for count in
                        (actual.manipulation_publishers, actual.competing_agentech_body_pose_publishers)),
                'native controller identity, ownership or diagnostic check failed')
        identity = {'bootId':actual.boot_id,'mcNode':actual.native_mc_node,'installedBuild':actual.installed_build}
        require(all(isinstance(v,str) and v.strip() for v in identity.values()), 'native owner identity is unavailable')
        if not current_native:
            _validate_compatibility(actual, control.calibration)
            robot._load_cached_waist_neutral_for_restore()
            control = robot._standing_waist_adjustment_control()
            calibration = control._neutral_calibration(actual) if control.neutral_reference is not None else control.calibration
            axes = calibration.axes
            require(set(axes) == set(WAIST_AXES), 'incomplete native waist calibration')
        telemetry = StandingWaistTelemetry(waist_owner=actual.waist_owner, leg_owner=actual.leg_owner)
        topics = list(STANDING_WAIST_TOPICS)
    with robot._client() as client:
        mode = client.get_mode()
        require(type(mode.get('code')) is int and mode['code'] == 0 and mode.get('action_desc') == 'STAND_DEFAULT'
                and type(mode.get('status')) is int and mode['status'] == 100, 'native standing mode is not stable')
        baseline = stamp_ns(mode['stamp'])
        client.await_channels(topics,timeout=robot.timeout)
        subs = client.subscribe_topics(topics)
        try:
            end = time.monotonic()+min(6.,robot.timeout)
            previous, first, source, samples, first_waist = None, None, None, 0, None
            while time.monotonic() < end:
                packet = client.receive_topic(timeout=max(.001,end-time.monotonic()))
                if telemetry is not None:
                    telemetry.ingest_checked(packet)
                if packet.topic != common:
                    continue
                v = packet.message
                h = v['header']
                stamp, seq = stamp_ns(h['stamp']), h['sequence']
                if first is None and stamp <= baseline:
                    continue
                require(type(seq) is int and seq >= 0 and (previous is None or
                    (seq > previous[0] and 0 < stamp-previous[1] <= 250_000_000)), 'nonadvancing native frames')
                previous = (seq,stamp)
                action, player, current = v['action_info'], v['motion_status']['player_state']['value'], v['input_source']
                require(action['action_desc'] == 'STAND_DEFAULT' and action['status']['value'] == 100
                        and type(player) is int and player == 0 and isinstance(current,dict)
                        and isinstance(current.get('name'),str) and current['name'].strip()
                        and (source is None or current == source), 'native animation is unfinished or input owner changed')
                source = current
                now = time.monotonic()
                if telemetry is not None:
                    try:
                        sample = telemetry.sample(now=now)
                    except RuntimeError as error:
                        if 'complete fresh telemetry' in str(error) and first is None:
                            continue
                        raise
                    if current_native:
                        identity['waistReference'] = check_native_waist(sample,control.calibration.axes)
                    else:
                        check_waist(sample,axes)
                        identity['waistReference'] = 'qualified-waist-reference'
                    if first_waist is None:
                        first_waist = sample
                    for axis in WAIST_AXES:
                        require(abs(sample.waist_position_degrees[axis]-first_waist.waist_position_degrees[axis]) <= .1
                                and abs(sample.native_offset_degrees[axis]-first_waist.native_offset_degrees[axis]) <= 1e-5
                                and sample.waist_stiffness[axis] == first_waist.waist_stiffness[axis]
                                and sample.waist_damping[axis] == first_waist.waist_damping[axis],
                                'waist pose or gains changed during the neutral observation')
                if first is None:
                    first = (seq,stamp,now)
                samples += 1
                if samples >= 3 and stamp-first[1] >= 250_000_000 and now-first[2] >= .25:
                    return {'samples':samples, 'firstSequence':first[0], 'lastSequence':seq,
                            'playerState':player,'dwellMs':(stamp-first[1])/1e6,'inputSource':source['name'],**identity}
            raise RuntimeError('Master native standing gesture idle observation timed out')
        finally:
            client.unsubscribe_topics(list(subs.values()))
