"""Bundled, transport-free SDK and compiler check for a newly installed PC."""
import importlib
import json
from pathlib import Path
import sys

root=Path(sys.argv[1]).resolve()
sys.path[:0]=[str(root/'sdk'),str(root/'scripts')]
def forbid_transport(event,args):
    if event.startswith(('socket.','subprocess.','os.system','os.startfile')):
        raise RuntimeError('Package offline check cannot open a transport')
sys.addaudithook(forbid_transport)
from eaic_sdk_commands import CONTRACT,compile_sdk_plan,verify_runtime,ResultBudget
for model in ('master','navi','aegis'):verify_runtime(root/'sdk',model)
for name in ('paramiko','reportlab','PIL','numpy','cv2','obsws_python','agentech'):importlib.import_module(name)
plan=compile_sdk_plan('x=Agentech.read()\nAgentech.report(data=x)','package-check','navi')
from agentech import Agentech
Agentech.use('navi',dry_run=True)
snapshot=Agentech.read(live=False)
report=Agentech.report(data=snapshot)
budget=ResultBudget();budget.export(snapshot);budget.export(report)
print(json.dumps({'offline_check':'passed','sdk_revision':CONTRACT['revision'],
    'customer_commands':sum(e['policy']=='customer' for e in CONTRACT['entries']),
    'read_report_compiled':len(plan['commands'])==2,'read_report_exercised':True,
    'public_result_bytes':budget.bytes,'robot_commands_sent':False}))
