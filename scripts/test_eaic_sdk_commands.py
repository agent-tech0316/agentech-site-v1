"""Offline contract and trust-boundary checks; no robot transport is used."""
import hashlib
import inspect
import json
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace

sys.path.insert(0,str(Path(__file__).resolve().parent))
from eaic_sdk_commands import CONTRACT,ENTRIES,compile_sdk_plan,bind,invoke,public_result,validate_plan,verify_runtime

class SdkContractTests(unittest.TestCase):
    def test_inventory_policy_and_hash(self):
        c=dict(CONTRACT);digest=c.pop('hash')
        self.assertEqual(digest,hashlib.sha256(json.dumps(c,sort_keys=True,separators=(',',':')).encode()).hexdigest())
        self.assertEqual(len(ENTRIES),len(CONTRACT['entries']))
        for e in ENTRIES.values():
            with self.subTest(e=e['id']):
                if e['policy']!='customer':
                    with self.assertRaises(ValueError):bind(e['robot'],e['method'],[],{})
                self.assertIn(e['effect'],{'local','observe','action'})
        self.assertEqual(ENTRIES['master:standing_actions.teach_wrist']['policy'],'operator')

    def test_read_report_preserves_result_reference_and_varargs(self):
        plan=compile_sdk_plan('data = Agentech.read()\nAgentech.report(data=data)\n','sub','navi')
        self.assertEqual(plan['commands'][1]['args']['data'],{'$sdk_result':'data'})
        columns=compile_sdk_plan('Agentech.read("position", "velocity")','sub','master')
        self.assertEqual(columns['commands'][0]['positional'],['position','velocity'])

    def test_forbidden_code_arguments_and_reference_forgery(self):
        cases=[('Agentech.read(host="other")','navi'),('Agentech.report(data={"qualified":True})','navi'),
            ('Agentech.read(recording="../outside")','master'),('Agentech.report(data={"$sdk_result":"x"})','navi'),
            ('Agentech.joint_trajectory(path="a.csv")','navi'),('Agentech.do_action(260)','navi'),
            ('Agentech.__class__()','navi'),('import os\nos.system("x")','navi'),
            ('Agentech.standing_actions.teach_wrist("right")','master'),
            ('Agentech.run_sequence([{ "action":"robot", "params":{} }])','aegis'),
            ('Agentech.read()\nAgentech.turn_head(1000)','master'),
            ('Agentech.seated_actions.turn_head(5)\nAgentech.wave("right")','master')]
        for source,model in cases:
            with self.subTest(source=source),self.assertRaises((ValueError,TypeError,SyntaxError)):
                compile_sdk_plan(source,'sub',model)

    def test_runtime_drift_and_plan_drift_rejected(self):
        plan=compile_sdk_plan('Agentech.read()','sub','navi');plan['sdk_contract']='0'*64
        with self.assertRaises(ValueError):validate_plan(plan)
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'agentech/robots/navi/api.py';path.parent.mkdir(parents=True);path.write_text('# drift')
            with self.assertRaises(ValueError):verify_runtime(tmp,'navi')

    def test_dispatch_and_result_chaining_without_exec(self):
        observed=[]
        class Robot:
            def read(self):return {'battery':38,'real':False}
            def report(self,*,data):observed.append(data);return {'snapshot':data}
        plan=compile_sdk_plan('x=Agentech.read()\nAgentech.report(data=x)','sub','navi')
        values={}
        with tempfile.TemporaryDirectory() as tmp:
            for c in plan['commands']:
                result=invoke(Robot(),'navi',c,values,tmp)
                if c.get('save_result_as'):values[c['save_result_as']]=result
        self.assertIs(observed[0],values['x'])

    def test_seated_customer_cannot_start_or_replace_controller(self):
        state={'pid':7,'active':True,'phase':'holding','upper_body_powered':True}
        class Control:
            def status(self):return dict(state)
            def start(self):raise AssertionError('controller start forbidden')
        class Robot:
            def __init__(self):self.seated_actions=SimpleNamespace(turn_head=self.turn)
            def seated_status(self):return dict(state)
            def _seated_control(self):return Control()
            def turn(self,degrees):
                self._seated_control().start()
                return {'measured_endpoint_verified':True,'dry_run':False}
        robot=Robot();original=robot._seated_control
        with tempfile.TemporaryDirectory() as tmp:
            result=invoke(robot,'master',{'name':'seated_actions.turn_head','args':{'degrees':5},'positional':[]},{},tmp)
            self.assertEqual(result['gateway_seated_owner_before'],result['gateway_seated_owner_after'])
            state['phase']='failed'
            with self.assertRaises(RuntimeError):invoke(robot,'master',{'name':'seated_actions.turn_head','args':{'degrees':5},'positional':[]},{},tmp)
        self.assertEqual(robot._seated_control,original)

    def test_local_plan_data_is_not_reported_as_physical_completion(self):
        robot=SimpleNamespace(plan_arm_stiffness_transition=lambda **kwargs:{'dry_run':True})
        with tempfile.TemporaryDirectory() as tmp:
            result=invoke(robot,'master',{'name':'plan_arm_stiffness_transition','args':{},'positional':[]},{},tmp)
        self.assertTrue(result['dry_run'])

    def test_public_results_bound_and_redact(self):
        result=public_result({'host':'192.168.1.2','access_token':'private','battery':38,'path':'C:/private/file.json'})
        self.assertEqual(result,{'battery':38,'path':{'artifact_name':'file.json'}})
        with self.assertRaises(ValueError):public_result('x'*33000)

if __name__=='__main__':unittest.main()
