"""Exercise reviewed website request families offline; never connect to a robot."""
from __future__ import annotations

import argparse
import ast
import inspect
import json
import socket
import sys
from pathlib import Path


def blocked_connection(*args, **kwargs):
    raise AssertionError("This audit forbids network connections")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sdk-root", type=Path, required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(args.sdk_root.resolve()))
    socket.socket.connect = blocked_connection
    socket.socket.connect_ex = blocked_connection
    socket.create_connection = blocked_connection
    from agentech.robots.master import Master

    payload = json.load(sys.stdin)
    full = {
        "shoulder_pitch": 0.0, "shoulder_roll": 0.0, "shoulder_yaw": 0.0,
        "elbow": 25.0, "wrist_yaw": 0.0, "wrist_pitch": 0.0, "wrist_roll": 0.0,
    }
    base_values = {
        "delta": 5.0, "target": 25.0, "duration": 8.0, "max_duration": 8.0,
        "speed": 5.0, "torque": 0.5, "effort_limit": 1.0, "ramp": 0.5,
        "left_torque": 0.5, "right_torque": 0.5,
        "cycle_count": 1, "pause": 0.5,
        "waist_deltas": {"yaw": 5.0}, "right_deltas": {"elbow": 5.0},
        "left_deltas": {"elbow": 5.0}, "right_targets": {"elbow": 25.0},
        "left_targets": {"wrist_yaw": 0.0}, "targets": full,
        "right_full_targets": full, "left_full_targets": full,
        "right_shoulder_targets": {k: v for k, v in full.items() if k.startswith("shoulder")},
        "left_shoulder_targets": {k: v for k, v in full.items() if k.startswith("shoulder")},
        "right_wrist_targets": {k: v for k, v in full.items() if k.startswith("wrist")},
        "left_wrist_targets": {k: v for k, v in full.items() if k.startswith("wrist")},
        "right_target": 25.0, "left_target": 25.0,
        # A deliberately unbound result must be refused by undo's evidence gate.
        "movement": {"robot": "master", "operation": "adjust-waist"},
        **{axis + "_delta": 1.0 for axis in ("roll", "pitch", "yaw")},
        **{axis + "_start": 0.0 for axis in ("roll", "pitch", "yaw")},
        **{axis + "_torque": 0.5 for axis in ("roll", "pitch", "yaw")},
        **{key + "_target": value for key, value in full.items()},
    }

    def literal(node):
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            return values[node.id]
        if isinstance(node, ast.Dict):
            return {literal(key): literal(value) for key, value in zip(node.keys, node.values)}
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            value = literal(node.operand)
            return -value if isinstance(node.op, ast.USub) else value
        raise ValueError("Unsupported fixture expression: " + ast.dump(node))

    expanded = []
    for item in payload:
        tree = ast.parse(item["syntax"])
        seeds = {}
        for statement in tree.body:
            if isinstance(statement, ast.Assign) and len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name):
                try:
                    seeds[statement.targets[0].id] = ast.literal_eval(statement.value)
                except (ValueError, TypeError):
                    pass
        calls = sorted((node for node in ast.walk(tree) if isinstance(node, ast.Call)
                        and isinstance(node.func, ast.Attribute)
                        and isinstance(node.func.value, ast.Name)
                        and node.func.value.id == "Agentech"), key=lambda node: node.lineno)
        expanded.extend({**item, "syntax": ast.unparse(call), "variables": seeds} for call in calls)
    results = []
    for item in expanded:
        robot = Master(dry_run=True, relay_url=None)
        values = {**base_values, **item["variables"]}
        values["target"] = 5.0 if item["function"] in {"turn_head", "shake_head"} else 25.0
        signature_bound = False
        try:
            tree = ast.parse(item["syntax"])
            call = next(node for node in ast.walk(tree) if isinstance(node, ast.Call)
                        and isinstance(node.func, ast.Attribute)
                        and isinstance(node.func.value, ast.Name)
                        and node.func.value.id == "Agentech")
            method = getattr(robot, call.func.attr)
            # Binding uses syntax nodes first: missing fixture values must not
            # hide an unsupported keyword or a required argument.
            inspect.signature(method).bind(
                *call.args, **{node.arg: node.value for node in call.keywords}
            )
            signature_bound = True
            positional = [literal(node) for node in call.args]
            keywords = {node.arg: literal(node.value) for node in call.keywords}
            result = method(*positional, **keywords)
            if isinstance(result, dict):
                for flag in ("controlRequestWritten", "control_request_written", "motionCommandsSent"):
                    if result.get(flag) is True:
                        raise AssertionError("Dry-run reported a control write: " + flag)
            results.append({**item, "signatureBound": signature_bound, "outcome": "offline-pass"})
        except Exception as error:
            expected_guard = (call.func.attr == "undo_waist" and isinstance(error, ValueError)
                              and str(error) == "movement waist result signature is missing")
            telemetry_required = call.func.attr in {"status", "get_status", "center"} and str(error) == "This audit forbids network connections"
            results.append({**item, "signatureBound": signature_bound, "outcome": "unbound-result-refused" if expected_guard else "live-telemetry-required" if telemetry_required else "rejected",
                            "error": type(error).__name__ + ": " + str(error)})
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
