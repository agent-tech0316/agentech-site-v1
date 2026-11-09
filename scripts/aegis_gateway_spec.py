"""Pure AEGIS command validation shared by compiler and trusted runner.

This module has no transport imports and performs no robot I/O.
"""
from __future__ import annotations

import math
import re
from numbers import Integral, Real
from typing import Any


AEGIS_192_168_4_88 = {
    "device": "192.168.4.88",
    "battery_present": True,
    "battery_source": "ecal:battery_state.power",
}

NO_ARGUMENT_COMMANDS = {
    "stand",
    "squat",
    "sit",
    "stop",
    "turn_right",
    "turn_left",
    "u_turn",
    "get_body_state",
}
ALLOWED_COMMANDS = NO_ARGUMENT_COMMANDS | {
    "forward",
    "backward",
    "lateral_left",
    "lateral_right",
    "diagonal",
    "squat_forward",
    "squat_backward",
    "squat_lateral",
    "squat_diagonal",
    "squat_turn",
    "turn",
    "yaw",
    "pitch",
    "roll",
    "stay",
    "backflip",
    "jump",
    "emergency_stop",
    "get_battery_status",
    "capture_image",
}

ATTITUDE_LIMITS = {
    "yaw": (-0.4660, 0.4426),
    "pitch": (-0.3685, 0.4011),
    "roll": (-0.4630, 0.4610),
}


class AegisCapabilityNotSupported(ValueError):
    def __init__(self, capability: str, reason: str, device: str | None) -> None:
        self.capability = capability
        self.reason = reason
        self.device = device
        super().__init__(
            f"AEGIS capability {capability!r} is not supported on {device}: {reason}"
        )


def _only(arguments: dict[str, Any], allowed: set[str], command: str) -> None:
    unknown = sorted(set(arguments) - allowed)
    if unknown:
        raise ValueError(
            f"{command}() has unsupported argument(s): {', '.join(unknown)}"
        )


def _number(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, Real):
        raise TypeError(f"{name} must be a number")
    numeric = float(value)
    if not math.isfinite(numeric):
        raise ValueError(f"{name} must be finite")
    return numeric


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, Integral):
        raise TypeError(f"{name} must be an integer")
    return int(value)


def _duration(arguments: dict[str, Any], *, default: float, minimum: float = 0.0) -> float:
    duration = _number(arguments.get("duration_s", default), "duration_s")
    if not minimum < duration <= 10.0:
        raise ValueError("duration_s must be greater than 0 and at most 10.0")
    return duration


def _validate_linear(command: str, arguments: dict[str, Any]) -> None:
    allowed = {"speed_mps", "duration_s", "speed_percent", "speed_level", "distance_m"}
    _only(arguments, allowed, command)
    duration = _duration(arguments, default=1.0)
    selectors = [
        name
        for name in ("speed_mps", "speed_percent", "speed_level", "distance_m")
        if name in arguments
    ]
    if len(selectors) > 1:
        raise ValueError(f"{command}() mixes speed/distance profiles: {', '.join(selectors)}")
    if not selectors:
        return
    selector = selectors[0]
    value = arguments[selector]
    if selector == "speed_mps":
        speed = _number(value, selector)
        if not 0.05 <= speed <= 3.0:
            raise ValueError("speed_mps must be between 0.05 and 3.0")
    elif selector == "speed_percent":
        percentage = _integer(value, selector)
        if not 1 <= percentage <= 100:
            raise ValueError("speed_percent must be between 1 and 100")
    elif selector == "speed_level":
        level = _integer(value, selector)
        if not 0 <= level <= 511:
            raise ValueError("speed_level must be between 0 and 511")
    else:
        distance = _number(value, selector)
        maximum = 5.0 if command == "forward" else 3.0
        if not 0.0 < distance <= maximum:
            raise ValueError(f"distance_m must be greater than 0 and at most {maximum}")
        speed = distance / duration
        if not 0.05 <= speed <= 3.0:
            raise ValueError(
                "distance_m / duration_s must produce a speed between 0.05 and 3.0 m/s"
            )


def _validate_lateral(command: str, arguments: dict[str, Any]) -> None:
    _only(arguments, {"distance_m", "speed_mps", "duration_s"}, command)
    if "distance_m" in arguments:
        if "duration_s" in arguments:
            raise ValueError("choose distance_m + speed_mps or speed_mps + duration_s")
        if "speed_mps" not in arguments:
            raise ValueError("distance_m requires speed_mps")
        distance = _number(arguments["distance_m"], "distance_m")
        speed = _number(arguments["speed_mps"], "speed_mps")
        if not 0.0 < distance <= 10.0:
            raise ValueError("distance_m must be greater than 0 and at most 10.0")
        if not 0.1 <= speed <= 1.0:
            raise ValueError("speed_mps must be between 0.1 and 1.0")
        if distance / speed > 10.0:
            raise ValueError("distance_m / speed_mps must not exceed 10.0 seconds")
        return
    speed = _number(arguments.get("speed_mps", 0.5), "speed_mps")
    if not 0.1 <= speed <= 1.0:
        raise ValueError("speed_mps must be between 0.1 and 1.0")
    _duration(arguments, default=2.0)


def _diagonal_components(arguments: dict[str, Any], command: str) -> tuple[float, float]:
    _only(arguments, {"x_m", "y_m", "angle_deg", "speed_mps", "duration_s"}, command)
    coordinate = "x_m" in arguments or "y_m" in arguments
    angle = "angle_deg" in arguments or "speed_mps" in arguments
    if coordinate and angle:
        raise ValueError("choose either x_m/y_m or angle_deg/speed_mps")
    if not coordinate and not angle:
        if "duration_s" in arguments:
            raise ValueError("duration_s requires a coordinate or angle profile")
        return math.cos(math.radians(45.0)) * 0.5, math.sin(math.radians(45.0)) * 0.5
    if coordinate:
        if not {"x_m", "y_m", "duration_s"} <= set(arguments):
            raise ValueError("coordinate mode requires x_m, y_m, and duration_s")
        x = _number(arguments["x_m"], "x_m")
        y = _number(arguments["y_m"], "y_m")
        if x == 0.0 or y == 0.0:
            raise ValueError("x_m and y_m must be nonzero for diagonal motion")
        duration = _duration(arguments, default=0.0)
        forward, lateral = y / duration, x / duration
    else:
        if not {"angle_deg", "speed_mps", "duration_s"} <= set(arguments):
            raise ValueError("angle mode requires angle_deg, speed_mps, and duration_s")
        degrees = _number(arguments["angle_deg"], "angle_deg")
        if not -180.0 <= degrees <= 180.0:
            raise ValueError("angle_deg must be between -180 and 180")
        speed = _number(arguments["speed_mps"], "speed_mps")
        if speed <= 0.0:
            raise ValueError("speed_mps must be greater than 0")
        _duration(arguments, default=0.0)
        radians = math.radians(degrees)
        forward, lateral = math.cos(radians) * speed, math.sin(radians) * speed
        if math.isclose(forward, 0.0, abs_tol=1e-12) or math.isclose(
            lateral, 0.0, abs_tol=1e-12
        ):
            raise ValueError("angle_deg must describe a diagonal, not cardinal motion")
    if not 0.05 <= abs(forward) <= 3.0:
        raise ValueError(
            f"resolved forward component {forward:.6g} must have magnitude between 0.05 and 3.0 m/s"
        )
    if not 0.1 <= abs(lateral) <= 1.0:
        raise ValueError(
            f"resolved lateral component {lateral:.6g} must have magnitude between 0.1 and 1.0 m/s"
        )
    return forward, lateral


def _validate_squat_linear(command: str, arguments: dict[str, Any]) -> None:
    _only(arguments, {"speed_mps", "duration_s"}, command)
    speed = _number(arguments.get("speed_mps", 0.5), "speed_mps")
    if not 0.05 <= speed <= 3.0:
        raise ValueError("speed_mps must be between 0.05 and 3.0")
    _duration(arguments, default=2.0)


def _validate_squat_lateral(arguments: dict[str, Any]) -> None:
    _only(arguments, {"direction", "speed_mps", "duration_s"}, "squat_lateral")
    if arguments.get("direction") not in {"left", "right"}:
        raise ValueError("squat_lateral() direction must be 'left' or 'right'")
    speed = _number(arguments.get("speed_mps", 0.5), "speed_mps")
    if not 0.1 <= speed <= 1.0:
        raise ValueError("speed_mps must be between 0.1 and 1.0")
    _duration(arguments, default=2.0)


def _validate_turn(arguments: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "angle_deg", "angle_rad", "distance_deg", "distance_rad",
        "turn_rate_rad_s", "turn_rate_deg_s", "rate_percentage", "turn_level",
        "duration_s",
    }
    _only(arguments, allowed, "turn")
    normalized = dict(arguments)
    angle_names = [name for name in ("angle_deg", "angle_rad", "distance_deg", "distance_rad") if name in arguments]
    rate_names = [name for name in ("turn_rate_rad_s", "turn_rate_deg_s", "rate_percentage", "turn_level") if name in arguments]
    if len(angle_names) > 1:
        raise ValueError("turn() accepts one angle/distance selector")
    if len(rate_names) > 1:
        raise ValueError("turn() accepts one rate selector")
    if "duration_s" in arguments:
        duration = _number(arguments["duration_s"], "duration_s")
        if duration <= 0.0:
            raise ValueError("duration_s must be greater than 0")
        if angle_names:
            raise ValueError("turn() cannot mix target angle and duration_s")
        if not rate_names:
            raise ValueError("timed turn requires one rate selector")
    angle_value: float | None = None
    if angle_names:
        angle_value = _number(arguments[angle_names[0]], angle_names[0])
        if angle_value == 0.0:
            raise ValueError("turn target must be nonzero")
    if rate_names:
        rate_name = rate_names[0]
        raw_rate = arguments[rate_name]
        if rate_name == "turn_rate_rad_s":
            rate = _number(raw_rate, rate_name)
            if rate != 0.0 and not 0.02 <= abs(rate) <= 3.0:
                raise ValueError("turn_rate_rad_s magnitude must be between 0.02 and 3.0")
            if angle_value is not None and rate < 0.0:
                if angle_value < 0.0:
                    normalized[rate_name] = abs(rate)
                else:
                    raise ValueError("negative turn rate conflicts with positive target angle")
        elif rate_name == "turn_rate_deg_s":
            rate = _number(raw_rate, rate_name)
            maximum = math.degrees(3.0)
            minimum = math.degrees(0.02)
            if rate != 0.0 and not minimum <= abs(rate) <= maximum:
                raise ValueError(
                    f"turn_rate_deg_s magnitude must be between {minimum:.6f} and {maximum:.6f}"
                )
            if angle_value is not None and rate < 0.0:
                if angle_value < 0.0:
                    normalized[rate_name] = abs(rate)
                else:
                    raise ValueError("negative turn rate conflicts with positive target angle")
        elif rate_name == "rate_percentage":
            rate = _integer(raw_rate, rate_name)
            if not -100 <= rate <= 100:
                raise ValueError("rate_percentage must be between -100 and 100")
            if angle_value is not None and rate and (rate > 0) != (angle_value > 0):
                raise ValueError("rate_percentage sign conflicts with target angle")
        else:
            rate = _integer(raw_rate, rate_name)
            if not -511 <= rate <= 511:
                raise ValueError("turn_level must be between -511 and 511")
            if angle_value is not None and rate and (rate > 0) != (angle_value > 0):
                raise ValueError("turn_level sign conflicts with target angle")
    return normalized


def _validate_attitude(command: str, arguments: dict[str, Any]) -> None:
    _only(arguments, {"speed_rad_s", "position_rad"}, command)
    supplied = ("speed_rad_s" in arguments, "position_rad" in arguments)
    if supplied not in {(False, False), (True, True)}:
        raise ValueError(f"{command}() requires both speed_rad_s and position_rad")
    if supplied == (False, False):
        return
    speed = _number(arguments["speed_rad_s"], "speed_rad_s")
    position = _number(arguments["position_rad"], "position_rad")
    if not 0.01 <= speed <= 0.60:
        raise ValueError("speed_rad_s must be between 0.01 and 0.60")
    minimum, maximum = ATTITUDE_LIMITS[command]
    if not minimum <= position <= maximum:
        raise ValueError(f"{command} position_rad must be between {minimum} and {maximum}")


def validate_aegis_command(
    name: str,
    arguments: dict[str, Any],
    *,
    device_profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Validate and normalize one inert AEGIS command without importing the SDK."""

    if name not in ALLOWED_COMMANDS:
        raise ValueError(f"unapproved command for AEGIS: {name}")
    if not isinstance(arguments, dict) or any(not isinstance(key, str) for key in arguments):
        raise TypeError("command arguments must be a string-keyed object")
    profile = AEGIS_192_168_4_88 if device_profile is None else device_profile
    normalized = dict(arguments)
    if name in NO_ARGUMENT_COMMANDS:
        _only(arguments, set(), name)
    elif name in {"forward", "backward"}:
        _validate_linear(name, arguments)
    elif name in {"lateral_left", "lateral_right"}:
        _validate_lateral(name, arguments)
    elif name in {"diagonal", "squat_diagonal"}:
        _diagonal_components(arguments, name)
    elif name in {"squat_forward", "squat_backward"}:
        _validate_squat_linear(name, arguments)
    elif name == "squat_lateral":
        _validate_squat_lateral(arguments)
    elif name == "squat_turn":
        _only(arguments, {"angle_deg"}, name)
        if "angle_deg" not in arguments or _number(arguments["angle_deg"], "angle_deg") == 0.0:
            raise ValueError("squat_turn() requires a finite nonzero angle_deg")
    elif name == "turn":
        normalized = _validate_turn(arguments)
    elif name in ATTITUDE_LIMITS:
        _validate_attitude(name, arguments)
    elif name == "stay":
        _only(arguments, {"duration_s"}, name)
        if "duration_s" not in arguments:
            raise ValueError("stay() requires duration_s")
        duration = _number(arguments["duration_s"], "duration_s")
        if duration < 0.0:
            raise ValueError("stay() duration_s must be nonnegative")
    elif name in {"backflip", "jump"}:
        _only(arguments, {"wait"}, name)
        if "wait" in arguments and not isinstance(arguments["wait"], bool):
            raise TypeError(f"{name}() wait must be a boolean")
    elif name == "emergency_stop":
        _only(arguments, {"reason"}, name)
        if "reason" in arguments:
            reason = arguments["reason"]
            if not isinstance(reason, str) or not reason.strip() or len(reason) > 180:
                raise ValueError("emergency_stop() reason must be 1 to 180 characters")
    elif name == "get_battery_status":
        _only(arguments, set(), name)
        if profile.get("battery_present") is False:
            raise AegisCapabilityNotSupported(
                "battery",
                str(profile.get("battery_reason") or "hardware_absent"),
                str(profile.get("device") or "unknown"),
            )
    elif name == "capture_image":
        _only(arguments, {"output", "source"}, name)
        for key in ("output", "source"):
            if key in arguments and (
                not isinstance(arguments[key], str) or not arguments[key].strip()
            ):
                raise ValueError(f"capture_image() {key} must be a non-empty string")
    return normalized


def validate_aegis_plan(plan: dict[str, Any]) -> dict[str, Any]:
    if isinstance(plan,dict) and plan.get('sdk_contract') is not None:
        from eaic_sdk_commands import validate_plan
        if plan.get('robot_model')!='aegis':raise ValueError('SDK plan is not Aegis')
        return validate_plan(plan)
    if not isinstance(plan, dict):
        raise TypeError("AEGIS plan must be an object")
    expected_plan_keys = {
        "version",
        "robot_model",
        "submission_id",
        "source_sha256",
        "device_profile",
        "commands",
    }
    if set(plan) != expected_plan_keys:
        raise ValueError("AEGIS plan has missing or unexpected fields")
    if plan.get("version") != 2 or plan.get("robot_model") != "aegis":
        raise ValueError("unsupported AEGIS plan version or robot model")
    submission_id = plan.get("submission_id")
    if (
        not isinstance(submission_id, str)
        or not submission_id.strip()
        or len(submission_id) > 200
    ):
        raise ValueError("AEGIS plan submission_id is invalid")
    source_sha256 = plan.get("source_sha256")
    if not isinstance(source_sha256, str) or re.fullmatch(
        r"[0-9a-f]{64}", source_sha256
    ) is None:
        raise ValueError("AEGIS plan source_sha256 is invalid")
    commands = plan.get("commands")
    if not isinstance(commands, list) or not 1 <= len(commands) <= 256:
        raise ValueError("AEGIS plan must contain 1 to 256 commands")
    profile = plan.get("device_profile")
    if profile != AEGIS_192_168_4_88:
        raise ValueError("AEGIS plan device profile is missing or does not match the Gateway")
    for index, command in enumerate(commands, start=1):
        if not isinstance(command, dict):
            raise ValueError(f"command {index} must be an object")
        expected_command_keys = {"name", "args", "line"}
        if "source_args" in command:
            expected_command_keys.add("source_args")
        if set(command) != expected_command_keys:
            raise ValueError(f"command {index} has missing or unexpected fields")
        line = command.get("line")
        if isinstance(line, bool) or not isinstance(line, int) or line < 1:
            raise ValueError(f"command {index} has an invalid source line")
        normalized = validate_aegis_command(
            command.get("name"),
            command.get("args"),
            device_profile=profile,
        )
        if normalized != command.get("args"):
            raise ValueError(f"command {index} contains non-normalized arguments")
        if "source_args" in command:
            source_args = command["source_args"]
            source_normalized = validate_aegis_command(
                command.get("name"),
                source_args,
                device_profile=profile,
            )
            if source_normalized != command.get("args"):
                raise ValueError(
                    f"command {index} source arguments do not normalize to staged arguments"
                )
            if source_args == command.get("args"):
                raise ValueError(
                    f"command {index} has redundant source arguments"
                )
    emergency_stop_indices = [
        index
        for index, command in enumerate(commands)
        if command.get("name") == "emergency_stop"
    ]
    if emergency_stop_indices and emergency_stop_indices != [len(commands) - 1]:
        raise ValueError(
            "emergency_stop must be the final and only emergency-stop command"
        )
    return plan


__all__ = [
    "AEGIS_192_168_4_88",
    "ALLOWED_COMMANDS",
    "AegisCapabilityNotSupported",
    "validate_aegis_command",
    "validate_aegis_plan",
]
