import importlib.util
import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))


class MasterContractTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue((SCRIPTS / 'master_gateway_spec.py').exists(), 'Master contract is missing')
        from master_gateway_spec import validate_master_command
        self.validate = validate_master_command

    def test_all_arm_parameters_preserve_internal_capabilities(self):
        self.validate('adjust_elbow', {'side': 'left', 'position': 5, 'speed': 5, 'torque': 2})
        self.validate('adjust_right_wrist', {'yaw': 0, 'pitch': 5, 'torque': {'pitch': 1}})
        self.validate('move_arms_to', {'right': {'elbow': 0, 'wrist_yaw': 10}, 'duration_seconds': 8})
        self.validate('adjust_upper_body', {'left_arm': {'elbow': 5}, 'torque': {'left': {'elbow': 1}}})

    def test_rejects_outside_arm_scope_and_malformed_requests(self):
        self.validate('adjust_waist', {'yaw': 1})
        self.validate('adjust_upper_body', {'waist': {'yaw': 1}})
        for name, args in [('forward', {}), ('stop', {}),
                           ('adjust_right_shoulder', {'axis': 'pitch', 'degrees': True}),
                           ('adjust_right_wrist', {'yaw': float('nan')}),
                           ('adjust_elbow', {'degrees': 1, 'position': 1}),
                           ('adjust_elbow', {'position': 1, 'speed': 1, 'duration_seconds': 1}),
                           ('move_arms_to', {'right': {'waist': 2}})]:
            with self.subTest(name=name, args=args), self.assertRaises((ValueError, TypeError)):
                self.validate(name, args)

    def test_compiler_supports_master_selector_positionals_and_maps(self):
        spec = importlib.util.spec_from_file_location('master_test_compiler', SCRIPTS / 'compile-robot-plan.py')
        compiler = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(compiler)
        result = compiler.compile_plan("from agentech import Agentech\nAgentech.use('master')\nAgentech.enter_stand_hand_guide('both')\nAgentech.adjust_right_shoulder('pitch', -5, duration_seconds=1)\nAgentech.move_arms_to(right={'elbow': 0})", 'sub', 'master')
        self.assertEqual(result['robot_model'], 'master')
        self.assertEqual(len(result['commands']), 3)
        self.assertEqual(result['commands'][1]['args'], {'axis': 'pitch', 'degrees': -5, 'duration_seconds': 1})
        for code in ["Agentech.use('navi')\nAgentech.movement_b()", "Agentech.move_arms_to(right=make_pose())", "Agentech.movement_b()\nAgentech.use('master')"]:
            with self.assertRaises(ValueError):
                compiler.compile_plan(code, 'sub', 'master')

    def test_connected_upper_body_presets_and_owner_commands(self):
        for name, args in [
            ('movement_a', {}), ('wave', {'hand': 'left'}), ('heart', {'hand': 'both', 'posture': 'stand'}),
            ('clap', {}), ('golf', {}), ('golf_put', {'operator_ready': True, 'include_stroke': True}),
            ('close_door', {'side': 'right', 'arm_duration_seconds': 10}),
            ('stiff', {'level': 'soft'}), ('stay', {'seconds': 3}), ('release_returned_hold', {}),
            ('status', {}), ('get_status', {}), ('get_motion_readiness', {}), ('action_catalog', {}),
        ]:
            with self.subTest(name=name): self.validate(name, args)
        for name, args in [('wave', {'hand': 'both'}), ('heart', {'posture': 'sit'}),
                           ('stay', {'seconds': 301}), ('stay', {'seconds': 0}),
                           ('golf_put', {'include_stroke': 1}), ('stiff', {'level': 'passive'}),
                           ('sit', {}), ('check_heart_support', {}), ('turn_head', {'angle_degrees': 5})]:
            with self.subTest(name=name, args=args), self.assertRaises(ValueError): self.validate(name, args)

    def test_compiler_normalizes_imported_enum_literals_and_standing_namespace(self):
        spec = importlib.util.spec_from_file_location('master_enum_compiler', SCRIPTS / 'compile-robot-plan.py')
        compiler = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(compiler)
        imports = 'from agentech import Agentech, right, left, both, stand, master\n'
        result = compiler.compile_plan(imports + 'Agentech.use(master)\nAgentech.standing_actions.wave(right)\nAgentech.heart(both, posture=stand)', 'sub', 'master')
        self.assertEqual([(c['name'], c['args']) for c in result['commands']], [('wave', {'hand': 'right'}), ('heart', {'hand': 'both', 'posture': 'stand'})])
        for source in ['Agentech.wave(right)', 'from agentech import right as chosen\nAgentech.wave(chosen)',
                       imports+'Agentech.seated_actions.heart()', imports+'Agentech.standing_actions.adjust_waist(yaw=1)',
                       imports+'Agentech.standing_actions.heart(posture=stand)', imports+'Agentech.wave(right.__class__)']:
            with self.subTest(source=source), self.assertRaises(ValueError): compiler.compile_plan(source, 'sub', 'master')

    def test_compiler_waist_undo_uses_only_prior_typed_result_bindings(self):
        spec = importlib.util.spec_from_file_location('master_result_compiler', SCRIPTS / 'compile-robot-plan.py')
        compiler = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(compiler)
        entry = 'Agentech.enter_stand_hand_guide("both")\n'
        program = entry + 'waist_move = Agentech.adjust_waist(yaw=2)\nAgentech.undo_waist(movement=waist_move)'
        plan = compiler.compile_plan(program, 'sub', 'master')
        self.assertEqual(plan['commands'][1]['save_result_as'], 'waist_move')
        self.assertEqual(plan['commands'][2]['args'], {'movement': {'$master_result': 'waist_move'}})
        from master_gateway_spec import validate_master_plan
        validate_master_plan(plan['commands'])
        for source in ['Agentech.undo_waist(waist_move)',
                       'waist_move = Agentech.return_waist_to_neutral()\nAgentech.undo_waist(waist_move)',
                       'waist_move = Agentech.adjust_waist(yaw=2)\nwaist_move = Agentech.adjust_waist(yaw=3)',
                       'waist_move = Agentech.adjust_waist(yaw=2)\nAgentech.undo_waist({"$master_result":"waist_move"})',
                       'waist_move = {"waistResultSignature":"fake"}\nAgentech.undo_waist(waist_move)']:
            with self.subTest(source=source), self.assertRaises(ValueError): compiler.compile_plan(entry + source, 'sub', 'master')
        for commands in [plan['commands'][::-1],
                         [{'name':'undo_waist','args':{'movement':{'$master_result':'missing'}}}],
                         [{'name':'return_waist_to_neutral','args':{},'save_result_as':'waist_move'},plan['commands'][1]],
                         [plan['commands'][0],plan['commands'][1],plan['commands'][1],plan['commands'][2]]]:
            with self.subTest(commands=commands), self.assertRaises(ValueError): validate_master_plan(commands)


if __name__ == '__main__':
    unittest.main()
