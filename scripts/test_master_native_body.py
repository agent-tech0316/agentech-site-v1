"""Replay the measured native dance through the real plan runner, with no robot connection."""
from contextlib import contextmanager
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shlex
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

import master_native_body as body

module = importlib.util.spec_from_file_location("body_runner",Path(__file__).with_name("trusted-master-runner.py"))
runner = importlib.util.module_from_spec(module)
module.loader.exec_module(runner)


class BundledAudio(unittest.TestCase):
    def test_one_vendor_request_selects_the_pinned_wav(self):
        reply = json.dumps({'message':'Play success','robot_sn':body.SPEC['serial']})
        out = io.BytesIO((reply+'\n200').encode())
        out.channel = SimpleNamespace(recv_exit_status=lambda:0)
        client = Mock()
        client.exec_command.return_value = (None,out,None)
        body.play_once(client)
        client.exec_command.assert_called_once()
        url = urlsplit(shlex.split(client.exec_command.call_args.args[0])[-1])
        self.assertEqual(url.path,'/lingxi/interaction/play_body')
        self.assertEqual(parse_qs(url.query,keep_blank_values=True),
                         {'motion_name':[body.SPEC['motion']],'audio_path':[body.ASSETS+'/audio.wav']})

    def test_native_audio_requires_this_wav_and_its_full_playback(self):
        selected = body.ASSETS+'/audio.wav'
        def line(clock, message):
            return f'[2026-11-08 {clock}][Info][2609][audio_player.cpp:445] {message}\n'
        def capture(path=selected, finish='07:49:46.010001', interrupt=False, owner='tts', finish_owner=None):
            events = line('07:48:40.778001',f'WAV params: sr=16000Hz, ch=1, bps=16, bytes=2080000 file:{path}')
            events += line('07:48:41.010001',f'AudioPlayer::pub_play_state {owner} state 1')
            if interrupt:
                events += line('07:48:42.110001','StopAudioPlay Enter')
            if finish:
                events += line(finish,f'AudioPlayer::pub_play_state {finish_owner or owner} state 2')
            return body.parse_audio_output(events)
        captured = capture()
        self.assertTrue(captured['completed'])
        self.assertEqual(captured['playing_seconds'],65.0)
        self.assertEqual(captured['pcm_bytes'],2080000)
        self.assertIn('+08:00',captured['started_at_robot'])
        self.assertFalse(capture('/tmp/other/audio.wav')['completed'])
        self.assertFalse(capture(finish=None)['completed'])
        self.assertFalse(capture(finish='07:48:42.010001')['completed'])
        self.assertFalse(capture(interrupt=True)['completed'])
        self.assertTrue(capture(owner=selected)['completed'])
        self.assertFalse(capture(owner='/tmp/other/audio.wav')['completed'])
        self.assertFalse(capture(owner=selected,finish_owner='tts')['completed'])
        beginning=line('07:48:40.100001',f'WAV params: sr=16000Hz, ch=1, bps=16, bytes=2080000 file:{selected}')
        beginning+=line('07:48:41.010001',f'AudioPlayer::pub_play_state {selected} state 1')
        for contrary in ('pcm_started false','playback volume 0','get_playback_device 1'):
            with self.subTest(contrary=contrary):
                self.assertIn('error',body.parse_audio_output(beginning+line('07:48:42.110001',contrary)))


class NativePackageExecution(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.now = 1800000000.0
        self.asset = "b7f76821-a087-404e-a2ac-dfd7fe260aff"
        self.plan = dict(version=2,robot_model="master",asset_id=self.asset,source_sha256=body.SOURCE_HASH,
                         submission_id="master-body-"+self.asset,commands=[dict(name="play_body",args=body.ARGS,line=1)])
        self.config = dict(schema_version=1,enabled=True,robot_model="master",sdk_root=str(self.root),host="fixture",
                           session_id="12",attempt_id="test",submission_id=self.plan["submission_id"],
                           native_body_asset_id=self.asset,source_sha256=body.SOURCE_HASH,
                           scheduled_start=runner._iso(self.now),scheduled_end=runner._iso(self.now+120),
                           lease_file=str(self.root/"lease"))
        self.calls = []
        self.confirmed = runner._iso(self.now)
        self.end = dict(owner="mc_ros2_node3097",mode="STAND_DEFAULT",player=0,settled=True)
        self.finish_event = dict(final=self.end,playing_seconds=59.4,peak_travel_rad=2.542,
                                 native_motion=body.SPEC["motion"],joints_fault_free=True,terminal_standing_observed=True,
                                 joint_fault_count=0,joint_faults=[])
        self.audio_finish = '07:49:46.010001'
        self.hal_lines = None

    def execute(self, response=None, cancel=False, claimed_at=None):
        plan = self.root/"plan.json"
        plan.write_bytes(json.dumps(self.plan).encode())
        self.config["plan_sha256"] = hashlib.sha256(plan.read_bytes()).hexdigest()
        cfg = self.root/"deployment.json"; cfg.write_text(json.dumps(self.config))
        cancel_file = self.root/"cancel"
        def sleep(seconds):
            self.now += seconds
        @contextmanager
        def connection(_):
            yield object()
        @contextmanager
        def observer(_,watch):
            self.assertTrue(watch)
            if cancel: cancel_file.touch()
            yield self.end, type("Channel",(),{"channel":type("Timeout",(),{"settimeout":lambda *_:None})()})()
        @contextmanager
        def speaker(_):
            audio = (
                f'[2026-11-08 07:48:40.778001][Info][2609][audio_player.cpp:239] WAV params: sr=16000Hz, ch=1, bps=16, bytes=2080000 file:{body.AUDIO_PATH}\n'
                '[2026-11-08 07:48:41.010001][Info][2609][audio_player.cpp:445] AudioPlayer::pub_play_state tts state 1\n'
                f'[2026-11-08 {self.audio_finish}][Info][2609][audio_player.cpp:445] AudioPlayer::pub_play_state tts state 2\n')
            yield io.BytesIO((audio if self.hal_lines is None else self.hal_lines).encode()), dict(board='soc2',file='audio.wav',sha256=body.SPEC['audio'],volume=100,muted=False,completed=False)
        def play(_):
            self.calls.append(self.now)
            if isinstance(response,Exception): raise response
            return {"message":"Play success","robot_sn":body.SPEC["serial"]}
        read_event = body.event
        def event(out, **kwargs):
            self.now += 64
            if isinstance(self.finish_event,Exception): raise self.finish_event
            return read_event(io.BytesIO((json.dumps(self.finish_event)+'\n').encode()), **kwargs)
        clock = SimpleNamespace(monotonic=lambda:self.now,sleep=sleep)
        with patch.object(body,"connection",connection),patch.object(body,"observer",observer),patch.object(body,"speaker_output",speaker),patch.object(body,"play_once",play),patch.object(body,"event",event),patch.object(body,'time',clock):
            return runner.execute_plan(plan,cfg,self.root/"receipt.json",first_command_not_before=runner._iso(self.now+20),
                                       body_operator_confirmed_at=self.confirmed,body_booking_claimed_at=claimed_at,cancel_file=cancel_file,
                                       now=lambda:self.now,sleep=sleep)

    def test_qualified_playback_after_countdown(self):
        receipt = self.execute()
        self.assertEqual(self.calls,[1800000020.0])
        self.assertEqual(receipt["commands"][0]["result"]["audio_sha256"],body.SPEC["audio"])
        self.assertTrue(receipt["commands"][0]["result"]["audio_output"]["completed"])
        self.assertTrue(receipt["handoff_ready"])
        self.assertEqual(receipt["outcome"],"completed")

    def test_108_measured_dance_and_pcm_start_survive_missing_transport_end(self):
        # These are the timestamps/bytes retained by #108. The HAL close is absent from its receipt.
        self.hal_lines = (
            f'[2026-11-08 08:30:28.231777][Info] WAV params: sr=16000Hz, ch=1, bps=16, bytes=2080000 file:{body.AUDIO_PATH}\n'
            f'[2026-11-08 08:30:28.940175][Info] AudioPlayer::pub_play_state {body.AUDIO_PATH} state 1\n'
            '[2026-11-08 08:30:28.940335][Info] pcm_started successfully, state: PREPARED\n')
        self.finish_event.update(playing_seconds=59.200001028,peak_travel_rad=2.5291147232055664,native_transitions=[
            dict(mode='BMIMIC',player=2,motion=body.SPEC['motion'],stamp_ns='1794097828210819478'),
            dict(mode='BMIMIC_STEP',player=0,motion='',stamp_ns='1794097887510823089'),
            dict(mode='STAND_DEFAULT',player=0,motion='',stamp_ns='1794097891010818716')])
        receipt = self.execute()
        self.assertEqual(receipt['outcome'],'completed')
        result = receipt['commands'][0]['result']
        self.assertTrue(result['motion_complete'])
        self.assertTrue(result['music_played'])
        self.assertEqual(result['audio_output']['transport_status'],'end_not_observed')
        self.assertFalse(result['audio_output']['completed'])
        self.assertNotIn('finished_at_robot',result['audio_output'])
        self.assertNotIn('playing_seconds',result['audio_output'])
        self.assertEqual(len(self.calls),1)
        self.hal_lines += '[2026-11-08 08:30:35.000000][Info] StopAudioPlay Enter\n'
        self.confirmed=runner._iso(self.now)
        self.config['scheduled_start']=self.confirmed
        self.config['scheduled_end']=runner._iso(self.now+120)
        interrupted=self.execute()
        self.assertEqual(interrupted['outcome'],'failed')
        self.assertTrue(interrupted['commands'][0]['result']['motion_complete'])
        self.assertFalse(interrupted['commands'][0]['result']['music_played'])

    def test_booking_start_uses_its_bound_claim_and_does_not_record_an_operator_check_in(self):
        self.config["native_body_start_policy"] = "signed_booking"
        self.confirmed = None
        receipt = self.execute(claimed_at=runner._iso(self.now))
        self.assertEqual(receipt["body_start_authority"], "signed_booking")
        self.assertEqual(receipt["outcome"], "completed")
        self.assertEqual(len(self.calls), 1)

    def test_a_claim_timestamp_cannot_replace_on_site_authorization_for_another_profile(self):
        self.confirmed = None
        receipt = self.execute(claimed_at=runner._iso(self.now))
        self.assertEqual(receipt["outcome"], "failed")
        self.assertFalse(self.calls)

    def test_acknowledgement_without_measured_finish_is_failed(self):
        self.finish_event = RuntimeError("Telemetry disconnected")
        receipt = self.execute()
        self.assertEqual(receipt["commands"][0]["result"]["play_response"],"Play success")
        self.assertFalse(receipt["handoff_ready"])
        self.assertEqual(receipt["completed_count"],0)
        self.assertEqual(len(self.calls),1)

    def test_truncated_audio_keeps_measured_dance_and_fails_the_booking(self):
        self.audio_finish = '07:48:45.010001'
        receipt = self.execute()
        command = receipt['commands'][0]
        self.assertEqual(command['result']['playing_seconds'],59.4)
        self.assertEqual(command['result']['audio_output']['playing_seconds'],4.0)
        self.assertIn('4s of the 65s WAV',command['error']['message'])
        self.assertEqual(receipt['outcome'],'failed')
        self.assertFalse(receipt['handoff_ready'])
        self.assertEqual(len(self.calls),1)

    def test_observed_motion_with_an_actuator_fault_preserves_evidence_and_fails(self):
        fault = 'Invalid joint feedback: leg left_ankle_roll_joint.error_code=533'
        partial = dict(native_motion=body.SPEC['motion'],joints_fault_free=False,
                       playing_seconds=58.9,terminal_standing_observed=True,
                       joint_faults=[dict(name='left_ankle_roll_joint',error_code=533)])
        self.finish_event = dict(error=fault,partial_observation=partial)
        with patch.object(body,'collect_speaker_output',wraps=body.collect_speaker_output) as collect:
            receipt = self.execute()
        self.assertGreater(collect.call_args.args[2],0)
        command = receipt['commands'][0]
        self.assertEqual(command['error'],dict(type='RuntimeError',message=fault))
        self.assertEqual(command['result'].get('partial_observation'),partial)
        self.assertTrue(command['result']['audio_output']['completed'])
        self.assertEqual(receipt['completed_count'],0)
        self.assertFalse(receipt['handoff_ready'])
        self.assertEqual(self.calls,[1800000020.0])

    def test_ambiguous_request_is_never_retried(self):
        receipt = self.execute(TimeoutError("native request timed out"))
        self.assertEqual(receipt["outcome"],"failed")
        self.assertEqual(len(self.calls),1)
        self.assertTrue(receipt["commands"][0]["result"]["request_attempted"])

    def test_expired_and_cancelled_confirmations_do_not_play(self):
        self.confirmed = runner._iso(self.now-91)
        self.assertEqual(self.execute()["outcome"],"failed")
        self.assertFalse(self.calls)
        self.confirmed = runner._iso(self.now)
        self.assertEqual(self.execute(cancel=True)["outcome"],"failed")
        self.assertFalse(self.calls)

    def test_altered_asset_audio_and_extra_commands_are_rejected(self):
        for field,value in (("audio_path","/tmp/other.wav"),("motion_name","different")):
            with self.subTest(field=field):
                self.plan["commands"][0]["args"] = {**body.ARGS,field:value}
                with self.assertRaisesRegex(ValueError,"approved Happy Dance"):
                    self.execute()
        self.plan["commands"][0]["args"] = body.ARGS
        self.plan["commands"] *= 2
        with self.assertRaisesRegex(ValueError,"approved Happy Dance"):
            self.execute()
        self.assertFalse(self.calls)
