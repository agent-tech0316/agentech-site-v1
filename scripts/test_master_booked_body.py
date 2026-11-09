"""Offline tests of hash-bound extraction, native directory installation and booked execution."""
from contextlib import contextmanager
from datetime import datetime, timezone
from hashlib import sha256
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import wave
import zipfile

import master_booked_body as booked
import master_native_body as native
from test_master_native_body import runner


class LocalSftp:
    """Emulate standard SFTP exclusive creation and no-overwrite directory rename."""
    def __init__(self,root): self.root = root
    def path(self,p):
        assert p.startswith(booked.RESOURCES)
        return self.root / p.removeprefix(booked.RESOURCES).lstrip('/')
    def __enter__(self): return self
    def __exit__(self,*args): pass
    def lstat(self,p): return self.path(p).lstat()
    def listdir(self,p): return os.listdir(self.path(p))
    def mkdir(self,p): self.path(p).mkdir()
    def remove(self,p): self.path(p).unlink()
    def rmdir(self,p): self.path(p).rmdir()
    def open(self,p,mode): return self.path(p).open('xb' if mode=='wx' else mode)
    def get_channel(self): return Mock()
    def rename(self,a,b):
        if self.path(b).exists(): raise FileExistsError(b)
        self.path(a).rename(self.path(b))


class BookedMotion(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.sftp = LocalSftp(self.root/'resources')
        self.sftp.root.mkdir()
        self.id = 'b7f76821-a087-404e-a2ac-dfd7fe260aff'
        self.policy = b'fixture ONNX data for transport tests'
        self.clock = 1800000000.
        self.asset(False)
        self.env = patch.dict(os.environ)
        self.env.start()
        self.addCleanup(self.env.stop)
        os.environ.pop('AGENTECH_MASTER_CELL_INTERLOCK',None)

    def asset(self,audio):
        def member(name,data):
            return {'path':name,'bytes':len(data),'sha256':sha256(data).hexdigest()}
        m = {'asset_id':self.id,'kind':'Motion','model':'Master Ultra','frames':30,'audio':None,
             'policy':member('policy.onnx',self.policy)}
        raw = self.policy
        if audio:
            m['kind'] = 'Package'
            wav = io.BytesIO()
            with wave.open(wav,'wb') as out:
                out.setparams((1,2,16000,0,'NONE','not compressed')); out.writeframes(b'\0'*32000)
            m['audio'] = dict(member('track.wav',wav.getvalue()),seconds=1.)
            buf=io.BytesIO()
            with zipfile.ZipFile(buf,'w') as arc:
                arc.writestr('policy.onnx',raw);arc.writestr('track.wav',wav.getvalue());arc.writestr('preview.mp4','never install')
            raw = buf.getvalue()
        m['bytes'],m['asset_sha256'] = len(raw),sha256(raw).hexdigest()
        m['motion'] = 'linkcraft_resource_onnx_ffeaic'+m['asset_sha256']+'_0.0.1'
        self.path = self.root/'booked-upload'
        self.path.write_bytes(raw)
        self.m = m
        self.probe = {'model':'Master Ultra','frames':m['frames'],'policy_sha256':m['policy']['sha256'],'check':'ultra-closed-loop-simulation'}

    def test_private_bytes_checked_before_any_install(self):
        self.path.write_bytes(b'x'*self.m['bytes'])
        with self.assertRaisesRegex(ValueError,'digest'):
            booked.load_package(self.m,self.path)
        self.asset(True)
        self.m['policy']['sha256']='f'*64
        with self.assertRaisesRegex(ValueError,'digest|immutable'):
            booked.load_package(self.m,self.path)

    def test_atomic_install_is_exact_and_never_overwrites(self):
        self.asset(True)
        files=booked.load_package(self.m,self.path)
        with patch.object(self.sftp,'rename',side_effect=OSError('interrupted')):
            with self.assertRaisesRegex(OSError,'interrupted'): booked.install(self.sftp,self.m,files)
        self.assertEqual(list(self.sftp.root.rglob('policy.onnx')),[])
        target=booked.install(self.sftp,self.m,files)
        self.assertEqual(set(self.sftp.listdir(target)),{'audio.wav','policy.onnx'})
        self.assertEqual(booked.install(self.sftp,self.m,files),target)
        self.sftp.path(target+'/audio.wav').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'installed'): booked.install(self.sftp,self.m,files)
        self.assertEqual(self.sftp.path(target+'/audio.wav').read_bytes(),b'changed')

    def test_optional_facility_feed_and_its_failure_modes(self):
        self.assertIsNone(booked.cell_readiness(lambda:self.clock))
        path=self.root/'cell.json'
        os.environ['AGENTECH_MASTER_CELL_INTERLOCK']=str(path)
        with self.assertRaises(FileNotFoundError): booked.cell_readiness(lambda:self.clock)
        record={'schema':'eaic-cell-interlock-v1','serial':native.SPEC['serial'],'observed_at':runner._iso(self.clock),
                'perimeter_clear':True,'emergency_stop_ready':True,'protective_stop_active':False}
        path.write_text(json.dumps(record))
        self.assertEqual(booked.cell_readiness(lambda:self.clock),record['observed_at'])
        for update in ({'observed_at':runner._iso(self.clock+1)},{'observed_at':runner._iso(self.clock-3)},
                       {'serial':'other'},{'perimeter_clear':False},{'emergency_stop_ready':False},{'protective_stop_active':True}):
            path.write_text(json.dumps({**record,**update}))
            with self.assertRaises(ValueError): booked.cell_readiness(lambda:self.clock)

    def execute(self,response_error=None):
        m=self.m
        source=json.dumps({'asset_id':self.id,'asset_sha256':m['asset_sha256']})
        plan={'version':2,'robot_model':'master','submission_id':'master-body-v2-'+self.id,'source_sha256':sha256(source.encode()).hexdigest(),
              'asset_id':self.id,'commands':[{'name':'play_body','line':1,'args':{'motion_name':m['motion'],'audio_path':''}}],
              'native_body_manifest':m,'native_body_required_seconds':booked.required_seconds(m)}
        planfile=self.root/'plan.json';planfile.write_text(json.dumps(plan))
        deployment={'session_id':'23','attempt_id':'attempt','submission_id':plan['submission_id'],'source_sha256':plan['source_sha256'],
                    'plan_sha256':sha256(planfile.read_bytes()).hexdigest(),'sdk_root':str(self.root),'enabled':True,'schema_version':1,
                    'robot_model':'master','host':'mock','lease_file':str(self.root/'lease'),'native_body_start_policy':'signed_booking',
                    'scheduled_start':runner._iso(self.clock),'scheduled_end':runner._iso(self.clock+60),'native_body_asset_id':self.id,
                    'native_body_files':{'motion':str(self.path)},'native_body_manifest':m}
        cfg=self.root/'config.json';cfg.write_text(json.dumps(deployment))
        def sleep(n):self.clock+=n
        binding={'owner':'mc_ros2_node101','settled':True,'mode':'STAND_DEFAULT','player':0,'mc_stamp_ns':'1800000019990000000'}
        @contextmanager
        def observer(_,watch=False,**kw):
            self.assertEqual(kw,{'motion':m['motion'],'seconds':.6})
            out=io.StringIO(json.dumps({'native_motion':m['motion'],'joints_fault_free':True,'joint_faults':[],'joint_fault_count':0,
                'terminal_standing_observed':True,'peak_travel_rad':.12,'playing_seconds':.58,'final':dict(binding,mc_stamp_ns='1800000021000000000'),
                'native_transitions':[{'mode':'BMIMIC','motion':m['motion'],'player':2,'stamp_ns':'1800000020000000000'},
                    {'mode':'STAND_DEFAULT','motion':'','player':0,'stamp_ns':'1800000020600000000'}]})+'\n')
            out.channel=Mock()
            yield binding,out
        @contextmanager
        def speaker(_,digest):
            target=booked.RESOURCES+'/'+m['motion'].removesuffix('_0.0.1')+'/0.0.1/unzip/audio.wav'
            lines=(f'[2026-11-08 07:00:00.000000][Info] WAV params: sr=16000Hz, ch=1, bps=16, bytes=32000 file:{target}\n'
                   '[2026-11-08 07:00:00.010000][Info] AudioPlayer::pub_play_state tts state 1\n'
                   '[2026-11-08 07:00:01.010000][Info] AudioPlayer::pub_play_state tts state 2\n')
            yield io.BytesIO(lines.encode()),{'file':'audio.wav','sha256':digest,'board':'soc2','volume':50,'muted':False}
        client=SimpleNamespace(open_sftp=lambda:self.sftp)
        @contextmanager
        def connection(_):yield client
        def play(client,motion,path):
            self.assertEqual(motion,m['motion'])
            self.assertEqual(Path(path).name,'audio.wav' if m['audio'] else '')
            if response_error: raise response_error
            self.clock+=1.02
            return {'message':'Play success','robot_sn':native.SPEC['serial']}
        with patch.object(booked,'prepare',side_effect=lambda manifest,path:(booked.load_package(manifest,path),self.probe)), \
                patch.object(booked,'require_target'),patch.object(native,'connection',connection),patch.object(native,'observer',observer), \
                patch.object(native,'speaker_output',speaker),patch.object(native,'play_once',side_effect=play) as dispatched:
            rpt=runner.execute_plan(planfile,cfg,self.root/'receipt.json',body_booking_claimed_at=runner._iso(self.clock),
                first_command_not_before=runner._iso(self.clock+20),now=lambda:self.clock,sleep=sleep)
        return rpt,planfile,dispatched.call_count

    def test_native_entry_point_motion_only_and_bundled_audio(self):
        for audio in (False,True):
            self.asset(audio)
            rpt,planfile,count=self.execute()
            self.assertEqual(count,1)
            self.assertEqual(rpt['outcome'],'completed',rpt['error'])
            self.assertIs(rpt['commands'][0]['result']['music_played'],True if audio else None)
            code = ("import {verifyBodyReceipt} from './scripts/master-native-body.mjs'; import {readFileSync} from 'node:fs';"
                    "const [r,p]=process.argv.slice(1).map(x=>JSON.parse(readFileSync(x)));"
                    "if(!verifyBodyReceipt(r,p))process.exit(1);r.commands[0].result.policy_sha256='0'.repeat(64);"
                    "if(verifyBodyReceipt(r,p))process.exit(2);")
            subprocess.run(['node','--input-type=module','-e',code,str(self.root/'receipt.json'),str(planfile)],
                           cwd=booked.HERE.parent,check=True)

    def test_ambiguous_request_sent_once_failure_persisted(self):
        rpt,_,count=self.execute(TimeoutError('ambiguous request'))
        self.assertEqual(count,1)
        self.assertEqual(rpt['outcome'],'failed')
        self.assertFalse(rpt['handoff_ready'])
        self.assertTrue(rpt['commands'][0]['result']['request_attempted'])

    @unittest.skipUnless(os.environ.get('AGENTECH_MASTER_ULTRA_SIM_SCENE'),'requires vendor scene')
    def test_distinct_policy_through_bounded_worker(self):
        subprocess.run(['node','--input-type=module','-e',
            "import {policy} from './scripts/fixtures/master-policy-fixture.mjs';import {writeFileSync} from 'node:fs';"
            "writeFileSync(process.argv[1],policy({shoulderAction:.5,phaseFrames:30,frames:'30'}));",str(self.root/'fixture.onnx')],
            cwd=booked.HERE.parent,check=True)
        self.policy=(self.root/'fixture.onnx').read_bytes();self.asset(False)
        _,evidence = booked.prepare(self.m,self.path)
        self.assertEqual(evidence,self.probe)
        self.m['frames']+=1
        with self.assertRaisesRegex(ValueError,'frame count'):
            booked.prepare(self.m,self.path)
