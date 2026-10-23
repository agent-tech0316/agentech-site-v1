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
from master_gateway_spec import MASTER_COMMANDS, bind_master_arguments, validate_master_command, validate_master_plan, valid_master_result_name
ROOTS = {"Agentech", "dog"}
MASTER_CONSTANTS = {'left': 'left', 'right': 'right', 'both': 'both', 'stand': 'stand', 'master': 'master'}


def literal(node: ast.AST, *, structured=False, constants=None):
    if constants:
        class ImportedConstants(ast.NodeTransformer):
            def visit_Name(self, item):
                if item.id not in constants:
                    raise ValueError('only imported canonical SDK constants are accepted')
                return ast.copy_location(ast.Constant(value=constants[item.id]), item)
        node = ImportedConstants().visit(node)
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
    imported_constants = {}
    saved_results = set()
    for statement in tree.body:
        if selected_model == 'master' and isinstance(statement, ast.ImportFrom):
            if (statement.module != 'agentech' or statement.level or commands or master_selected
                    or any(alias.asname or alias.name not in {'Agentech', *MASTER_CONSTANTS} for alias in statement.names)):
                raise ValueError('Master imports require canonical Agentech names before commands, without aliases')
            imported_constants.update({alias.name: MASTER_CONSTANTS[alias.name] for alias in statement.names if alias.name in MASTER_CONSTANTS})
            continue
        if isinstance(statement, ast.ImportFrom) and statement.module == "agentech" and all(alias.name == "Agentech" for alias in statement.names):
            continue
        if isinstance(statement, ast.Import) and all(alias.name == "agentech" for alias in statement.names):
            continue
        save_result_as = None
        if selected_model == 'master' and isinstance(statement, ast.Assign):
            if (len(statement.targets) != 1 or not isinstance(statement.targets[0], ast.Name)
                    or not valid_master_result_name(statement.targets[0].id) or statement.targets[0].id in saved_results):
                raise ValueError('Master result capture requires one unique ordinary name')
            save_result_as = statement.targets[0].id
        elif not isinstance(statement, ast.Expr):
            raise ValueError(f"line {statement.lineno}: only direct robot command calls are executable")
        if not isinstance(statement.value, ast.Call):
            raise ValueError(f"line {statement.lineno}: only direct robot command calls are executable")
        call = statement.value
        standing_namespace = False
        command_root = call.func.value if isinstance(call.func, ast.Attribute) else None
        if (selected_model == 'master' and isinstance(command_root, ast.Attribute)
                and command_root.attr == 'standing_actions' and isinstance(command_root.value, ast.Name)):
            standing_namespace = True
            command_root = command_root.value
        if not isinstance(call.func, ast.Attribute) or not isinstance(command_root, ast.Name):
            raise ValueError(f"line {statement.lineno}: commands require a direct Agentech/dog call with named arguments")
        if command_root.id not in ROOTS:
            raise ValueError(f"line {statement.lineno}: unapproved command")
        if selected_model == 'master':
            if command_root.id != 'Agentech':
                raise ValueError('Master requires the Agentech command root')
            if call.func.attr == 'use' and not standing_namespace:
                if save_result_as or master_selected or commands or call.keywords or len(call.args) != 1 or literal(call.args[0], constants=imported_constants) != 'master':
                    raise ValueError('Master selector must be a single initial Agentech.use("master")')
                master_selected = True
                continue
        elif call.args:
            raise ValueError(f"line {statement.lineno}: commands require named arguments")
        command_spec = MASTER_COMMANDS.get(call.func.attr, {}) if selected_model == 'master' else {}
        if save_result_as and command_spec.get('result_type') != 'waist_adjustment':
            raise ValueError('Only adjust_waist results can be captured')
        def argument_literal(node, key):
            if command_spec.get('parameters', {}).get(key, {}).get('type') == 'result_ref':
                if not isinstance(node, ast.Name) or node.id not in saved_results:
                    raise ValueError('undo_waist requires an earlier named adjust_waist result')
                return {'$master_result': node.id}
            return literal(node, structured=selected_model == 'master', constants=imported_constants)
        args = {}
        for keyword in call.keywords:
            if keyword.arg is None or keyword.arg in args:
                raise ValueError(f"line {statement.lineno}: invalid command arguments")
            args[keyword.arg] = argument_literal(keyword.value, keyword.arg)
        if selected_model == 'master':
            positional = command_spec.get('positional', [])
            args = bind_master_arguments(call.func.attr, [argument_literal(arg, positional[index] if index < len(positional) else None) for index, arg in enumerate(call.args)], args, standing_namespace=standing_namespace)
        command = {"name": call.func.attr, "args": args, "line": statement.lineno}
        if save_result_as:
            command['save_result_as'] = save_result_as
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
        if save_result_as:
            saved_results.add(save_result_as)
    if not commands:
        raise ValueError("no robot commands found")
    if selected_model == 'master':
        validate_master_plan(commands)
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
