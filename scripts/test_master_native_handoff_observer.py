"""Offline terminal service checks; no network or filesystem writes."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock
from tempfile import TemporaryDirectory
import json
import math
from types import SimpleNamespace as NS
import master_body_observer as body_observer

scripts = Path(__file__).resolve().parent
sys.path.insert(0,str(scripts))
spec=importlib.util.spec_from_file_location('master_handoff_test_observer',scripts/'verify-master-native-handoff.py')
observer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)


class BodyWindowTests(unittest.TestCase):
    def test_playback_records_nominal_step_and_standing_but_preserves_an_ankle_fault(self):
        motion='pinned-dance'; playback=body_observer.BodyPlayback(motion)
        def frame(stamp,mode,player,name):
            return NS(header=NS(stamp=NS(sec=10+stamp//10,nanosec=(stamp%10)*100000000)),
                      action_info=NS(action_desc=mode,status=NS(value=100)),motion_status=NS(player_state=NS(value=player),motion=name))
        for stamp in range(594): playback.add_mc(frame(stamp,'BMIMIC',2,motion))
        playback.joint_fault('Invalid joint feedback: leg stamp_ns=123 left_ankle_roll_joint.error_code=533')
        for stamp in range(594,629): playback.add_mc(frame(stamp,'BMIMIC_STEP',0,''))
        playback.add_mc(frame(629,'STAND_DEFAULT',0,''))
        result=playback.evidence(2.5,True)
        self.assertEqual(result['playing_seconds'],59.3)
        self.assertEqual([x['mode'] for x in result['native_transitions']],['BMIMIC','BMIMIC_STEP','STAND_DEFAULT'])
        self.assertEqual(result['joint_fault_count'],1)
        self.assertFalse(result['joints_fault_free'])
        self.assertTrue(result['terminal_standing_observed'])
        self.assertIn('error_code=533',result['joint_faults'][0])
        with self.assertRaisesRegex(RuntimeError,r'interrupted'):
            playback.add_mc(frame(630,'BMIMIC',2,motion))

    def test_fault_message_preserves_joint_or_frame_and_native_stamp(self):
        joints = [NS(name=name, position=0., velocity=0., effort=0., error_code=0)
                  for name in body_observer.JOINTS['leg']]
        packet = NS(header=NS(stamp=NS(sec=13,nanosec=27)), state=NS(value=0), joints=joints)
        joint = next(j for j in joints if j.name == 'left_knee_joint')
        joint.error_code = 37
        with self.assertRaisesRegex(RuntimeError,r'leg.*13000000027.*left_knee_joint.error_code=37'):
            body_observer.check_joint_feedback('leg',packet)
        joint.error_code, joint.effort = 0, math.nan
        with self.assertRaisesRegex(RuntimeError,r'left_knee_joint.effort=nan'):
            body_observer.check_joint_feedback('leg',packet)
        joint.effort, packet.state.value = 0., 2
        with self.assertRaisesRegex(RuntimeError,r'frame_state=2'):
            body_observer.check_joint_feedback('leg',packet)
        packet.state.value = 0
        packet.joints = [j for j in joints if j != joint]
        with self.assertRaisesRegex(RuntimeError,r'missing=.*left_knee_joint'):
            body_observer.check_joint_feedback('leg',packet)

    def test_idle_requires_new_stamped_frames_and_rejects_a_running_player(self):
        window = body_observer.BodyWindow(1_000_000_000)
        frame = NS(header=NS(stamp=NS(sec=1,nanosec=20)),action_info=NS(action_desc='STAND_DEFAULT',status=NS(value=100)),
                   motion_status=NS(player_state=NS(value=0),motion=''),body_status=NS(value=1),input_source=NS(name='app_proxy'))
        window.add('mc',frame)
        with self.assertRaisesRegex(RuntimeError,r'mc.*timestamp'):
            window.add('mc',frame)
        frame.header.stamp.nanosec, frame.motion_status.player_state.value = 40, 2
        with self.assertRaisesRegex(RuntimeError,r'player=2'):
            window.add('mc',frame)


class TerminalObservationTests(unittest.TestCase):
    def test_waiting_booking_can_observe_but_a_claim_or_another_owner_prevents_it(self):
        with TemporaryDirectory() as directory:
            root=Path(directory); cfg={'session_id':'104','attempt_id':'historical'}
            historical={'executionAttemptId':'historical','executionStatus':'failed','status':'finished',
                        'masterHandoffReady':False,'end':'2026-11-05T18:00:00Z'}
            waiting={'executionModel':'master','status':'staged','start':'2026-11-08T00:00:00Z','end':'2099-01-01T00:00:00Z'}
            def write(row,extra=None):
                (root/'state.json').write_text(json.dumps({'sessions':{'104':historical,'106':row,**(extra or {})}}))
            write(waiting); observer.check_idle(root,cfg,'106')
            with self.assertRaises(ValueError): observer.check_idle(root,cfg)
            for change in ({'pid':23},{'executionAttemptId':'claimed'},{'status':'running'},{'endCleanupStatus':'running'}):
                write({**waiting,**change})
                with self.assertRaises(ValueError): observer.check_idle(root,cfg,'106')
            write(waiting,{'107':{**waiting,'status':'running'}})
            with self.assertRaises(ValueError): observer.check_idle(root,cfg,'106')

    def test_identical_clock_tick_rounds_to_receipt_precision_but_future_sample_is_rejected(self):
        end=math.nextafter(1794094800.123457,0)
        self.assertGreater(observer.runner._timestamp(observer.runner._iso(end)),end)
        sample={k:True for k in observer.READY_FLAGS}
        sample.update(ownerMode='native-standing',presetActionsReady=True,nativeOwner='native-mc',
                      aimdkMcMode='STAND_DEFAULT',manipulationPublishers=0,nativeGestureOwnerVerified=True,nativeMotionIdleVerified=True)
        def binding(t,seq):
            return {**sample,'observed_at':observer.runner._iso(t),'nativeIdleObservation':
                    {'inputSource':'native','firstSequence':seq,'lastSequence':seq+1}}
        observer.check_observations(binding(end-1,10),binding(end,15),False,end-2,end)
        with self.assertRaisesRegex(ValueError,'timestamps'):
            observer.check_observations(binding(end-1,10),binding(end+.001,15),False,end-2,end)
        with self.assertRaisesRegex(ValueError,'sequences'):
            observer.check_observations(binding(end-1,10),binding(end,11),False,end-2,end)
    @staticmethod
    def fixture(stamp=150, task_id=0, state=1):
        client=Mock()
        def frame(stamp):
            return dict(code=0,action_desc='STAND_DEFAULT',status=100,stamp={'sec':1,'nanosec':stamp})
        client.get_mode.side_effect=[frame(100),frame(200)]
        client.get_preset_state.return_value={'code':0,'task_id':task_id,'state':state,'stamp':{'sec':1,'nanosec':stamp}}
        return client

    def test_terminal_task_must_match_live_native_mode_clock(self):
        client=self.fixture()
        result=observer.terminal_zero_task(client)
        self.assertEqual(result['terminal_ns'],'1000000150')
        client.get_preset_state.assert_called_once_with(0)

    def test_rejects_old_future_moving_and_wrong_task_responses(self):
        for kw in ({'stamp':99},{'stamp':201},{'task_id':1},{'task_id':False},{'state':2}):
            with self.subTest(**kw),self.assertRaises(ValueError):
                observer.terminal_zero_task(self.fixture(**kw))
