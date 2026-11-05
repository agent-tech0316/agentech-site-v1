"""Native Heart and head admission. All transport and telemetry frames are offline."""
import copy
import json
import math
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import master_native_gesture_readiness as gesture


def observation():
    # Unchanged recorded fields, including the real 14-joint gain values. The
    # historical summary omits freshness/arrays. Fill those only in this simulation.
    recorded = json.loads((Path(__file__).parent/'fixtures/master-heart-native-observation-20261105.json').read_text())
    positions = {j:.4 if 'shoulder_pitch' in j else -1.2 if 'elbow' in j else 0. for j in gesture.ARM_JOINTS}
    return {**recorded, 'nativeStandingControlActive':True,'nativeBalanceRetained':True,
            'sdk_fresh_ready_verified':True,'nativeOwner':'native-mc','noActivePublisher':True,
            'rawGuidanceActive':False,'readinessObservationIncomplete':False,'manipulationPublisherNames':[],
            'telemetryAgeSeconds':dict.fromkeys(('arm','waist','head','state','common'),.03),
            'armMeasurementFrame':{'domain_error':0,'source_stamp_unix':1.,'source_age_seconds':.02},
            'positions':positions,'measuredArmPositions':dict(positions),'measuredArmVelocities':dict.fromkeys(positions,0.),
            'standDefaultPoseVerified':True,'commandPoseReady':True,'settleSampleCount':6}


class NativeGestureAdmissionTests(unittest.TestCase):
    def test_observed_gains_can_admit_native_heart_and_head_without_claiming_restoration(self):
        snapshot = observation()
        for include_heart in (True,False):
            unmodified = copy.deepcopy(snapshot)
            gesture.verify_arm_observation(snapshot,include_heart)
            self.assertEqual(unmodified,snapshot)
            self.assertFalse(snapshot['presetActionsReady'])
            self.assertEqual(snapshot['armGainProfile'],'unknown')
        snapshot['measuredArmPositions']['left_elbow_joint'] += .5
        gesture.verify_arm_observation(snapshot,False)
        with self.assertRaises(RuntimeError):
            gesture.verify_arm_observation(snapshot,True)

    def test_stale_missing_raw_nonfinite_foreign_or_unsettled_observations_fail_closed(self):
        for changes in ({'rawGuidanceActive':True},{'manipulationPublishers':False},{'nativeStandingControlActive':False},
                {'manipulationPublisherNames':['foreign']},{'armController':{'phase':'fault-holding'}},
                {'fault':'hot'},{'activeFaults':['native source']},{'nativeBalanceEvidenceVerified':False},
                {'telemetryAgeSeconds':{}},{'settleSampleCount':2},{'measuredPoseAtCanonical':False},
                {'readinessObservationIncomplete':True},{'armMeasurementFrame':{'domain_error':1}},
                {'measuredArmVelocities':{}},{'armGains':{}},{'positions':{}}):
            with self.subTest(changes=changes), self.assertRaises(RuntimeError):
                gesture.verify_arm_observation({**observation(),**changes},True)
        for field,value in [('stiffness',0),('damping',None),('stiffness',1e6),('stiffness',math.inf),('damping',.01)]:
            snapshot = observation()
            snapshot['armGains']['right_elbow_joint'][field] = value
            with self.subTest(field=field,value=value), self.assertRaises(RuntimeError):
                gesture.verify_arm_observation(snapshot,True)
        snapshot = observation()
        snapshot['armGains']['right_elbow_joint'] = {'stiffness':12.,'damping':1.5}
        with self.assertRaises(RuntimeError):
            gesture.verify_arm_observation(snapshot,False)

    def test_waist_requires_all_commanded_and_measured_endpoints_and_velocity(self):
        axes = {axis:SimpleNamespace(standing_neutral_measured_degrees=.2,neutral_endpoint_tolerance_degrees=.75,
                endpoint_tolerance_degrees=.3,settled_velocity_degrees_per_second=1.) for axis in ('yaw','pitch','roll')}
        sample = SimpleNamespace(waist_command_degrees=dict.fromkeys(axes,.2),waist_position_degrees=dict.fromkeys(axes,.2),
                native_offset_degrees=dict.fromkeys(axes,0.),waist_velocity_degrees_per_second=dict.fromkeys(axes,0.))
        gesture.check_waist(sample, axes)
        for field in ('waist_command_degrees','waist_position_degrees','native_offset_degrees','waist_velocity_degrees_per_second'):
            for axis in axes:
                changed = copy.deepcopy(sample)
                getattr(changed,field)[axis] = 2.
                with self.subTest(field=field,axis=axis),self.assertRaises(RuntimeError):
                    gesture.check_waist(changed,axes)

    def test_unfinished_native_animation_and_repeated_frames_do_not_grant_handoff(self):
        topic = '/aima/mc/common/state'
        def packet(seq,stamp,player=0):
            return SimpleNamespace(topic=topic,message={'header':{'sequence':seq,'stamp':{'sec':9,'nanosec':stamp}},
                'action_info':{'action_desc':'STAND_DEFAULT','status':{'value':100}},'input_source':{'name':'native'},
                'motion_status':{'player_state':{'value':player}}})
        for mode in ('idle','playing','repeated'):
            client = Mock()
            client.get_mode.return_value={'code':0,'action_desc':'STAND_DEFAULT','status':100,'stamp':{'sec':9,'nanosec':0}}
            client.subscribe_topics.return_value={topic:7}
            client.receive_topic.side_effect=[packet(1,100_000_000),packet(1 if mode=='repeated' else 2,230_000_000,
                                               2 if mode=='playing' else 0),packet(3,360_000_000)]
            robot=SimpleNamespace(timeout=2.,_client=lambda:nullcontext(client))
            clock=iter(i*.06 for i in range(100))
            with self.subTest(mode=mode),patch.object(gesture.time,'monotonic',side_effect=lambda:next(clock)):
                if mode=='idle':
                    result=gesture.observe_idle(robot,include_heart=False)
                    self.assertEqual((result['samples'],result['playerState'],result['dwellMs']),(3,0,260.))
                else:
                    with self.assertRaises(RuntimeError): gesture.observe_idle(robot,include_heart=False)
            client.unsubscribe_topics.assert_called_once_with([7])

    def test_recorded_heart_start_requires_the_three_measured_and_native_axes_together(self):
        axes = {axis: SimpleNamespace(native_offset_min_radians=low,native_offset_max_radians=high)
            for axis,(low,high) in zip(gesture.WAIST_AXES,((-3.43,2.382),(-.314,.314),(-.488,.488)))}
        sample=SimpleNamespace(native_offset_degrees=gesture.RECORDED_HEART_OFFSETS.copy(),
            waist_position_degrees={a:sum(bounds)/2 for a,bounds in gesture.RECORDED_HEART_POSE.items()},
            waist_velocity_degrees_per_second=dict.fromkeys(gesture.WAIST_AXES,0.),
            waist_command_degrees=dict.fromkeys(gesture.WAIST_AXES,0.))
        self.assertEqual(gesture.check_native_waist(sample,axes),'recorded-heart-offset')
        for key in ('native_offset_degrees','waist_position_degrees','waist_velocity_degrees_per_second'):
            for axis in gesture.WAIST_AXES:
                changed=copy.deepcopy(sample)
                getattr(changed,key)[axis]+=3.
                with self.subTest(axis=axis,field=key),self.assertRaises(RuntimeError):
                    gesture.check_native_waist(changed,axes)
        sample.native_offset_degrees = dict.fromkeys(gesture.WAIST_AXES,0.)
        sample.waist_position_degrees = {'yaw':.148,'pitch':-1.426,'roll':.013}
        sample.waist_command_degrees = {'yaw':0.,'pitch':-4.44,'roll':-.83}
        self.assertEqual(gesture.check_native_waist(sample,axes),'zero-native-offset')
        for field in ('waist_command_degrees','waist_position_degrees'):
            for value in (float('nan'),45.):
                changed=copy.deepcopy(sample)
                getattr(changed,field)['pitch'] = value
                with self.subTest(field=field,value=value),self.assertRaises(RuntimeError):
                    gesture.check_native_waist(changed,axes)
