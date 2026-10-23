"""Compile reviewed customer Python into inert robot commands on Code X.

The source is parsed, never executed. Only literal Agentech/dog method calls are
accepted; imports, variables, loops, helpers, attribute chains and expressions
are rejected so the resulting plan is deterministic and auditable.
"""
from __future__ import annotations

import ast
import hashlib
import json
import sys
from pathlib import Path

from aegis_gateway_spec import AEGIS_192_168_4_88, validate_aegis_command
from navi_gateway_spec import validate_navi_command
from master_gateway_spec import bind_master_arguments, validate_master_command
ROOTS = {"Agentech", "dog"}


def literal(node: ast.AST, *, structured=False):
    value = ast.literal_eval(node)
    if structured and isinstance(value, dict):
        def valid(item, depth=0):
            if depth > 4: return False
            if item is None or type(item) in (bool, int, float, str): return True
            return isinstance(item, dict) and len(item) <= 32 and all(isinstance(k, str) and valid(v, depth+1) for k, v in item.items())
        if not valid(value): raise ValueError('invalid structured Master literal')
        return value
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    raise ValueError("only scalar literal arguments are allowed")


def normalize_robot_model(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in {"aegis", "aegies"}:
        return "aegis"
    if normalized == "navi":
        return "navi"
    if normalized == "master":
        return "master"
    raise ValueError(f"unsupported robot model: {value!r}")


def compile_plan(source: str, submission_id: str, robot_model: str = "aegis") -> dict:
    selected_model = normalize_robot_model(robot_model)
    tree = ast.parse(source, filename=f"submission:{submission_id}", mode="exec")
    commands = []
    master_selected = False
    for statement in tree.body:
        if isinstance(statement, ast.ImportFrom) and statement.module == "agentech" and all(alias.name == "Agentech" for alias in statement.names):
            continue
        if isinstance(statement, ast.Import) and all(alias.name == "agentech" for alias in statement.names):
            continue
        if not isinstance(statement, ast.Expr) or not isinstance(statement.value, ast.Call):
            raise ValueError(f"line {statement.lineno}: only direct robot command calls are executable")
        call = statement.value
        if not isinstance(call.func, ast.Attribute) or not isinstance(call.func.value, ast.Name):
            raise ValueError(f"line {statement.lineno}: commands require a direct Agentech/dog call with named arguments")
        if call.func.value.id not in ROOTS:
            raise ValueError(f"line {statement.lineno}: unapproved command")
        if selected_model == 'master':
            if call.func.value.id != 'Agentech':
                raise ValueError('Master requires the Agentech command root')
            if call.func.attr == 'use':
                if master_selected or commands or call.keywords or len(call.args) != 1 or literal(call.args[0]) != 'master':
                    raise ValueError('Master selector must be a single initial Agentech.use("master")')
                master_selected = True
                continue
        elif call.args:
            raise ValueError(f"line {statement.lineno}: commands require named arguments")
        args = {}
        for keyword in call.keywords:
            if keyword.arg is None or keyword.arg in args:
                raise ValueError(f"line {statement.lineno}: invalid command arguments")
            args[keyword.arg] = literal(keyword.value, structured=selected_model == 'master')
        if selected_model == 'master':
            args = bind_master_arguments(call.func.attr, [literal(arg, structured=True) for arg in call.args], args)
        command = {"name": call.func.attr, "args": args, "line": statement.lineno}
        try:
            if selected_model == "navi":
                validate_navi_command(call.func.attr, args)
            elif selected_model == 'master':
                validate_master_command(call.func.attr, args)
            else:
                normalized = validate_aegis_command(
                    call.func.attr,
                    args,
                    device_profile=AEGIS_192_168_4_88,
                )
                if normalized != args:
                    command["source_args"] = args
                    command["args"] = normalized
        except (TypeError, ValueError) as error:
            raise type(error)(f"line {statement.lineno}: {error}") from error
        commands.append(command)
    if not commands:
        raise ValueError("no robot commands found")
    plan = {
        "version": 2,
        "submission_id": submission_id,
        "source_sha256": hashlib.sha256(source.encode("utf-8")).hexdigest(),
        "commands": commands,
    }
    if selected_model in {"navi", "master"}:
        plan["robot_model"] = selected_model
    else:
        plan["robot_model"] = "aegis"
        plan["device_profile"] = dict(AEGIS_192_168_4_88)
    return plan


def main() -> None:
    if len(sys.argv) not in {4, 5}:
        raise SystemExit("usage: compile-robot-plan.py SOURCE SUBMISSION_ID [ROBOT_MODEL] OUTPUT")
    source = Path(sys.argv[1]).read_text(encoding="utf-8")
    robot_model = sys.argv[3] if len(sys.argv) == 5 else "aegis"
    output = sys.argv[4] if len(sys.argv) == 5 else sys.argv[3]
    plan = compile_plan(source, sys.argv[2], robot_model)
    output_path = Path(output)
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    temporary.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    temporary.replace(output_path)


if __name__ == "__main__":
    main()
