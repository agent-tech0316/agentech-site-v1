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
        result = compiler.compile_plan("from agentech import Agentech\nAgentech.use('master')\nAgentech.adjust_right_shoulder('pitch', -5, duration_seconds=1)\nAgentech.move_arms_to(right={'elbow': 0})", 'sub', 'master')
        self.assertEqual(result['robot_model'], 'master')
        self.assertEqual(len(result['commands']), 2)
        self.assertEqual(result['commands'][0]['args'], {'axis': 'pitch', 'degrees': -5, 'duration_seconds': 1})
        for code in ["Agentech.use('navi')\nAgentech.movement_b()", "Agentech.move_arms_to(right=make_pose())", "Agentech.movement_b()\nAgentech.use('master')"]:
            with self.assertRaises(ValueError):
                compiler.compile_plan(code, 'sub', 'master')


if __name__ == '__main__':
    unittest.main()
