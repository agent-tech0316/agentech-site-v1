"""Offline terminal service checks; no network or filesystem writes."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

scripts = Path(__file__).resolve().parent
sys.path.insert(0,str(scripts))
spec=importlib.util.spec_from_file_location('master_handoff_test_observer',scripts/'verify-master-native-handoff.py')
observer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)


class TerminalObservationTests(unittest.TestCase):
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
