from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch


class FakeAgentech:
    calls: list[tuple[str, dict]] = []
    fail_on: str | None = None
    forward_result: object = None

    @classmethod
    def stand(cls, **arguments):
        cls.calls.append(("stand", arguments))
        return {"state": "standing"}

    @classmethod
    def squat(cls, **arguments):
        cls.calls.append(("squat", arguments))
        if cls.fail_on == "squat":
            raise RuntimeError("point-foot preparation failed")
        return {"state": "squat"}

    @classmethod
    def forward(cls, **arguments):
        cls.calls.append(("forward", arguments))
        return cls.forward_result

    @classmethod
    def sit(cls, **arguments) -> None:
        cls.calls.append(("sit", arguments))

    @classmethod
    def stop(cls, **arguments) -> None:
        cls.calls.append(("stop", arguments))

    @classmethod
    def emergency_stop(cls, **arguments):
        cls.calls.append(("emergency_stop", arguments))
        return {"damping": True, "interrupted": True}


RUNNER_PATH = Path(__file__).with_name("trusted-robot-runner.py")
SPEC = importlib.util.spec_from_file_location("trusted_robot_runner", RUNNER_PATH)
assert SPEC and SPEC.loader
runner = importlib.util.module_from_spec(SPEC)
fake_module = types.ModuleType("agentech")
fake_module.Agentech = FakeAgentech
with patch.dict(sys.modules, {"agentech": fake_module}):
    SPEC.loader.exec_module(runner)


def measured_locomotion_result(name: str) -> dict:
    metadata_name = "lateral" if name in {"lateral_left", "lateral_right"} else name
    metadata = (
        {"distance_m": 0.2, "measured_x_m": 0.1, "measured_y_m": 0.15}
        if name == "diagonal"
        else {"expected_displacement_m": 0.2, "measured_displacement_m": 0.18}
    )
    return {
        "backend": "robot_ssh",
        "position_feedback": {"available": True},
        metadata_name: {"position_feedback_available": True, **metadata},
    }


class TrustedRobotRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        FakeAgentech.calls.clear()
        FakeAgentech.fail_on = None
        FakeAgentech.forward_result = None

    def plan(self, commands: list[dict]) -> dict:
        return {
            "version": 2,
            "robot_model": "aegis",
            "submission_id": "submission-test",
            "source_sha256": "a" * 64,
            "device_profile": {
                "device": "192.168.4.88",
                "battery_present": True,
                "battery_source": "ecal:battery_state.power",
            },
            "commands": commands,
        }

    def test_end_session_lie_down_uses_verified_sit_route_then_stops(self) -> None:
        runner.end_session_lie_down()

        self.assertEqual(
            FakeAgentech.calls,
            [
                ("sit", {"host": "127.0.0.1"}),
                ("stop", {"host": "127.0.0.1"}),
            ],
        )

    def test_execute_writes_atomic_completed_final_result(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan_path = root / "session-42.plan.json"
            final_path = root / "session-42.execution.json"
            plan_path.write_text(
                json.dumps(self.plan([{"name": "stand", "args": {}, "line": 2}])),
                encoding="utf-8",
            )

            result = runner.execute(
                plan_path,
                final_result_path=final_path,
                agentech=FakeAgentech,
            )

            self.assertEqual(result["outcome"], "completed")
            self.assertEqual(result["session_id"], "42")
            self.assertEqual(result["completed_count"], 1)
            self.assertEqual(result["commands"][0]["status"], "completed")
            self.assertEqual(json.loads(final_path.read_text(encoding="utf-8")), result)
            self.assertFalse(final_path.with_suffix(final_path.suffix + ".tmp").exists())

    def test_execute_failure_preserves_first_command_error(self) -> None:
        FakeAgentech.fail_on = "squat"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan_path = root / "session-43.plan.json"
            final_path = root / "session-43.execution.json"
            plan_path.write_text(
                json.dumps(
                    self.plan(
                        [
                            {"name": "stand", "args": {}, "line": 2},
                            {"name": "squat", "args": {}, "line": 3},
                        ]
                    )
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(RuntimeError, "point-foot preparation failed"):
                runner.execute(
                    plan_path,
                    final_result_path=final_path,
                    agentech=FakeAgentech,
                )

            result = json.loads(final_path.read_text(encoding="utf-8"))
            self.assertEqual(result["outcome"], "failed")
            self.assertEqual(result["completed_count"], 1)
            self.assertEqual(result["error"]["command_index"], 2)
            self.assertEqual(result["error"]["type"], "RuntimeError")

    def test_terminal_emergency_stop_does_not_send_duplicate_cleanup_stop(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan_path = root / "session-43.plan.json"
            diary_path = root / "session-43.diary.jsonl"
            plan_path.write_text(
                json.dumps(
                    self.plan(
                        [
                            {"name": "sit", "args": {}, "line": 2},
                            {"name": "emergency_stop", "args": {}, "line": 3},
                        ]
                    )
                ),
                encoding="utf-8",
            )

            result = runner.execute(
                plan_path,
                agentech=FakeAgentech,
            )

            self.assertEqual(result["outcome"], "completed")
            self.assertEqual(
                FakeAgentech.calls,
                [
                    ("sit", {"host": "127.0.0.1"}),
                    ("emergency_stop", {"host": "127.0.0.1"}),
                ],
            )
            diary = [
                json.loads(line)
                for line in diary_path.read_text(encoding="utf-8").splitlines()
            ]
            cleanup = [item for item in diary if item["event"] == "cleanup_skipped"]
            self.assertEqual(len(cleanup), 1)
            self.assertEqual(cleanup[0]["reason"], "terminal_emergency_stop")
            self.assertEqual(diary[-1]["event"], "session_completed")

    def test_hand_edited_plan_is_refused_before_motion_dispatch(self) -> None:
        plan = self.plan(
            [
                {
                    "name": "turn",
                    "args": {"angle_deg": -10, "turn_rate_deg_s": -10},
                    "line": 2,
                }
            ]
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan_path = root / "session-44.plan.json"
            plan_path.write_text(json.dumps(plan), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "non-normalized"):
                runner.execute(plan_path, agentech=FakeAgentech)

        self.assertEqual(FakeAgentech.calls, [])

    def test_gateway_termination_becomes_a_structured_runner_failure(self) -> None:
        with self.assertRaisesRegex(runner.SessionTerminated, "terminated by signal 15"):
            runner._termination_handler(15, None)

    def test_locomotion_translation_uses_verified_robot_ssh_backend(self) -> None:
        cases = [
            ("forward", {"speed_mps": 0.2, "duration_s": 1.0}),
            ("backward", {"speed_mps": 0.2, "duration_s": 1.0}),
            ("lateral_left", {"speed_mps": 0.15, "duration_s": 1.0}),
            ("lateral_right", {"speed_mps": 0.15, "duration_s": 1.0}),
            ("diagonal", {"angle_deg": 45, "speed_mps": 0.2, "duration_s": 1.0}),
        ]

        for name, arguments in cases:
            with self.subTest(name=name):
                translated_name, translated = runner._translated_call(
                    Path("session.plan.json"),
                    {"name": name, "args": arguments, "line": 2},
                    0,
                )
                self.assertEqual(translated_name, name)
                self.assertEqual(translated["backend"], "robot_ssh")
                self.assertEqual(translated["host"], "127.0.0.1")

    def test_action_result_guard_rejects_stall_and_unverified_locomotion(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "stalled"):
            runner._assert_action_result("squat_turn", {"stalled": True})

        with self.assertRaisesRegex(RuntimeError, "position feedback"):
            runner._assert_action_result(
                "forward",
                {
                    "backend": "robot_ssh",
                    "position_feedback": {"available": False},
                    "forward": {"position_feedback_available": False},
                },
            )

    def test_action_result_guard_accepts_measured_locomotion(self) -> None:
        for name in ("forward", "backward", "lateral_left", "lateral_right", "diagonal"):
            with self.subTest(name=name):
                result = measured_locomotion_result(name)
                self.assertIs(runner._assert_action_result(name, result), result)

    def test_action_result_guard_requires_structured_locomotion_result(self) -> None:
        for name in ("forward", "backward", "lateral_left", "lateral_right", "diagonal"):
            for value in (None, True, False, 1, "completed", []):
                with self.subTest(name=name, value=value):
                    with self.assertRaises(RuntimeError):
                        runner._assert_action_result(name, value)

    def test_action_result_guard_preserves_void_non_locomotion_results(self) -> None:
        for name in ("sit", "stop"):
            with self.subTest(name=name):
                self.assertIsNone(runner._assert_action_result(name, None))

    def test_action_result_guard_rejects_invalid_displacement_numbers(self) -> None:
        for name, field in (
            ("forward", "measured_displacement_m"),
            ("diagonal", "measured_x_m"),
            ("diagonal", "measured_y_m"),
        ):
            for value in (None, True, False, "0.2", float("nan"), float("inf"), -float("inf")):
                with self.subTest(name=name, field=field, value=value):
                    result = measured_locomotion_result(name)
                    result[name][field] = value
                    with self.assertRaises(RuntimeError):
                        runner._assert_action_result(name, result)

    def test_action_result_guard_requires_positive_finite_expected_distance(self) -> None:
        for name, field in (
            ("forward", "expected_displacement_m"),
            ("diagonal", "distance_m"),
        ):
            for value in (None, True, False, "0.2", 0, -0.2, float("nan"), float("inf"), -float("inf")):
                with self.subTest(name=name, field=field, value=value):
                    result = measured_locomotion_result(name)
                    result[name][field] = value
                    with self.assertRaises(RuntimeError):
                        runner._assert_action_result(name, result)
            with self.subTest(name=name, field=field, missing=True):
                result = measured_locomotion_result(name)
                del result[name][field]
                with self.assertRaises(RuntimeError):
                    runner._assert_action_result(name, result)

    def test_execute_persists_rejected_locomotion_result_and_stops_plan(self) -> None:
        malformed_measurement = measured_locomotion_result("forward")
        malformed_measurement["forward"]["measured_displacement_m"] = float("nan")
        invalid_expected = measured_locomotion_result("forward")
        invalid_expected["forward"]["expected_displacement_m"] = 0
        for value in (None, malformed_measurement, invalid_expected):
            with self.subTest(value=value), tempfile.TemporaryDirectory() as directory:
                FakeAgentech.calls.clear()
                FakeAgentech.forward_result = value
                root = Path(directory)
                plan_path = root / "session-46.plan.json"
                final_path = root / "session-46.execution.json"
                diary_path = root / "session-46.diary.jsonl"
                plan_path.write_text(
                    json.dumps(self.plan([
                        {"name": "forward", "args": {"speed_mps": 0.2, "duration_s": 1.0}, "line": 2},
                        {"name": "stand", "args": {}, "line": 3},
                    ])),
                    encoding="utf-8",
                )

                with self.assertRaises(RuntimeError):
                    runner.execute(plan_path, final_result_path=final_path, agentech=FakeAgentech)

                result = json.loads(final_path.read_text(encoding="utf-8"))
                self.assertEqual(result["outcome"], "failed")
                self.assertEqual(result["completed_count"], 0)
                self.assertEqual(len(result["commands"]), 1)
                self.assertEqual(result["commands"][0]["status"], "failed")
                self.assertIsNone(result["commands"][0]["result"])
                self.assertEqual(result["error"]["command"], "forward")
                self.assertEqual(result["error"]["command_index"], 1)
                self.assertEqual(result["error"]["type"], "RuntimeError")
                self.assertEqual([name for name, _ in FakeAgentech.calls], ["forward", "stop"])
                diary = [json.loads(line) for line in diary_path.read_text(encoding="utf-8").splitlines()]
                self.assertIn("command_failed", [item["event"] for item in diary])
                self.assertNotIn("command_completed", [item["event"] for item in diary])
                self.assertEqual(diary[-1]["event"], "session_failed")


if __name__ == "__main__":
    unittest.main()
