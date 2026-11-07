"""Replay the measured native dance through the real plan runner, with no robot connection."""
from contextlib import contextmanager
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import master_native_body as body

module = importlib.util.spec_from_file_location("body_runner",Path(__file__).with_name("trusted-master-runner.py"))
runner = importlib.util.module_from_spec(module)
module.loader.exec_module(runner)


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
                                 native_motion=body.SPEC["motion"],joints_fault_free=True)

    def execute(self, response=None, cancel=False):
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
        def play(_):
            self.calls.append(self.now)
            if isinstance(response,Exception): raise response
            return {"message":"Play success","robot_sn":body.SPEC["serial"]}
        def event(_):
            self.now += 64
            if isinstance(self.finish_event,Exception): raise self.finish_event
            return self.finish_event.copy()
        with patch.object(body,"connection",connection),patch.object(body,"observer",observer),patch.object(body,"play_once",play),patch.object(body,"event",event):
            return runner.execute_plan(plan,cfg,self.root/"receipt.json",first_command_not_before=runner._iso(self.now+20),
                                       body_operator_confirmed_at=self.confirmed,cancel_file=cancel_file,
                                       now=lambda:self.now,sleep=sleep)

    def test_qualified_playback_after_countdown(self):
        receipt = self.execute()
        self.assertEqual(self.calls,[1800000020.0])
        self.assertEqual(receipt["commands"][0]["result"]["audio_sha256"],body.SPEC["audio"])
        self.assertTrue(receipt["handoff_ready"])
        self.assertEqual(receipt["outcome"],"completed")

    def test_acknowledgement_without_measured_finish_is_failed(self):
        self.finish_event = RuntimeError("Telemetry disconnected")
        receipt = self.execute()
        self.assertEqual(receipt["commands"][0]["result"]["play_response"],"Play success")
        self.assertFalse(receipt["handoff_ready"])
        self.assertEqual(receipt["completed_count"],0)
        self.assertEqual(len(self.calls),1)

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
